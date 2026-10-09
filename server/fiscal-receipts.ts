import { fiscommSelected, issueFiscomm, receiptOperation } from "./fiscomm";
import { fiscalAmounts } from "../integrations/fiscal-amounts.mjs";
import { env } from "@/server/runtime";
import { readIntegrationConfig } from "../integrations/config.mjs";
import { dispatchFiscalOnce, FiscalDispatchError } from "../integrations/fiscal-dispatch.mjs";
import { assertDomain, DomainError } from "./domain";
import { all, first, run } from "./sql";
import { contactEmail } from "./customer-contact";

type RuntimeEnv = Record<string, string | undefined>;
function runtimeEnv(): RuntimeEnv { return env as unknown as RuntimeEnv; }
class IntegrationError extends DomainError {
  constructor(code: string, message: string) { super(code, message, 503); }
}
interface OrderRow extends Record<string, unknown> {
  id: string; order_number: string; kind: string; payment_method: "card" | "cash"; payment_status: string;
  delivery_date: string; subtotal_minor: number; discount_minor: number; delivery_fee_minor: number; credit_applied_minor: number; total_minor: number;
  customer_id: string; email: string; full_name: string;
}
interface OrderItemRow extends Record<string, unknown> {
  product_id: string; product_name: string; unit_label: string; quantity: number; unit_price_minor: number; line_total_minor: number; badi_sku: number | null;
}
async function orderData(orderId: string) {
  const order = await first<OrderRow>("SELECT o.*, c.email, c.full_name FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = ?", orderId);
  assertDomain(order, "ORDER_NOT_FOUND", "Porudžbina nije pronađena.", 404);
  const items = await all<OrderItemRow>("SELECT oi.product_id, oi.product_name, oi.unit_label, oi.quantity, oi.unit_price_minor, oi.line_total_minor, p.badi_sku FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE oi.order_id = ? ORDER BY oi.created_at, oi.id", orderId);
  return { order, items };
}
function integerEnv(name: keyof RuntimeEnv): number | null {
  const raw = runtimeEnv()[name];
  if (!raw) return null;
  const parsed = Number(raw);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

async function recordIssued(operationKey: string, body: Record<string, unknown>): Promise<{ externalId: string; status: "issued" }> {
  const now = new Date().toISOString();
  const invoiceNumber = String(body.invoiceNumber ?? "");
  assertDomain(invoiceNumber, "FISCAL_RESPONSE_INVALID", "Sačuvani fiskalni odgovor nema broj računa.", 409);
  const externalId = invoiceNumber;
  const candidate = typeof body.pdfUrl === "string" ? body.pdfUrl : typeof body.pdf === "string" ? body.pdf : "";
  let pdfUrl: string | null = null;
  try { const parsed = new URL(candidate); if (["http:", "https:"].includes(parsed.protocol)) pdfUrl = parsed.toString(); } catch { /* A document URL is optional. */ }
  await run("UPDATE fiscal_receipts SET status = 'issued', provider_reference = ?, invoice_number = ?, pdf_url = ?, attempts = attempts + 1, issued_at = ?, updated_at = ?, last_error_code = NULL, last_error_message = NULL WHERE operation_key = ?", externalId, invoiceNumber, pdfUrl, now, now, operationKey);
  return { externalId, status: "issued" };
}

export async function issueFiscalReceipt(row: { id: string; aggregate_id: string }): Promise<{ externalId: string; status: "issued" | "skipped" }> {
  if (fiscommSelected() || (await receiptOperation(row.aggregate_id)).pack) return issueFiscomm(row.aggregate_id);
  const { order, items } = await orderData(row.aggregate_id);
  const operationKey = `receipt:${order.id}:sale`;
  const receiptId = crypto.randomUUID();
  await run("INSERT INTO fiscal_receipts (id, order_id, operation_key, kind, status, provider) VALUES (?, ?, ?, 'normal', 'pending', 'badi') ON CONFLICT(operation_key) DO NOTHING", receiptId, order.id, operationKey);
  const currentReceipt = await first<{ id: string; status: string; provider_reference: string | null } & Record<string, unknown>>("SELECT id, status, provider_reference FROM fiscal_receipts WHERE operation_key = ?", operationKey);
  if (currentReceipt?.status === "issued" || currentReceipt?.status === "skipped") return { externalId: currentReceipt.provider_reference ?? `${currentReceipt.status}:${order.id}`, status: currentReceipt.status } as { externalId: string; status: "issued" | "skipped" };
  const priorDispatch = await first<{ status: string; response_json: string | null } & Record<string, unknown>>("SELECT status, response_json FROM fiscal_dispatches WHERE operation_key = ?", operationKey);
  if (priorDispatch) {
    if (priorDispatch.status === "issued" && priorDispatch.response_json) return recordIssued(operationKey, JSON.parse(priorDispatch.response_json) as Record<string, unknown>);
    throw new IntegrationError("FISCAL_RECONCILIATION_REQUIRED", "Prethodni fiskalni zahtev mora se proveriti kod servisa pre novog izdavanja.");
  }
  assertDomain(order.payment_status === "paid", "PAYMENT_NOT_CAPTURED", "Fiskalni račun se izdaje tek kada je uplata evidentirana.", 409);
  const config = readIntegrationConfig(runtimeEnv() as typeof process.env);
  const mode = config.integrations.fiscalization.mode;
  const now = new Date().toISOString();
  if (order.total_minor === 0) {
    await run("UPDATE fiscal_receipts SET status = 'skipped', provider_reference = ?, attempts = attempts + 1, updated_at = ? WHERE operation_key = ?", `zero-amount:${order.id}`, now, operationKey);
    return { externalId: `zero-amount:${order.id}`, status: "skipped" };
  }
  if (mode === "disabled") throw new IntegrationError("FISCAL_NOT_CONFIGURED", "Fiskalizacija je isključena. Račun čeka povezivanje servisa.");
  if (mode === "mock") {
    if (config.appEnvironment === "production") throw new IntegrationError("FISCAL_NOT_CONFIGURED", "Fiskalizacija nije povezana. Podesite Badi produkcioni pristup.");
    const invoiceNumber = `MOCK-${order.order_number}`;
    await run("UPDATE fiscal_receipts SET status = 'issued', provider_reference = ?, invoice_number = ?, attempts = attempts + 1, issued_at = ?, updated_at = ?, last_error_code = NULL, last_error_message = NULL WHERE operation_key = ?", `badi-mock:${order.id}`, invoiceNumber, now, now, operationKey);
    return { externalId: `badi-mock:${order.id}`, status: "issued" };
  }
  if (!items.length) throw new IntegrationError("FISCAL_ITEMS_MISSING", "Porudžbina nema stavke za fiskalizaciju.");
  const missing = items.filter((item) => !item.badi_sku);
  if (missing.length) throw new IntegrationError("BADI_SKU_MISSING", `Nedostaje Badi SKU za: ${missing.map((item) => item.product_name).join(", ")}.`);
  let badiItems;
  try { badiItems = fiscalAmounts(items, order.total_minor, order.delivery_fee_minor, integerEnv("BADI_DELIVERY_SKU"), integerEnv("BADI_ADJUSTMENT_SKU")); }
  catch (error) { throw new IntegrationError("FISCAL_AMOUNT_INVALID", error instanceof Error ? error.message : "Fiskalni iznosi nisu ispravni."); }
  const requestBody: Record<string, unknown> = {
    invoiceType: "normal", transactionType: "sale",
    payments: { cash: order.payment_method === "cash" ? order.total_minor / 100 : 0, card: order.payment_method === "card" ? order.total_minor / 100 : 0, check: 0, mobilemoney: 0, wiretransfer: 0, voucher: 0, other: 0 },
    items: badiItems, discount: 0, additionalText: `Mleko i Mleko · ${order.order_number}`,
    receiptDelivery: { thermalPrinter: false, a4Printer: false, ...(contactEmail(order.email) ? { email: contactEmail(order.email) } : {}), pdf: true, base64pdf: false },
  };
  if (mode !== "local") requestBody.clientId = runtimeEnv().BADI_CLIENT_ID;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (mode !== "local") headers.authorization = `Basic ${btoa(`${runtimeEnv().BADI_API_KEY ?? ""}:${runtimeEnv().BADI_API_SECRET ?? ""}`)}`;
  let body: Record<string, unknown>;
  try {
    body = await dispatchFiscalOnce({
      operationKey, requestJson: JSON.stringify(requestBody),
      url: `${config.integrations.fiscalization.baseUrl}${config.integrations.fiscalization.receiptPath}`, headers,
      journal: {
        async claim(key: string, requestJson: string) {
          const result = await run("INSERT INTO fiscal_dispatches (operation_key, request_json, status) VALUES (?, ?, 'sending') ON CONFLICT(operation_key) DO NOTHING", key, requestJson);
          return Number(result.meta?.changes ?? 0) === 1;
        },
        async read(key: string) {
          const saved = await first<Record<string, unknown>>("SELECT status, response_json FROM fiscal_dispatches WHERE operation_key = ?", key);
          return saved ? { status: saved.status, responseJson: saved.response_json } : null;
        },
        async finish(key: string, status: string, responseJson: string | null) {
          await run("UPDATE fiscal_dispatches SET status = ?, response_json = ?, updated_at = ? WHERE operation_key = ?", status, responseJson, new Date().toISOString(), key);
        },
      },
    }) as Record<string, unknown>;
  } catch (error) {
    if (error instanceof FiscalDispatchError) throw new IntegrationError(error.code, error.message);
    throw error;
  }
  return recordIssued(operationKey, body);
}

