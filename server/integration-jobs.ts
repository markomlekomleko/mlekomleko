import { queueSmsUpdate, deliverSms } from "./sms-updates";
import { issueFiscomm, receiptOperation } from "./fiscomm";
import { dispatchPurchaseAnalytics } from "./marketing-purchase";
import { issueFiscalReceipt } from "./fiscal-receipts";
import { env } from "@/server/runtime";
import { readIntegrationConfig, publicIntegrationStatus } from "../integrations/config.mjs";
import { DomainError, assertDomain } from "./domain";
import { renderTransactionalMessage, renderWhatsAppUpdate } from "./notifications";
import { enqueueOnce } from "./outbox";
import { all, batch, first, run } from "./sql";
import { addLocalDays, assertLocalDate, localDateAt } from "./time";
import { sendEmailMessage, sendWhatsAppTemplate } from "./messaging";

interface OutboxRow extends Record<string, unknown> {
  id: string; topic: string; aggregate_type: string; aggregate_id: string; payload_json: string;
  idempotency_key: string | null; attempts: number;
}

interface OrderRow extends Record<string, unknown> {
  id: string; order_number: string; kind: string; payment_method: "card" | "cash"; payment_status: string;
  delivery_date: string; subtotal_minor: number; discount_minor: number; delivery_fee_minor: number; credit_applied_minor: number; total_minor: number;
  customer_id: string; email: string; full_name: string;
  source_json: string;
}

interface OrderItemRow extends Record<string, unknown> {
  product_id: string; product_name: string; unit_label: string; quantity: number; unit_price_minor: number; line_total_minor: number; badi_sku: number | null;
}

type RuntimeEnv = Record<string, string | undefined> & {
  APP_ORIGIN?: string;
  BADI_MODE?: string; BADI_API_KEY?: string; BADI_API_SECRET?: string; BADI_CLIENT_ID?: string; BADI_LOCAL_BASE_URL?: string;
  BADI_DELIVERY_SKU?: string; BADI_ADJUSTMENT_SKU?: string; EMAIL_MODE?: string; EMAIL_PROVIDER?: string; EMAIL_API_KEY?: string; EMAIL_FROM?: string;
  GA4_MEASUREMENT_ID?: string; NEXT_PUBLIC_GA4_MEASUREMENT_ID?: string; GA4_API_SECRET?: string;
};

class IntegrationError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = "IntegrationError"; }
}

function runtimeEnv(): RuntimeEnv { return env as unknown as RuntimeEnv; }

async function orderData(orderId: string) {
  const order = await first<OrderRow>("SELECT o.*, c.email, c.full_name FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = ?", orderId);
  assertDomain(order, "ORDER_NOT_FOUND", "Porudžbina za integracioni događaj nije pronađena.", 404);
  const items = await all<OrderItemRow>("SELECT oi.product_id, oi.product_name, oi.unit_label, oi.quantity, oi.unit_price_minor, oi.line_total_minor, p.badi_sku FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ? ORDER BY oi.created_at, oi.id", orderId);
  return { order, items };
}

function messageData(order: OrderRow, items: OrderItemRow[], payload: Record<string, unknown>) {
  return { ...payload, fullName: order.full_name, email: order.email, orderId: order.id, orderNumber: order.order_number, deliveryDate: order.delivery_date, totalMinor: order.total_minor, items };
}

async function notificationData(row: OutboxRow, payload: Record<string, unknown>) {
  let data: Record<string, unknown> = { ...payload, accountUrl: `${runtimeEnv().APP_ORIGIN ?? "http://localhost:3000"}/nalog` };
  if (row.aggregate_type === "order") {
    const { order, items } = await orderData(row.aggregate_id);
    data = { ...messageData(order, items, data), ...payload };
  } else if (row.aggregate_type === "subscription") {
    const subscription = await first<Record<string, unknown>>("SELECT s.next_delivery_date, c.full_name, c.email, d.cutoff_at FROM subscriptions s JOIN customers c ON c.id = s.customer_id LEFT JOIN deliveries d ON d.delivery_date = s.next_delivery_date WHERE s.id = ?", row.aggregate_id);
    if (subscription) data = { ...data, fullName: subscription.full_name, email: subscription.email, deliveryDate: "deliveryDate" in payload ? payload.deliveryDate : "nextDeliveryDate" in payload ? payload.nextDeliveryDate : subscription.next_delivery_date, cutoffAt: "cutoffAt" in payload ? payload.cutoffAt : subscription.cutoff_at, accountUrl: `${runtimeEnv().APP_ORIGIN ?? "http://localhost:3000"}/nalog` };
  }
  return data;
}

