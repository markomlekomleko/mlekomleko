import { randomToken } from "./crypto";
import { DomainError, assertDomain, optionalString, requiredString } from "./domain";
import { mutationGuard } from "./mutation-guard";
import { audit } from "./outbox";
import { getBusinessSettings } from "./settings";
import { all, batch, first, type Row, type SqlValue } from "./sql";
import { localDateAt } from "./time";

/** Realized (confirmed) deliveries needed for one reward. */
export const LOYALTY_TARGET = 12;
export const LOYALTY_GIFT_QUANTITY = 2;
const DEFAULT_GIFT_PRODUCT_ID = "prod_kravlje_1l";
const DEFAULT_DELIVERY_DISCOUNT_MINOR = 35_000;
export const LOYALTY_UNLOCKED_TOPIC = "email.loyalty_reward_unlocked.requested";

type Statement = { sql: string; bindings?: SqlValue[] };
export type LoyaltyStatus = "unlocked" | "claimed" | "applied" | "used";

export interface LoyaltyContext {
  startDate: string;
  giftProductId: string;
  giftQuantity: number;
  deliveryDiscountMinor: number;
}

/**
 * The program start is its own server-side setting (`loyaltyStartDate`), written by migration 0023
 * on the day the program is activated. Deliveries before it never count, for old and new subscribers.
 */
export async function loyaltyContext(): Promise<LoyaltyContext> {
  const settings = await getBusinessSettings() as unknown as Record<string, unknown>;
  const start = typeof settings.loyaltyStartDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(settings.loyaltyStartDate) ? settings.loyaltyStartDate : localDateAt();
  const giftProductId = typeof settings.loyaltyGiftProductId === "string" && settings.loyaltyGiftProductId ? settings.loyaltyGiftProductId : DEFAULT_GIFT_PRODUCT_ID;
  const fee = Number(settings.deliveryFeeMinor);
  return { startDate: start, giftProductId, giftQuantity: LOYALTY_GIFT_QUANTITY, deliveryDiscountMinor: Number.isSafeInteger(fee) && fee > 0 ? fee : DEFAULT_DELIVERY_DISCOUNT_MINOR };
}

/**
 * One realized delivery = one confirmed (delivered) subscription visit on a distinct date since the
 * program start. Skips and pauses create no delivery order; failed or merely packed visits do not count.
 */
const REALIZED_SQL = `(SELECT COUNT(DISTINCT d.delivery_date) FROM delivery_orders dor JOIN deliveries d ON d.id = dor.delivery_id
  WHERE dor.customer_id = ? AND dor.status = 'delivered' AND dor.subscription_id IS NOT NULL AND d.delivery_date >= ?)`;

export async function realizedDeliveries(customerId: string, startDate: string) {
  const row = await first<Row>(`SELECT ${REALIZED_SQL} AS realized`, customerId, startDate);
  return Number(row?.realized ?? 0);
}

/**
 * Unlocks the next cycle's reward inside the caller's transaction when the realized count reaches
 * 12 × cycle. The reward row, its audit entry and the email job commit together or not at all; a
 * concurrent duplicate hits UNIQUE(customer_id, cycle_number), so the audit and email inserts that
 * depend on this row's id add nothing.
 */
