import { stableJsonHash } from "./crypto";
import { assertDomain, requiredString } from "./domain";
import { localPaymentGateway } from "./integrations";
import { audit, enqueue } from "./outbox";
import { all, batch, first, type SqlValue } from "./sql";
import { isCadenceDue } from "./time";
import { getBusinessSettings } from "./settings";
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

function weekdayDates(month: string, weekday: number): string[] {
  const [year, monthNumber] = month.split("-").map(Number);
  const result: string[] = [];
  for (let day = 1; ; day += 1) {
    const value = new Date(Date.UTC(year, monthNumber - 1, day, 12));
    if (value.getUTCMonth() !== monthNumber - 1) break;
    if (value.getUTCDay() === weekday) result.push(value.toISOString().slice(0, 10));
  }
  return result;
}

export async function generateMonthlyBilling(rawMonth: unknown, rawKey: string | null) {
  const month = assertMonth(rawMonth);
  const key = requiredString(rawKey, "Idempotency-Key", 200);
  assertDomain(key.length >= 8, "IDEMPOTENCY_KEY_REQUIRED", "Idempotency-Key must contain at least 8 characters.", 422);
  const requestHash = await stableJsonHash({ month });
  const replay = await first<{ request_hash: string; response_json: string | null } & Record<string, unknown>>("SELECT request_hash, response_json FROM idempotency_keys WHERE namespace = 'monthly-billing' AND key = ?", key);
  if (replay) {
    assertDomain(replay.request_hash === requestHash, "IDEMPOTENCY_CONFLICT", "This Idempotency-Key was used for another billing month.", 409);
    return replay.response_json ? JSON.parse(replay.response_json) : { month, status: "processing" };
  }

  const settings = await getBusinessSettings();
  const deliveryDates = weekdayDates(month, settings.deliveryWeekday);
  const subscriptions = await all<BillingSubscription>("SELECT s.*, c.source_json FROM subscriptions s JOIN customers c ON c.id = s.customer_id WHERE s.status IN ('active', 'paused') AND substr(s.started_at, 1, 7) <= ? ORDER BY s.id", month);
  const results: Array<Record<string, unknown>> = [];
  for (const subscription of subscriptions) {
    const orderKey = `billing:${month}:${subscription.id}`;
    const alreadyBilled = await first<Record<string, unknown>>("SELECT id, order_number, total_minor, payment_status FROM orders WHERE subscription_id = ? AND kind = 'subscription_invoice' AND substr(delivery_date, 1, 7) = ? LIMIT 1", subscription.id, month);
    if (alreadyBilled) {
      results.push({ subscriptionId: subscription.id, skipped: "already_billed", order: alreadyBilled });
      continue;
    }
    const items = await all<BillingItem>("SELECT si.id, si.product_id, p.name AS product_name, p.unit_label, COALESCE(p.subscription_price_minor, p.price_minor) AS price_minor, p.cost_minor, p.packaging_cost_minor, si.quantity, si.cadence, si.cadence_anchor_date FROM subscription_items si JOIN products p ON p.id = si.product_id WHERE si.subscription_id = ? AND si.status = 'active'", subscription.id);
    const skips = new Set((await all<{ delivery_date: string } & Record<string, unknown>>("SELECT delivery_date FROM subscription_skips WHERE subscription_id = ? AND substr(delivery_date, 1, 7) = ?", subscription.id, month)).map((row) => row.delivery_date));
    const effectiveDates = deliveryDates.filter((date) => date >= subscription.next_delivery_date && !skips.has(date) && (subscription.status === "active" || !subscription.pause_until || date >= subscription.pause_until));
    const lines = items.map((item) => {
      const occurrences = effectiveDates.filter((date) => isCadenceDue(item.cadence_anchor_date, date, item.cadence)).length;
      return { item, occurrences, lineTotalMinor: item.price_minor * item.quantity * occurrences };
    }).filter((line) => line.occurrences > 0);
    const billedDeliveryDates = effectiveDates.filter((date) => items.some((item) => isCadenceDue(item.cadence_anchor_date, date, item.cadence)));
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
    const hash = await stableJsonHash({ month, subscriptionId: subscription.id });
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
    for (const line of lines) statements.push({ sql: "INSERT INTO order_items (id, order_id, product_id, product_name, unit_label, quantity, unit_price_minor, unit_cost_minor, unit_packaging_cost_minor, total_cost_minor, line_total_minor, purchase_type, cadence) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'subscription', ?)", bindings: [crypto.randomUUID(), orderId, line.item.product_id, line.item.product_name, line.item.unit_label, line.item.quantity, line.item.price_minor, line.item.cost_minor, line.item.packaging_cost_minor, (line.item.cost_minor + line.item.packaging_cost_minor) * line.item.quantity * line.occurrences, line.lineTotalMinor, line.item.cadence] });
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
      await batch(statements);
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