async function sendEmail(row: OutboxRow, payload: Record<string, unknown>): Promise<string> {
  const data = await notificationData(row, payload);
  const recipient = String(data.email ?? "").trim();
  if (recipient.endsWith("@manual.invalid")) return `suppressed:${row.id}`;
  if (!recipient) throw new IntegrationError("EMAIL_RECIPIENT_MISSING", "Email događaj nema primaoca.");
  const message = renderTransactionalMessage(row.topic, data);
  const config = readIntegrationConfig(runtimeEnv() as typeof process.env);
  if (config.integrations.email.mode === "console") {
    if (config.appEnvironment === "production") throw new IntegrationError("EMAIL_NOT_CONFIGURED", "Slanje emaila nije povezano. Podesite servis za transakcione poruke.");
    await run("INSERT INTO message_deliveries(id,outbox_id,channel,recipient,subject,provider,provider_reference,status) VALUES(?,?,'email',?,?,'console',?,'simulated') ON CONFLICT(id) DO NOTHING", row.id,row.id,recipient,message.subject,`console:${row.id}`);
    return `console:${row.id}`;
  }
  await run("INSERT INTO message_deliveries(id,outbox_id,channel,recipient,subject,provider,status) VALUES(?,?,'email',?, ?,?,'queued') ON CONFLICT(id) DO NOTHING",row.id,row.id,recipient,message.subject,runtimeEnv().EMAIL_PROVIDER ?? '');
  try {
    const reference = await sendEmailMessage(recipient, message, row.idempotency_key ?? row.id);
    await run("UPDATE message_deliveries SET provider_reference=?,status='accepted',last_error=NULL,updated_at=? WHERE id=?",reference,new Date().toISOString(),row.id);
    return reference;
  } catch(error) {
    await run("UPDATE message_deliveries SET status='failed',last_error=?,updated_at=? WHERE id=?",error instanceof DomainError ? error.code : 'MESSAGE_SEND_FAILED',new Date().toISOString(),row.id);throw error;
  }
}

async function queueWhatsAppUpdate(row: OutboxRow, payload: Record<string, unknown>) {
  // Separate job: an email failure must not block WhatsApp, or cause an email resend.
  const tables: Record<string, string> = { order: "orders", subscription: "subscriptions", delivery_order: "delivery_orders" };
  const table = tables[row.aggregate_type];
  if (!table || runtimeEnv().WHATSAPP_MODE !== "provider") return;
  if (!["email.order_confirmation.requested", "email.delivery_reminder.requested", "email.delivery_deadline.requested", "email.invoice.requested", "email.receipt.requested", "email.order_updated.requested", "payment.method_required"].includes(row.topic) && !row.topic.startsWith("subscription.")) return;
  const recipient = await first<Record<string, unknown>>(`SELECT a.customer_id FROM customer_credentials a JOIN ${table} x ON x.customer_id = a.customer_id
    WHERE x.id = ? AND a.whatsapp_verified_at IS NOT NULL AND a.whatsapp_consent_at IS NOT NULL AND a.whatsapp_notifications_at IS NOT NULL`, row.aggregate_id);
  if (!recipient) return;
  await batch([enqueueOnce("whatsapp.account_update", row.aggregate_type, row.aggregate_id,
    { ...payload, sourceTopic: row.topic, customerId: recipient.customer_id }, `whatsapp:${row.id}`)]);
}

async function sendWhatsAppUpdate(row: OutboxRow, payload: Record<string, unknown>) {
  // Recheck consent at send time so queued jobs cannot bypass an opt-out.
  const recipient = await first<Record<string, unknown>>("SELECT whatsapp_phone FROM customer_credentials WHERE customer_id = ? AND whatsapp_verified_at IS NOT NULL AND whatsapp_consent_at IS NOT NULL AND whatsapp_notifications_at IS NOT NULL", String(payload.customerId ?? ""));
  if (!recipient) return `suppressed:${row.id}`;
  const sourceTopic = String(payload.sourceTopic);
  if (["email.delivery_reminder.requested", "email.delivery_deadline.requested"].includes(sourceTopic) && !await reminderStillDue(row, payload)) return `suppressed:${row.id}`;
  const data = await notificationData(row, payload);
  return sendWhatsAppTemplate(String(recipient.whatsapp_phone), runtimeEnv().WHATSAPP_UPDATE_TEMPLATE ?? "", [renderWhatsAppUpdate(sourceTopic, data)], row.id);
}