export function unlockStatements(customer: { id: string; email: string; full_name?: unknown }, context: LoyaltyContext): Statement[] {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const payload = JSON.stringify({ rewardId: id, customerId: customer.id, email: customer.email, fullName: customer.full_name ?? null, giftQuantity: context.giftQuantity, deliveryDiscountMinor: context.deliveryDiscountMinor });
  return [
    {
      sql: `INSERT INTO loyalty_rewards (id, customer_id, cycle_number, gift_product_id, gift_quantity, delivery_discount_minor, unlocked_at)
        SELECT ?, ?, n.next_cycle, ?, ?, ?, ? FROM (SELECT COUNT(*) + 1 AS next_cycle FROM loyalty_rewards WHERE customer_id = ?) n
        WHERE ${REALIZED_SQL} >= ? * n.next_cycle ON CONFLICT DO NOTHING`,
      bindings: [id, customer.id, context.giftProductId, context.giftQuantity, context.deliveryDiscountMinor, now, customer.id, customer.id, context.startDate, LOYALTY_TARGET],
    },
    {
      sql: "INSERT INTO audit_log (id, actor_type, actor_id, action, entity_type, entity_id, before_json, after_json) SELECT ?, 'system', 'loyalty-program', 'loyalty.reward_unlocked', 'loyalty_reward', id, NULL, ? FROM loyalty_rewards WHERE id = ?",
      bindings: [crypto.randomUUID(), payload, id],
    },
    {
      sql: `INSERT INTO outbox (id, topic, aggregate_type, aggregate_id, payload_json, idempotency_key, available_at)
        SELECT ?, ?, 'customer', customer_id, ?, 'loyalty-unlocked:' || id, ? FROM loyalty_rewards WHERE id = ? ON CONFLICT(idempotency_key) DO NOTHING`,
      bindings: [crypto.randomUUID(), LOYALTY_UNLOCKED_TOPIC, payload, now, id],
    },
  ];
}

/** Catch-up for any path that realized deliveries outside the completion batch (or a moved start date). */
export async function syncLoyalty(customerId: string) {
  const customer = await first<{ id: string; email: string } & Row>("SELECT id, email, full_name FROM customers WHERE id = ?", customerId);
  if (!customer) return;
  const context = await loyaltyContext();
  for (let step = 0; step < 20; step += 1) {
    const rewards = Number((await first<Row>("SELECT COUNT(*) AS count FROM loyalty_rewards WHERE customer_id = ?", customerId))?.count ?? 0);
    if (await realizedDeliveries(customerId, context.startDate) < LOYALTY_TARGET * (rewards + 1)) return;
    await batch(unlockStatements(customer, context));
  }
}

/** Statements for the delivery-completion batch: a handed-over gift consumes the reward exactly once. */
export function consumeRewardStatements(rewardId: string, deliveryOrderId: string): Statement[] {
  const now = new Date().toISOString();
  return [
    { sql: "UPDATE loyalty_rewards SET status = 'used', used_at = ?, used_delivery_order_id = ? WHERE id = ? AND status = 'applied'", bindings: [now, deliveryOrderId, rewardId] },
    // A package that was already paid gets the free delivery at its next charge/renewal (credit).
    // The partial unique index on credits_ledger.reason prevents a second deduction.
    { sql: "INSERT INTO credits_ledger (id, customer_id, subscription_id, amount_minor, reason, status) SELECT ?, customer_id, applied_subscription_id, delivery_discount_minor, 'loyalty_reward:' || id, 'open' FROM loyalty_rewards WHERE id = ? AND discount_status = 'pending' AND delivery_discount_minor > 0 ON CONFLICT DO NOTHING", bindings: [crypto.randomUUID(), rewardId] },
    { sql: "UPDATE loyalty_rewards SET discount_status = 'credited' WHERE id = ? AND discount_status = 'pending'", bindings: [rewardId] },
    { sql: "INSERT INTO audit_log (id, actor_type, actor_id, action, entity_type, entity_id, before_json, after_json) SELECT ?, 'system', 'loyalty-program', 'loyalty.reward_used', 'loyalty_reward', id, NULL, ? FROM loyalty_rewards WHERE id = ? AND used_delivery_order_id = ?", bindings: [crypto.randomUUID(), JSON.stringify({ deliveryOrderId }), rewardId, deliveryOrderId] },
  ];
}

