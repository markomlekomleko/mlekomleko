import { env } from "cloudflare:workers";
import { readIntegrationConfig, publicIntegrationStatus } from "../integrations/config.mjs";
import { DomainError, assertDomain } from "./domain";
import { renderTransactionalMessage } from "./notifications";
import { enqueueOnce } from "./outbox";
import { all, batch, first, run } from "./sql";
import { assertLocalDate } from "./time";

interface OutboxRow extends Record<string, unknown> {
  id: string; topic: string; aggregate_type: string; aggregate_id: string; payload_json: string;
  idempotency_key: string | null; attempts: number;
}

interface OrderRow extends Record<string, unknown> {
  id: string; order_number: string; kind: string; payment_method: "card" | "cash"; payment_status: string;
  delivery_date: string; subtotal_minor: number; discount_minor: number; delivery_fee_minor: number; credit_applied_minor: number; total_minor: number;
  customer_id: string; email: string; full_name: string;
}

interface OrderItemRow extends Record<string, unknown> {
  product_id: string; product_name: string; unit_label: string; quantity: number; unit_price_minor: number; line_total_minor: number; badi_sku: number | null;
}

type RuntimeEnv = Record<string, string | undefined> & {
  BADI_MODE?: string; BADI_API_KEY?: string; BADI_API_SECRET?: string; BADI_CLIENT_ID?: string; BADI_LOCAL_BASE_URL?: string;
  BADI_DELIVERY_SKU?: string; BADI_ADJUSTMENT_SKU?: string; EMAIL_MODE?: string; EMAIL_PROVIDER?: string; EMAIL_API_KEY?: string; EMAIL_FROM?: string;
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

async function sendEmail(row: OutboxRow, payload: Record<string, unknown>): Promise<string> {
  let data = payload;
  if (row.aggregate_type === "order") {
    const { order, items } = await orderData(row.aggregate_id);
    data = messageData(order, items, payload);
  } else if (row.aggregate_type === "subscription") {
    const subscription = await first<Record<string, unknown>>("SELECT s.next_delivery_date, c.full_name, c.email FROM subscriptions s JOIN customers c ON c.id = s.customer_id WHERE s.id = ?", row.aggregate_id);
    if (subscription) data = { ...payload, fullName: subscription.full_name, email: subscription.email, deliveryDate: subscription.next_delivery_date };
  }
  const recipient = String(data.email ?? "").trim();
  if (!recipient) throw new IntegrationError("EMAIL_RECIPIENT_MISSING", "Email događaj nema primaoca.");
  const message = renderTransactionalMessage(row.topic, data);
  const config = readIntegrationConfig(runtimeEnv() as typeof process.env);
  if (config.integrations.email.mode === "console") return `console:${row.id}`;
  if (String(config.integrations.email.provider).toLowerCase() !== "resend") throw new IntegrationError("EMAIL_PROVIDER_UNSUPPORTED", "Trenutno je podržan EMAIL_PROVIDER=resend.");
  const current = runtimeEnv();
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${current.EMAIL_API_KEY ?? ""}`, "content-type": "application/json", "idempotency-key": row.idempotency_key ?? row.id },
    body: JSON.stringify({ from: current.EMAIL_FROM, to: [recipient], subject: message.subject, text: message.text, html: message.html }),
  });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new IntegrationError(`EMAIL_HTTP_${response.status}`, String(body.message ?? "Email provider je odbio poruku."));
  return String(body.id ?? `resend:${row.id}`);
}

function integerEnv(name: keyof RuntimeEnv): number | null {
  const raw = runtimeEnv()[name];
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

async function issueFiscalReceipt(row: OutboxRow): Promise<{ externalId: string; status: "issued" | "skipped" }> {
  const { order, items } = await orderData(row.aggregate_id);
  const operationKey = `receipt:${order.id}:sale`;
  const receiptId = crypto.randomUUID();
  await run("INSERT INTO fiscal_receipts (id, order_id, operation_key, kind, status, provider) VALUES (?, ?, ?, 'normal', 'pending', 'badi') ON CONFLICT(operation_key) DO NOTHING", receiptId, order.id, operationKey);
  const currentReceipt = await first<{ id: string; status: string; provider_reference: string | null } & Record<string, unknown>>("SELECT id, status, provider_reference FROM fiscal_receipts WHERE operation_key = ?", operationKey);
  if (currentReceipt?.status === "issued" || currentReceipt?.status === "skipped") return { externalId: currentReceipt.provider_reference ?? `${currentReceipt.status}:${order.id}`, status: currentReceipt.status } as { externalId: string; status: "issued" | "skipped" };
  assertDomain(order.payment_status === "paid", "PAYMENT_NOT_CAPTURED", "Fiskalni račun se izdaje tek kada je uplata evidentirana.", 409);
  const config = readIntegrationConfig(runtimeEnv() as typeof process.env);
  const mode = config.integrations.fiscalization.mode;
  const now = new Date().toISOString();
  if (order.total_minor === 0) {
    await run("UPDATE fiscal_receipts SET status = 'skipped', provider_reference = ?, attempts = attempts + 1, updated_at = ? WHERE operation_key = ?", `zero-amount:${order.id}`, now, operationKey);
    return { externalId: `zero-amount:${order.id}`, status: "skipped" };
  }
  if (mode === "disabled") {
    await run("UPDATE fiscal_receipts SET status = 'skipped', provider_reference = ?, attempts = attempts + 1, updated_at = ? WHERE operation_key = ?", `disabled:${order.id}`, now, operationKey);
    return { externalId: `disabled:${order.id}`, status: "skipped" };
  }
  if (mode === "mock") {
    const invoiceNumber = `MOCK-${order.order_number}`;
    await run("UPDATE fiscal_receipts SET status = 'issued', provider_reference = ?, invoice_number = ?, attempts = attempts + 1, issued_at = ?, updated_at = ?, last_error_code = NULL, last_error_message = NULL WHERE operation_key = ?", `badi-mock:${order.id}`, invoiceNumber, now, now, operationKey);
    return { externalId: `badi-mock:${order.id}`, status: "issued" };
  }
  if (!items.length) throw new IntegrationError("FISCAL_ITEMS_MISSING", "Porudžbina nema stavke za fiskalizaciju.");
  const missing = items.filter((item) => !item.badi_sku);
  if (missing.length) throw new IntegrationError("BADI_SKU_MISSING", `Nedostaje Badi SKU za: ${missing.map((item) => item.product_name).join(", ")}.`);
  const originalItemsMinor = items.reduce((sum, item) => sum + item.line_total_minor, 0);
  const productTargetMinor = order.total_minor - order.delivery_fee_minor;
  const badiItems = items.map((item) => ({ sku: item.badi_sku, quantity: item.unit_price_minor > 0 ? item.line_total_minor / item.unit_price_minor : item.quantity, unitPrice: item.unit_price_minor / 100 }));
  if (productTargetMinor > originalItemsMinor) {
    const sku = integerEnv("BADI_ADJUSTMENT_SKU");
    if (!sku) throw new IntegrationError("BADI_ADJUSTMENT_SKU_MISSING", "Za doplatu/korekciju je potreban BADI_ADJUSTMENT_SKU.");
    badiItems.push({ sku, quantity: 1, unitPrice: (productTargetMinor - originalItemsMinor) / 100 });
  }
  if (order.delivery_fee_minor > 0) {
    const sku = integerEnv("BADI_DELIVERY_SKU");
    if (!sku) throw new IntegrationError("BADI_DELIVERY_SKU_MISSING", "Za fiskalizaciju dostave je potreban BADI_DELIVERY_SKU.");
    badiItems.push({ sku, quantity: 1, unitPrice: order.delivery_fee_minor / 100 });
  }
  const discount = productTargetMinor < originalItemsMinor && originalItemsMinor > 0 ? (originalItemsMinor - productTargetMinor) * 100 / originalItemsMinor : 0;
  const requestBody: Record<string, unknown> = {
    invoiceType: "normal", transactionType: "sale",
    payments: { cash: order.payment_method === "cash" ? order.total_minor / 100 : 0, card: order.payment_method === "card" ? order.total_minor / 100 : 0, check: 0, mobilemoney: 0, wiretransfer: 0, voucher: 0, other: 0 },
    items: badiItems, discount, additionalText: `Mleko i Mleko · ${order.order_number}`,
    receiptDelivery: { thermalPrinter: false, a4Printer: false, email: order.email, pdf: true, base64pdf: false },
  };
  if (mode !== "local") requestBody.clientId = runtimeEnv().BADI_CLIENT_ID;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (mode !== "local") headers.authorization = `Basic ${btoa(`${runtimeEnv().BADI_API_KEY ?? ""}:${runtimeEnv().BADI_API_SECRET ?? ""}`)}`;
  const response = await fetch(`${config.integrations.fiscalization.baseUrl}${config.integrations.fiscalization.receiptPath}`, { method: "POST", headers, body: JSON.stringify(requestBody) });
  const body = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new IntegrationError(`BADI_HTTP_${response.status}`, String(body.message ?? body.error ?? "Badi je odbio račun."));
  const invoiceNumber = String(body.invoiceNumber ?? body.invoice_number ?? body.requestId ?? "");
  const externalId = invoiceNumber || `badi:${row.id}`;
  const pdfUrl = typeof body.pdfUrl === "string" ? body.pdfUrl : typeof body.pdf === "string" && body.pdf.startsWith("http") ? body.pdf : null;
  await run("UPDATE fiscal_receipts SET status = 'issued', provider_reference = ?, invoice_number = ?, pdf_url = ?, attempts = attempts + 1, issued_at = ?, updated_at = ?, last_error_code = NULL, last_error_message = NULL WHERE operation_key = ?", externalId, invoiceNumber || null, pdfUrl, now, now, operationKey);
  return { externalId, status: "issued" };
}

function isEmailTopic(topic: string) {
  return topic.startsWith("email.") || topic === "auth.magic_link.requested" || topic.startsWith("subscription.") || topic === "payment.method_required";
}

async function dispatch(row: OutboxRow): Promise<string> {
  const payload = JSON.parse(row.payload_json) as Record<string, unknown>;
  if (row.topic === "fiscal.receipt.requested") return (await issueFiscalReceipt(row)).externalId;
  if (isEmailTopic(row.topic)) return sendEmail(row, payload);
  return `internal:${row.topic}:${row.aggregate_id}`;
}

function errorDetails(error: unknown): { code: string; message: string } {
  if (error instanceof IntegrationError) return { code: error.code, message: error.message.slice(0, 500) };
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
      const terminal = row.topic === "fiscal.receipt.requested" || attempts >= 5;
      const retryAt = new Date(Date.now() + Math.min(60, 2 ** attempts) * 60_000).toISOString();
      await run("UPDATE outbox SET status = ?, available_at = ?, last_error_code = ?, last_error_message = ? WHERE id = ?", terminal ? "failed" : "pending", retryAt, details.code, details.message, row.id);
      if (row.topic === "fiscal.receipt.requested") await run("UPDATE fiscal_receipts SET status = ?, attempts = attempts + 1, last_error_code = ?, last_error_message = ?, updated_at = ? WHERE operation_key = ?", terminal ? "failed" : "pending", details.code, details.message, new Date().toISOString(), `receipt:${row.aggregate_id}:sale`);
      results.push({ id: row.id, topic: row.topic, status: terminal ? "failed" : "retry", ...details });
    }
  }
  return { attempted: results.length, results };
}

export async function processOutbox(rawLimit = 25) {
  const limit = Math.min(100, Math.max(1, Math.trunc(rawLimit)));
  const now = new Date().toISOString();
  return processRows(await all<OutboxRow>("SELECT * FROM outbox WHERE status = 'pending' AND available_at <= ? ORDER BY created_at, id LIMIT ?", now, limit));
}

export async function processOutboxFor(aggregateType: string, aggregateId: string) {
  const now = new Date().toISOString();
  return processRows(await all<OutboxRow>("SELECT * FROM outbox WHERE status = 'pending' AND aggregate_type = ? AND aggregate_id = ? AND available_at <= ? ORDER BY created_at, id LIMIT 25", aggregateType, aggregateId, now));
}

export async function retryFailedOutbox() {
  const result = await run("UPDATE outbox SET status = 'pending', attempts = 0, available_at = ?, last_error_code = NULL, last_error_message = NULL WHERE status = 'failed'", new Date().toISOString());
  return { requeued: Number(result.meta?.changes ?? 0) };
}

export async function queueDeliveryReminders(rawDate: unknown) {
  const date = assertLocalDate(rawDate);
  const rows = await all<Record<string, unknown>>("SELECT dor.id, dor.note, dor.customer_snapshot_json, c.email, c.full_name, di.product_name, di.quantity FROM delivery_orders dor JOIN deliveries d ON d.id = dor.delivery_id JOIN customers c ON c.id = dor.customer_id LEFT JOIN delivery_items di ON di.delivery_order_id = dor.id WHERE d.delivery_date = ? AND dor.status != 'cancelled' ORDER BY dor.id, di.product_name", date);
  const grouped = new Map<string, { email: string; fullName: string; note: unknown; items: Array<{ product_name: unknown; quantity: unknown }> }>();
  for (const value of rows) {
    const key = String(value.id);
    const current = grouped.get(key) ?? { email: String(value.email), fullName: String(value.full_name), note: value.note, items: [] };
    if (value.product_name) current.items.push({ product_name: value.product_name, quantity: value.quantity });
    grouped.set(key, current);
  }
  if (!grouped.size) return { date, queued: 0 };
  await batch([...grouped].map(([id, value]) => enqueueOnce("email.delivery_reminder.requested", "delivery_order", id, { ...value, deliveryDate: date }, `delivery-reminder:${id}:${date}:v1`)));
  return { date, queued: grouped.size };
}

export async function integrationOperationsStatus() {
  const config = readIntegrationConfig(runtimeEnv() as typeof process.env);
  const outbox = await all<Record<string, unknown>>("SELECT status, COUNT(*) AS count FROM outbox GROUP BY status ORDER BY status");
  const recentReceipts = await all<Record<string, unknown>>("SELECT fr.*, o.order_number FROM fiscal_receipts fr JOIN orders o ON o.id = fr.order_id ORDER BY fr.updated_at DESC LIMIT 20");
  const failures = await all<Record<string, unknown>>("SELECT id, topic, aggregate_id, attempts, last_error_code, last_error_message, created_at FROM outbox WHERE status = 'failed' ORDER BY created_at DESC LIMIT 20");
  return { config: publicIntegrationStatus(config), outbox, recentReceipts, failures };
}