function isEmailTopic(topic: string) {
  return topic.startsWith("email.") || topic === "auth.magic_link.requested" || topic.startsWith("subscription.") || topic === "payment.method_required";
}

async function sendPurchaseAnalytics(row: OutboxRow, payload: Record<string, unknown>) {
  const { order, items } = await orderData(row.aggregate_id);
  return dispatchPurchaseAnalytics(order, items, String(payload.eventId ?? `purchase:${order.id}`).slice(0, 120), String(payload.transactionId ?? order.order_number).slice(0, 120));
}

async function dispatch(row: OutboxRow): Promise<string> {
  const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
  if (row.topic === "whatsapp.account_update") return sendWhatsAppUpdate(row, payload);
  if (row.topic === "analytics.purchase") return sendPurchaseAnalytics(row, payload);
  if (row.topic === "sms.account_update") return deliverSms(row, payload);
  if (row.topic === "fiscal.final.requested") return (await issueFiscomm(row.aggregate_id, true)).externalId;
  if (row.topic === "fiscal.receipt.requested") return (await issueFiscalReceipt(row)).externalId;
  if (isEmailTopic(row.topic)) {
    if (["email.delivery_reminder.requested", "email.delivery_deadline.requested"].includes(row.topic) && !await reminderStillDue(row, payload)) return `suppressed:${row.id}`;
    await queueWhatsAppUpdate(row, payload);
  await queueSmsUpdate(row, payload);
    return sendEmail(row, payload);
  }
  return `internal:${row.topic}:${row.aggregate_id}`;
}

function errorDetails(error: unknown): { code: string; message: string } {
  if (error instanceof IntegrationError) return { code: error.code, message: error.message.slice(0, 500) };
  if (error instanceof Error && "code" in error && typeof error.code === "string" && error.code.startsWith("FISCAL_")) return {code: error.code, message: error.message};
  if (error instanceof DomainError) return { code: error.code, message: error.message.slice(0, 500) };
  return { code: "INTEGRATION_ERROR", message: error instanceof Error ? error.message.slice(0, 500) : "Nepoznata greška integracije." };
}

async function processRows(candidates: OutboxRow[]) {
  const now = new Date().toISOString();
  const results: Array<Record<string, unknown>> = [];
  for (const row of candidates) {
    const leaseUntil = new Date(Date.now() + 5 * 60_000).toISOString();
    const claim = await run("UPDATE outbox SET attempts = attempts + 1, available_at = ? WHERE id = ? AND status = 'pending' AND available_at <= ?", leaseUntil, row.id, now);
    if (Number(claim.meta?.changes ?? 0) !== 1) continue;
    try {
      const externalId = await dispatch(row);
      await run("UPDATE outbox SET status = 'sent', external_id = ?, sent_at = ?, last_error_code = NULL, last_error_message = NULL WHERE id = ?", externalId, new Date().toISOString(), row.id);
      results.push({ id: row.id, topic: row.topic, status: "sent", externalId });
    } catch (error) {
      const details = errorDetails(error);
      const attempts = row.attempts + 1;
      // Badi does not document a provider idempotency key. An ambiguous fiscal failure
      // therefore needs reconciliation before an explicit admin retry, or it could create a duplicate receipt.
      const fiscal = row.topic.startsWith("fiscal.");
      const operation = fiscal ? await receiptOperation(row.aggregate_id, row.topic === "fiscal.final.requested") : null;
      const safeToRetry = ["FISCAL_NOT_CONFIGURED", "FISCAL_TAX_LABEL_MISSING", "ADVANCE_NOT_ISSUED", "FISCOMM_CONNECTION_FAILED"].includes(details.code);
      const terminal = fiscal ? !safeToRetry : attempts >= 5;
      const retryAt = new Date(Date.now() + Math.min(60, 2 ** attempts) * 60_000).toISOString();
      await run("UPDATE outbox SET status = ?, available_at = ?, last_error_code = ?, last_error_message = ? WHERE id = ?", terminal ? "failed" : "pending", retryAt, details.code, details.message, row.id);
      if (operation) await run("UPDATE fiscal_receipts SET status = ?, attempts = attempts + 1, last_error_code = ?, last_error_message = ?, updated_at = ? WHERE operation_key = ?", terminal ? "failed" : "pending", details.code, details.message, new Date().toISOString(), operation.key);
      results.push({ id: row.id, topic: row.topic, status: terminal ? "failed" : "retry", ...details });
    }
  }
  return { attempted: results.length, results };
}