/** Applied rewards whose gift is not already in a packed or handed-over visit on another date. */
export async function pendingGiftRewards(date: string) {
  return all<{ id: string; customer_id: string; applied_subscription_id: string | null; applied_order_id: string | null; gift_product_id: string; gift_quantity: number; product_name: string; unit_label: string } & Row>(
    `SELECT r.id, r.customer_id, r.applied_subscription_id, r.applied_order_id, r.gift_product_id, r.gift_quantity, p.name AS product_name, p.unit_label
     FROM loyalty_rewards r JOIN products p ON p.id = r.gift_product_id
     WHERE r.status = 'applied' AND NOT EXISTS (SELECT 1 FROM delivery_items di JOIN delivery_orders dor ON dor.id = di.delivery_order_id JOIN deliveries d ON d.id = dor.delivery_id
       WHERE di.loyalty_reward_id = r.id AND d.delivery_date != ? AND (dor.status = 'locked' OR (dor.status = 'delivered' AND COALESCE(di.delivered_quantity, di.quantity) > 0)))`,
    date,
  );
}

function rewardCode() {
  return `VERNOST-${randomToken(9).replace(/[^A-Za-z0-9]/g, "X").toUpperCase().slice(0, 10)}`;
}

function publicReward(row: Row, deliveryDate: string | null) {
  return {
    id: String(row.id),
    cycle: Number(row.cycle_number),
    status: String(row.status) as LoyaltyStatus,
    giftQuantity: Number(row.gift_quantity),
    giftProductName: String(row.product_name ?? ""),
    giftUnitLabel: String(row.unit_label ?? ""),
    deliveryDiscountMinor: Number(row.delivery_discount_minor),
    discountStatus: String(row.discount_status),
    unlockedAt: row.unlocked_at ?? null,
    claimedAt: row.claimed_at ?? null,
    appliedAt: row.applied_at ?? null,
    usedAt: row.used_at ?? null,
    deliveryDate,
  };
}

export async function getLoyalty(customerId: string) {
  await syncLoyalty(customerId);
  const context = await loyaltyContext();
  const realized = await realizedDeliveries(customerId, context.startDate);
  const rows = await all<Row>(`SELECT r.*, p.name AS product_name, p.unit_label, s.next_delivery_date, o.delivery_date AS order_delivery_date,
      (SELECT d.delivery_date FROM delivery_items di JOIN delivery_orders dor ON dor.id = di.delivery_order_id JOIN deliveries d ON d.id = dor.delivery_id
        WHERE di.loyalty_reward_id = r.id AND dor.status IN ('locked','delivered') AND COALESCE(di.delivered_quantity, di.quantity) > 0 ORDER BY d.delivery_date DESC LIMIT 1) AS packed_date
    FROM loyalty_rewards r JOIN products p ON p.id = r.gift_product_id
    LEFT JOIN subscriptions s ON s.id = r.applied_subscription_id LEFT JOIN orders o ON o.id = r.applied_order_id
    WHERE r.customer_id = ? ORDER BY r.cycle_number DESC`, customerId);
  const progress = Math.min(LOYALTY_TARGET, Math.max(0, realized - LOYALTY_TARGET * rows.length));
  const rewards = rows.map((row) => publicReward(row, row.status === "used" || row.status === "applied" ? String(row.packed_date ?? row.order_delivery_date ?? row.next_delivery_date ?? "") || null : null));
  return {
    target: LOYALTY_TARGET,
    startDate: context.startDate,
    realizedSinceStart: realized,
    progress,
    remaining: LOYALTY_TARGET - progress,
    gift: { quantity: context.giftQuantity, deliveryDiscountMinor: context.deliveryDiscountMinor },
    rewards,
    available: rewards.find((reward) => reward.status === "unlocked" || reward.status === "claimed") ?? null,
  };
}

async function ownedReward(customerId: string, rawId: unknown) {
  const id = requiredString(rawId, "rewardId", 100);
  // Bound to the account: another customer's id (or code) is indistinguishable from a missing one.
  const reward = await first<Row>("SELECT * FROM loyalty_rewards WHERE id = ? AND customer_id = ?", id, customerId);
  if (!reward) throw new DomainError("LOYALTY_REWARD_NOT_FOUND", "Nagrada nije pronađena na tvom nalogu.", 404);
  return reward;
}

