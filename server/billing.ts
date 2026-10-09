import { reserveInventory } from "./inventory";
import { effectivePrice } from "./product-details";
import { createPackageStatements, openPackage, packageDates, packageOccurrences } from "./packages";
import { mutationGuard } from "./mutation-guard";
import { stableJsonHash } from "./crypto";
import { assertDomain, requiredString } from "./domain";
import { localPaymentGateway } from "./integrations";
import { audit, enqueue } from "./outbox";
import { all, batch, first, type SqlValue } from "./sql";
import { localDateAt } from "./time";
import { getBusinessSettings, getNextDeliveryWindow } from "./settings";
import { purchaseAnalyticsEvent } from "./analytics";

interface BillingSubscription extends Record<string, unknown> {
  id: string; customer_id: string; payment_method: "card" | "cash"; payment_provider_ref: string | null;
  status: "active" | "paused"; pause_until: string | null; next_delivery_date: string; started_at: string;
  source_json: string;
}

interface BillingItem extends Record<string, unknown> {
  id: string; product_id: string; product_name: string; unit_label: string; price_minor: number;
  cost_minor: number; packaging_cost_minor: number;
  quantity: number; cadence: "weekly" | "biweekly"; cadence_anchor_date: string;
}

interface CreditRow extends Record<string, unknown> { id: string; amount_minor: number }

function assertMonth(value: unknown): string {
  assertDomain(typeof value === "string" && /^\d{4}-\d{2}$/.test(value), "VALIDATION_ERROR", "month must be YYYY-MM.", 422);
  const month = Number(value.slice(5));
  assertDomain(month >= 1 && month <= 12, "VALIDATION_ERROR", "month is invalid.", 422);
  return value;
}