export async function processOutbox(rawLimit = 25) {
  const limit = Math.min(100, Math.max(1, Math.trunc(rawLimit)));
  const now = new Date().toISOString();
  const initial = await processRows(await all<OutboxRow>("SELECT * FROM outbox WHERE status = 'pending' AND available_at <= ? ORDER BY created_at, id LIMIT ?", now, limit));
  // Email dispatch creates independent WhatsApp jobs. Drain them in this invocation,
  // so a daily scheduler sends both reminders on the intended day.
  const whatsapp = await processRows(await all<OutboxRow>("SELECT * FROM outbox WHERE status = 'pending' AND topic = 'whatsapp.account_update' AND available_at <= ? ORDER BY created_at, id LIMIT ?", now, limit));
  return { attempted: initial.attempted + whatsapp.attempted, results: [...initial.results, ...whatsapp.results] };
}

export async function processOutboxFor(aggregateType: string, aggregateId: string) {
  const now = new Date().toISOString();
  const result = await processRows(await all<OutboxRow>("SELECT * FROM outbox WHERE status = 'pending' AND aggregate_type = ? AND aggregate_id = ? AND available_at <= ? ORDER BY created_at, id LIMIT 25", aggregateType, aggregateId, now));
  await processRows(await all<OutboxRow>("SELECT * FROM outbox WHERE status = 'pending' AND topic = 'whatsapp.account_update' AND aggregate_type = ? AND aggregate_id = ? AND available_at <= ? ORDER BY created_at, id LIMIT 25", aggregateType, aggregateId, now));
  return result;
}

export async function retryFailedOutbox() {
  const result = await run("UPDATE outbox SET status = 'pending', attempts = 0, available_at = ?, last_error_code = NULL, last_error_message = NULL WHERE status = 'failed' AND topic NOT LIKE 'fiscal.%'", new Date().toISOString());
  return { requeued: Number(result.meta?.changes ?? 0) };
}

async function reminderStillDue(row: OutboxRow, payload: Record<string, unknown>) {
  if (payload.reminderPhase === "deadline") {
    const delivery = await first<Record<string, unknown>>("SELECT cutoff_at, status FROM deliveries WHERE delivery_date = ?", String(payload.deliveryDate));
    if (!delivery || delivery.status !== "open" || String(delivery.cutoff_at) !== payload.cutoffAt || Date.now() >= Date.parse(String(delivery.cutoff_at))) return false;
  } else if (String(payload.deliveryDate) !== addLocalDays(localDateAt(), 1)) return false;
  const sourceType = String(payload.sourceType ?? "");
  const column = sourceType === "subscription" ? "subscription_id" : sourceType === "order" ? "source_order_id" : "id";
  const sourceId = String(payload.sourceId ?? row.aggregate_id);
  return Boolean(await first<Record<string, unknown>>(`SELECT dor.id FROM delivery_orders dor JOIN deliveries d ON d.id = dor.delivery_id LEFT JOIN orders o ON o.id = dor.source_order_id WHERE dor.${column} = ? AND d.delivery_date = ? AND dor.status IN ('planned', 'locked') AND (o.id IS NULL OR (o.fulfillment_status IN ('planned', 'locked') AND (o.payment_method = 'cash' OR o.payment_status = 'paid')))`, sourceId, String(payload.deliveryDate)));
}