/** „Preuzmi nagradu": the unlocked reward becomes a unique, single-use reward of this account. */
export async function claimReward(customerId: string, rawId: unknown) {
  const reward = await ownedReward(customerId, rawId);
  if (reward.status !== "unlocked") return { reward: reward.id, status: reward.status, replay: true };
  const now = new Date().toISOString();
  const guard = mutationGuard("EXISTS (SELECT 1 FROM loyalty_rewards WHERE id = ? AND customer_id = ? AND status = 'unlocked')", [String(reward.id), customerId]);
  try {
    await batch([guard.check,
      { sql: "UPDATE loyalty_rewards SET status = 'claimed', code = ?, claimed_at = ? WHERE id = ? AND customer_id = ? AND status = 'unlocked'", bindings: [rewardCode(), now, String(reward.id), customerId] },
      audit("customer", customerId, "loyalty.reward_claimed", "loyalty_reward", String(reward.id), { status: "unlocked" }, { status: "claimed" }),
      guard.cleanup]);
  } catch (error) {
    const current = await first<Row>("SELECT status FROM loyalty_rewards WHERE id = ?", String(reward.id));
    if (current && current.status !== "unlocked") return { reward: reward.id, status: current.status, replay: true };
    throw error;
  }
  return { reward: reward.id, status: "claimed" };
}

/**
 * „Iskoristi": the claimed reward is attached to the subscription's next realized delivery. A skip or
 * pause simply moves it with the subscription; it is consumed only when the gift is handed over.
 */
export async function applyReward(customerId: string, rawId: unknown, rawSubscriptionId: unknown) {
  const reward = await ownedReward(customerId, rawId);
  assertDomain(reward.status === "claimed" || reward.status === "unlocked", "LOYALTY_REWARD_UNAVAILABLE", reward.status === "used" ? "Nagrada je već iskorišćena." : "Nagrada je već primenjena na sledeću dostavu.", 409, { status: reward.status });
  const subscriptionId = optionalString(rawSubscriptionId, "subscriptionId", 100);
  const subscription = await first<Row>(
    `SELECT id FROM subscriptions WHERE customer_id = ? AND status IN ('active','paused') ${subscriptionId ? "AND id = ?" : ""} ORDER BY CASE status WHEN 'active' THEN 0 ELSE 1 END, next_delivery_date LIMIT 1`,
    customerId, ...(subscriptionId ? [subscriptionId] : []),
  );
  assertDomain(subscription, "LOYALTY_NO_DELIVERY", "Nagradu primenjujemo uz redovnu dostavu. Aktiviraj pretplatu ili je iskoristi pri sledećoj porudžbini.", 409);
  const now = new Date().toISOString();
  const guard = mutationGuard(
    "EXISTS (SELECT 1 FROM loyalty_rewards WHERE id = ? AND customer_id = ? AND status IN ('unlocked','claimed')) AND EXISTS (SELECT 1 FROM subscriptions WHERE id = ? AND customer_id = ? AND status IN ('active','paused')) AND NOT EXISTS (SELECT 1 FROM loyalty_rewards WHERE applied_subscription_id = ? AND status = 'applied')",
    [String(reward.id), customerId, String(subscription.id), customerId, String(subscription.id)],
  );
  try {
    await batch([guard.check,
      { sql: "UPDATE loyalty_rewards SET status = 'applied', code = COALESCE(code, ?), claimed_at = COALESCE(claimed_at, ?), applied_at = ?, applied_subscription_id = ? WHERE id = ? AND customer_id = ? AND status IN ('unlocked','claimed')", bindings: [rewardCode(), now, now, String(subscription.id), String(reward.id), customerId] },
      audit("customer", customerId, "loyalty.reward_applied", "loyalty_reward", String(reward.id), { status: reward.status }, { status: "applied", subscriptionId: subscription.id }),
      { sql: "UPDATE deliveries SET generation_key = ? || ':' || id WHERE status = 'open' AND delivery_date >= ?", bindings: [`loyalty:${crypto.randomUUID()}`, localDateAt()] },
      guard.cleanup]);
  } catch (error) {
    const current = await first<Row>("SELECT status FROM loyalty_rewards WHERE id = ?", String(reward.id));
    if (current?.status === "applied" || current?.status === "used") throw new DomainError("LOYALTY_REWARD_UNAVAILABLE", "Nagrada je već primenjena.", 409);
    if (await first("SELECT id FROM loyalty_rewards WHERE applied_subscription_id = ? AND status = 'applied'", String(subscription.id))) throw new DomainError("LOYALTY_ALREADY_APPLIED", "Uz sledeću dostavu već stiže jedna nagrada. Ovu iskoristi posle nje.", 409);
    throw error;
  }
  const { generateDelivery } = await import("./deliveries");
  const open = await all<{ delivery_date: string } & Row>("SELECT delivery_date FROM deliveries WHERE status = 'open' AND delivery_date >= ?", localDateAt());
  for (const { delivery_date: date } of open) await generateDelivery(date, `loyalty-refresh:${String(reward.id)}:${date}:${crypto.randomUUID()}`);
  return { reward: reward.id, status: "applied", subscriptionId: subscription.id };
}