export async function generateMonthlyBilling(rawMonth: unknown, rawKey: string | null, onlySubscriptionId?: string) {
  const month = assertMonth(rawMonth);
  const key = requiredString(rawKey, "Idempotency-Key", 200);
  assertDomain(key.length >= 8, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key must contain at least 8 characters.", 422);
  const requestHash = await stableJsonHash({ month, ...(onlySubscriptionId ? {subscriptionId: onlySubscriptionId} : {}) });
  const replay = await first<{ request_hash: string; response_json: string | null } & Record<string, unknown>>("SELECT request_hash, response_json FROM idempotency_keys WHERE namespace = 'monthly-billing' AND key = ?", key);
  if (replay) {
    assertDomain(replay.request_hash === requestHash, "IDEMPOTENCY_CONFLICT", "This Idempotency-Key was used for another billing month.", 409);
    return replay.response_json ? JSON.parse(replay.response_json) : { month, status: "processing" };
  }

  const settings = await getBusinessSettings();
  const nextWindow = await getNextDeliveryWindow();
  const subscriptions = await all<BillingSubscription>("SELECT s.*, COALESCE((SELECT o.source_json FROM orders o WHERE o.subscription_id = s.id ORDER BY o.created_at, o.id LIMIT 1), c.source_json) AS source_json FROM subscriptions s JOIN customers c ON c.id = s.customer_id WHERE s.renewal_enabled = 1 AND s.status IN ('active', 'paused') AND substr(s.started_at, 1, 7) <= ? ORDER BY s.id", month);
  const results: Array<Record<string, unknown>> = [];
  for (const subscription of subscriptions) {
    if (onlySubscriptionId && subscription.id !== onlySubscriptionId) continue;
    if (await openPackage(subscription.id)) {
      results.push({ subscriptionId: subscription.id, skipped: "unfinished_package" });
      continue;
    }
    if ((subscription.status === "paused" && (!subscription.pause_until || subscription.pause_until > localDateAt())) || subscription.next_delivery_date.slice(0, 7) > month) {
      results.push({ subscriptionId: subscription.id, skipped: "not_due" });
      continue;
    }
    const legacy = await first<Record<string, unknown>>("SELECT id FROM orders WHERE subscription_id = ? AND kind = 'subscription_invoice' AND fulfillment_status != 'cancelled' AND NOT EXISTS (SELECT 1 FROM subscription_packages WHERE subscription_id = ?) LIMIT 1", subscription.id, subscription.id);
    if (legacy) { results.push({subscriptionId: subscription.id, skipped: "legacy_review_required"}); continue; }
    const firstDate = subscription.next_delivery_date < nextWindow.deliveryDate ? nextWindow.deliveryDate : subscription.next_delivery_date;
    const orderKey = `package:${subscription.id}:${firstDate}`;
    const alreadyBilled = await first<Record<string, unknown>>("SELECT id FROM orders WHERE idempotency_key = ?", orderKey);
    if (alreadyBilled) { results.push({subscriptionId: subscription.id, skipped: "already_billed"}); continue; }
    const items = await all<BillingItem>("SELECT si.id, si.product_id, p.name AS product_name, p.unit_label, COALESCE(p.subscription_price_minor, p.price_minor) AS price_minor, p.sale_subscription_price_minor, p.sale_starts_at, p.sale_ends_at, p.cost_minor, p.packaging_cost_minor, p.is_active, p.allow_subscription, si.quantity, si.cadence, si.cadence_anchor_date FROM subscription_items si JOIN products p ON p.id = si.product_id WHERE si.subscription_id = ? AND si.status = 'active'", subscription.id);
    if (!items.length || items.some(item => !item.is_active || !item.allow_subscription)) {
      results.push({subscriptionId: subscription.id, skipped: "product_unavailable", message: "Proverite proizvode pre obnove paketa."});
      continue;
    }
    for (const item of items) item.price_minor = effectivePrice(item,true);
    const lines = items.map(item => ({ item, occurrences: packageOccurrences(item.cadence), lineTotalMinor: item.price_minor * item.quantity * packageOccurrences(item.cadence) }));
    const billedDeliveryDates = [...new Set(items.flatMap(item => packageDates(firstDate, item.cadence, settings.holidays)))].sort();
    const productsSubtotalMinor = lines.reduce((sum, line) => sum + line.lineTotalMinor, 0);
    const credits = await all<CreditRow>("SELECT id, amount_minor FROM credits_ledger WHERE customer_id = ? AND status = 'open' AND (subscription_id = ? OR subscription_id IS NULL) ORDER BY created_at, id", subscription.customer_id, subscription.id);
    const creditNet = credits.reduce((sum, credit) => sum + credit.amount_minor, 0);
    if (productsSubtotalMinor === 0 && creditNet >= 0) {
      results.push({ subscriptionId: subscription.id, skipped: "no_billable_deliveries" });
      continue;
    }
    const debitAdjustmentMinor = Math.max(0, -creditNet);
    const subtotalMinor = productsSubtotalMinor + debitAdjustmentMinor;
    const deliveryFeeMinor = settings.deliveryFeeMinor > 0 && !(settings.freeDeliveryThresholdMinor > 0 && productsSubtotalMinor >= settings.freeDeliveryThresholdMinor)
      ? settings.deliveryFeeMinor * billedDeliveryDates.length
      : 0;
    const creditAppliedMinor = Math.min(subtotalMinor + deliveryFeeMinor, Math.max(0, creditNet));
    const totalMinor = subtotalMinor + deliveryFeeMinor - creditAppliedMinor;
    const creditRemainderMinor = Math.max(0, creditNet - creditAppliedMinor);
    const hash = await stableJsonHash({ firstDate, subscriptionId: subscription.id });
    const orderId = `ord_${hash.slice(0, 32)}`;
    const orderNumber = `MM-${month.replace("-", "")}-${hash.slice(0, 8).toUpperCase()}`;
    const payment = totalMinor === 0
      ? { status: "paid" as const, providerReference: "credit_balance" }
      : subscription.payment_method === "card" && !subscription.payment_provider_ref
      ? { status: "failed" as const, providerReference: "missing_payment_method" }
      : await localPaymentGateway.authorize({ idempotencyKey: orderKey, orderId, amountMinor: totalMinor, currency: "RSD", method: subscription.payment_method, paymentToken: subscription.payment_provider_ref ?? undefined });
    const now = new Date().toISOString();
    const deliveryDate = billedDeliveryDates[0] ?? `${month}-01`;
    const paymentFeeMinor = subscription.payment_method === "card" ? Math.round(totalMinor * settings.paymentFeeBps / 10_000) : 0;
    const estimatedDeliveryCostMinor = settings.estimatedDeliveryCostMinor * Math.max(1, billedDeliveryDates.length);
    const statements: Array<{ sql: string; bindings?: SqlValue[] }> = [
      { sql: "INSERT INTO orders (id, order_number, customer_id, subscription_id, kind, payment_method, payment_provider_ref, payment_status, fulfillment_status, delivery_date, subtotal_minor, delivery_fee_minor, payment_fee_minor, estimated_delivery_cost_minor, credit_applied_minor, total_minor, currency, source_json, idempotency_key, created_at, updated_at) VALUES (?, ?, ?, ?, 'subscription_invoice', ?, ?, ?, 'planned', ?, ?, ?, ?, ?, ?, ?, 'RSD', ?, ?, ?, ?)", bindings: [orderId, orderNumber, subscription.customer_id, subscription.id, subscription.payment_method, payment.providerReference, payment.status, deliveryDate, subtotalMinor, deliveryFeeMinor, paymentFeeMinor, estimatedDeliveryCostMinor, creditAppliedMinor, totalMinor, subscription.source_json || "{}", orderKey, now, now] },
    ];
    statements.push({ sql: "UPDATE orders SET shipping_json = (SELECT shipping_json FROM subscriptions WHERE id = ?), billing_json = (SELECT billing_json FROM subscriptions WHERE id = ?) WHERE id = ?", bindings: [subscription.id, subscription.id, orderId] });
    for (const line of lines) statements.push({ sql: "INSERT INTO order_items (id, order_id, product_id, product_name, unit_label, quantity, unit_price_minor, unit_cost_minor, unit_packaging_cost_minor, total_cost_minor, line_total_minor, purchase_type, cadence) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'subscription', ?)", bindings: [crypto.randomUUID(), orderId, line.item.product_id, line.item.product_name, line.item.unit_label, line.item.quantity, line.item.price_minor, line.item.cost_minor, line.item.packaging_cost_minor, (line.item.cost_minor + line.item.packaging_cost_minor) * line.item.quantity * line.occurrences, line.lineTotalMinor, line.item.cadence] });
    statements.push({sql: "UPDATE order_items SET fiscal_tax_label = (SELECT fiscal_tax_label FROM products WHERE products.id = order_items.product_id) WHERE order_id = ?", bindings: [orderId]});
    statements.push(...createPackageStatements(orderId, subscription.id, firstDate));
    statements.push(...await reserveInventory(orderId,items.map(item=>({productId:item.product_id,quantity:item.quantity*packageOccurrences(item.cadence),lastDate:packageDates(firstDate,item.cadence,settings.holidays).at(-1)!}))));
    statements.push({sql: "UPDATE subscriptions SET next_delivery_date = ?, version = version + 1 WHERE id = ?", bindings: [firstDate, subscription.id]});
    for (const credit of credits) statements.push({ sql: "UPDATE credits_ledger SET status = 'applied', order_id = ?, applied_at = ? WHERE id = ? AND status = 'open'", bindings: [orderId, now, credit.id] });
    if (creditRemainderMinor > 0) statements.push({ sql: "INSERT INTO credits_ledger (id, customer_id, subscription_id, order_id, amount_minor, reason, status) VALUES (?, ?, ?, ?, ?, 'credit_carry_forward', 'open')", bindings: [crypto.randomUUID(), subscription.customer_id, subscription.id, orderId, creditRemainderMinor] });
    const summary = { orderId, orderNumber, subscriptionId: subscription.id, productsSubtotalMinor, deliveryFeeMinor, deliveryOccurrences: billedDeliveryDates.length, debitAdjustmentMinor, creditAppliedMinor, creditRemainderMinor, totalMinor, currency: "RSD", paymentStatus: payment.status, providerReference: payment.providerReference };
    statements.push(audit("system", "monthly-billing-job", "billing.invoice_created", "order", orderId, null, summary));
    statements.push(enqueue("billing.invoice_created", "order", orderId, summary));
    statements.push(enqueue(payment.status === "paid" ? "payment.captured" : payment.status === "pending" ? "payment.cash_due" : "payment.method_required", "order", orderId, summary));
    if (payment.status === "paid") {
      statements.push(enqueue("fiscal.receipt.requested", "order", orderId, summary));
      statements.push(purchaseAnalyticsEvent(orderId, orderNumber, "monthly-billing"));
    }
    statements.push(enqueue("email.invoice.requested", "order", orderId, summary));
    try {
      const guard = mutationGuard("EXISTS (SELECT 1 FROM subscriptions WHERE id = ? AND version = ? AND renewal_enabled = 1 AND status IN ('active', 'paused')) AND NOT EXISTS (SELECT 1 FROM subscription_packages WHERE subscription_id = ? AND status = 'open')", [subscription.id, Number(subscription.version), subscription.id]);
      await batch([guard.check, ...statements, guard.cleanup]);
      results.push(summary);
    } catch (error) {
      const raced = await first<Record<string, unknown>>("SELECT id, order_number, total_minor, payment_status FROM orders WHERE idempotency_key = ?", orderKey);
      if (raced) results.push({ subscriptionId: subscription.id, skipped: "already_billed", order: raced });
      else throw error;
    }
  }
  const response = { month, currency: "RSD", processed: results.length, results };
  await batch([
    { sql: "INSERT INTO idempotency_keys (id, namespace, key, request_hash, response_json, status_code, expires_at) VALUES (?, 'monthly-billing', ?, ?, ?, 200, ?)", bindings: [crypto.randomUUID(), key, requestHash, JSON.stringify(response), new Date(Date.now() + 400 * 86_400_000).toISOString()] },
    audit("system", "monthly-billing-job", "billing.month_completed", "billing_month", month, null, { processed: results.length }),
  ]);
  return response;
}