export async function queueDeliveryReminders(rawDate: unknown, phase: "tomorrow" | "deadline" = "tomorrow") {
  const date = assertLocalDate(rawDate);
  // Never send "tomorrow" for a different date, including a delayed retry.
  if (phase === "tomorrow" && date !== addLocalDays(localDateAt(), 1)) return { date, queued: 0 };
  const delivery = await first<Record<string, unknown>>("SELECT cutoff_at, status FROM deliveries WHERE delivery_date = ?", date);
  if (!delivery) return { date, queued: 0 };
  const cutoffAt = String(delivery.cutoff_at);
  if (phase === "deadline" && (delivery.status !== "open" || Date.parse(cutoffAt) <= Date.now() || Date.parse(cutoffAt) > Date.now() + 24 * 60 * 60 * 1000)) return { date, queued: 0 };
  const rows = await all<Record<string, unknown>>("SELECT dor.id, dor.source_order_id, dor.subscription_id, dor.note, c.email, c.full_name, di.product_name, di.quantity FROM delivery_orders dor JOIN deliveries d ON d.id = dor.delivery_id JOIN customers c ON c.id = dor.customer_id LEFT JOIN delivery_items di ON di.delivery_order_id = dor.id WHERE d.delivery_date = ? AND dor.status IN ('planned', 'locked') ORDER BY dor.id, di.product_name", date);
  const grouped = new Map<string, { sourceType: string; sourceId: string; email: string; fullName: string; note: unknown; items: Array<{ product_name: unknown; quantity: unknown }> }>();
  for (const value of rows) {
    const key = String(value.id);
    const current = grouped.get(key) ?? { sourceType: value.subscription_id ? "subscription" : "order", sourceId: String(value.subscription_id ?? value.source_order_id), email: String(value.email), fullName: String(value.full_name), note: value.note, items: [] };
    if (value.product_name) current.items.push({ product_name: value.product_name, quantity: value.quantity });
    grouped.set(key, current);
  }
  if (!grouped.size) return { date, queued: 0 };
  // Projection IDs change on regeneration; source + date is the stable delivery identity.
  await batch([...grouped.values()].map((value) => enqueueOnce(phase === "deadline" ? "email.delivery_deadline.requested" : "email.delivery_reminder.requested", value.sourceType, value.sourceId, { ...value, deliveryDate: date, cutoffAt, reminderPhase: phase }, `delivery-reminder:${value.sourceType}:${value.sourceId}:${date}:${phase === "deadline" ? cutoffAt : "v2"}`)));
  return { date, queued: grouped.size };
}

export async function integrationOperationsStatus() {
  const config = readIntegrationConfig(runtimeEnv() as typeof process.env);
  const outbox = await all<Record<string, unknown>>("SELECT status, COUNT(*) AS count FROM outbox GROUP BY status ORDER BY status");
  const recentReceipts = await all<Record<string, unknown>>("SELECT fr.*, o.order_number FROM fiscal_receipts fr JOIN orders o ON o.id = fr.order_id ORDER BY fr.updated_at DESC LIMIT 20");
  const failures = await all<Record<string, unknown>>("SELECT id, topic, aggregate_id, attempts, last_error_code, last_error_message, created_at FROM outbox WHERE status = 'failed' ORDER BY created_at DESC LIMIT 20");
  return { config: publicIntegrationStatus(config), outbox, recentReceipts, failures };
}


/** Process only this day's reminder messages, never unrelated payments or receipts. */
export async function processDeliveryReminders(date: string) {
  assertLocalDate(date);
  const now = new Date().toISOString();
  const email = await processRows(await all<OutboxRow>("SELECT * FROM outbox WHERE status = 'pending' AND topic = 'email.delivery_reminder.requested' AND json_extract(payload_json, '$.deliveryDate') = ? AND available_at <= ? ORDER BY created_at LIMIT 500",date,now));
  const whatsapp = await processRows(await all<OutboxRow>("SELECT * FROM outbox WHERE status = 'pending' AND topic = 'whatsapp.account_update' AND json_extract(payload_json, '$.sourceTopic') = 'email.delivery_reminder.requested' AND json_extract(payload_json, '$.deliveryDate') = ? AND available_at <= ? ORDER BY created_at LIMIT 500",date,now));
  return {attempted:email.attempted+whatsapp.attempted,results:[...email.results,...whatsapp.results]};
}

export async function resendFiscalDocument(id: string) {
  const receipt = await first<Record<string,unknown>>("SELECT * FROM fiscal_receipts WHERE id=? AND status='issued'",id);
  assertDomain(receipt,"RECEIPT_NOT_ISSUED","Najpre mora biti izdat račun.",409);
  await batch([enqueueOnce("email.fiscal_document.requested","order",String(receipt.order_id),{invoiceNumber:receipt.invoice_number,documentKind:receipt.kind,documentUrl:receipt.pdf_url ?? receipt.verification_url},`resend:${id}:${crypto.randomUUID()}`)]);
  return {queued:true};
}