/** Validates a reward chosen in cart/checkout for the signed-in account placing the order. */
export async function checkoutReward(rawId: unknown, session: { customerId: string; email: string } | null, orderEmail?: string) {
  if (rawId == null || rawId === "") return null;
  assertDomain(session, "AUTH_REQUIRED", "Prijavi se da iskoristiš nagradu za vernost.", 401);
  const reward = await ownedReward(session.customerId, rawId);
  assertDomain(reward.status === "unlocked" || reward.status === "claimed", "LOYALTY_REWARD_UNAVAILABLE", "Nagrada je već primenjena ili iskorišćena.", 409, { status: reward.status });
  if (orderEmail !== undefined) assertDomain(orderEmail.toLowerCase() === session.email.toLowerCase(), "LOYALTY_ACCOUNT_MISMATCH", "Nagrada važi samo za porudžbinu na tvom nalogu. Koristi email adresu naloga.", 403);
  const product = await first<Row>("SELECT name, unit_label FROM products WHERE id = ?", String(reward.gift_product_id));
  return { id: String(reward.id), status: String(reward.status), giftQuantity: Number(reward.gift_quantity), giftProductId: String(reward.gift_product_id), giftProductName: String(product?.name ?? ""), deliveryDiscountMinor: Number(reward.delivery_discount_minor) };
}

/** Checkout statements: the reward is bound to this order (and its subscription) atomically. */
export function checkoutRewardStatements(reward: { id: string }, customerId: string, orderId: string, subscriptionId: string | null, deductedMinor: number): Statement[] {
  const now = new Date().toISOString();
  const guard = mutationGuard("EXISTS (SELECT 1 FROM loyalty_rewards WHERE id = ? AND customer_id = ? AND status IN ('unlocked','claimed'))", [reward.id, customerId]);
  return [guard.check,
    { sql: "UPDATE loyalty_rewards SET status = 'applied', code = COALESCE(code, ?), claimed_at = COALESCE(claimed_at, ?), applied_at = ?, applied_subscription_id = ?, applied_order_id = ?, discount_order_id = ?, discount_status = ? WHERE id = ? AND customer_id = ? AND status IN ('unlocked','claimed')",
      bindings: [rewardCode(), now, now, subscriptionId, orderId, deductedMinor > 0 ? orderId : null, deductedMinor > 0 ? "deducted" : "pending", reward.id, customerId] },
    audit("customer", customerId, "loyalty.reward_applied", "loyalty_reward", reward.id, null, { status: "applied", orderId, subscriptionId, deliveryDiscountMinor: deductedMinor }),
    guard.cleanup];
}
