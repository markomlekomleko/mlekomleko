import { env } from "./runtime";
import { assertDomain } from "./domain";
import { all, batch, first, run } from "./sql";
import { enqueueOnce } from "./outbox";
import { dispatchFiscalOnce } from "../integrations/fiscal-dispatch.mjs";
import { fiscalAmounts } from "../integrations/fiscal-amounts.mjs";

const host = "https://api.fiscomm.rs";
const config = () => env as unknown as Record<string, string | undefined>;
export async function fiscommRead(path: "/receipt/tax-rates" | "/auth/api-key/me") {
  assertDomain(config().FISCOMM_API_KEY, "FISCAL_NOT_CONFIGURED", "Fiscomm API ključ nije podešen na serveru.", 503);
  const response = await fetch(`${host}${path}`, {headers: {Authorization: `Bearer ${config().FISCOMM_API_KEY}`}, signal: AbortSignal.timeout(15_000)});
  assertDomain(response.ok, "FISCOMM_CONNECTION_FAILED", `Fiscomm provera nije uspela (HTTP ${response.status}).`, 503);
  return response.json();
}
export function fiscommSelected() { return config().FISCAL_PROVIDER === "fiscomm"; }
export async function receiptOperation(orderId: string, final = false) {
  const pack = await first<Record<string, unknown>>("SELECT status FROM subscription_packages WHERE order_id = ?", orderId);
  return {pack, kind: final ? "final" : pack ? "advance" : "normal", key: `receipt:${orderId}:${final ? "final" : pack ? "advance" : "sale"}`};
}
function safeUrl(value: unknown): string | null {
  try { const url = new URL(String(value)); return url.protocol === "https:" ? url.toString() : null; } catch { return null; }
}
async function saveIssued(orderId: string, key: string, kind: string, body: Record<string, unknown>, referenceId: string | null) {
  const id = key;
  const now = new Date().toISOString();
  await batch([
    {sql: "INSERT INTO fiscal_receipts (id, order_id, operation_key, kind, status, provider, invoice_number, provider_reference, pdf_url, pfr_time, verification_url, reference_receipt_id, issued_at, updated_at) VALUES (?, ?, ?, ?, 'issued', 'fiscomm', ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(operation_key) DO UPDATE SET status = 'issued', invoice_number = excluded.invoice_number, provider_reference = excluded.provider_reference, pdf_url = excluded.pdf_url, pfr_time = excluded.pfr_time, verification_url = excluded.verification_url, reference_receipt_id = excluded.reference_receipt_id, issued_at = excluded.issued_at, updated_at = excluded.updated_at, last_error_code = NULL, last_error_message = NULL", bindings: [id, orderId, key, kind, String(body.invoiceNumber), String(body.invoiceNumber), safeUrl(body.invoicePdfUrl), String(body.sdcDateTime ?? now), safeUrl(body.verificationUrl), referenceId, now, now]},
    enqueueOnce("email.fiscal_document.requested", "order", orderId, {invoiceNumber: body.invoiceNumber, documentKind: kind, documentUrl: safeUrl(body.invoicePdfUrl) ?? safeUrl(body.verificationUrl)}, `fiscal-email:${key}`),
  ]);
  return id;
}
export async function issueFiscomm(orderId: string, final = false) {
  const {pack, kind, key} = await receiptOperation(orderId, final);
  const order = await first<Record<string, unknown>>("SELECT * FROM orders WHERE id = ?", orderId);
  assertDomain(order, "ORDER_NOT_FOUND", "Porudžbina nije pronađena.", 404);
  assertDomain(order.payment_status === "paid", "PAYMENT_NOT_CAPTURED", "Najpre evidentirajte uplatu celog paketa.", 409);
  if (final) assertDomain(pack?.status === "completed", "PACKAGE_NOT_COMPLETE", "Nisu izvršene sve kupljene dostave.", 409);
  await run("INSERT INTO fiscal_receipts (id, order_id, operation_key, kind, status, provider) VALUES (?, ?, ?, ?, 'pending', 'fiscomm') ON CONFLICT(operation_key) DO NOTHING", key, orderId, key, kind);
  const current = await first<Record<string, unknown>>("SELECT * FROM fiscal_receipts WHERE operation_key = ?", key);
  if (current?.status === "issued") return {externalId: String(current.invoice_number), status: "issued" as const};
  const advance = final ? await first<Record<string, unknown>>("SELECT * FROM fiscal_receipts WHERE operation_key = ? AND status = 'issued'", `receipt:${orderId}:advance`) : null;
  if (final) assertDomain(advance, "ADVANCE_NOT_ISSUED", "Konačni račun čeka uspešno izdat avansni račun.", 503);
  let body: Record<string, unknown>;
  const previous = await first<Record<string, unknown>>("SELECT * FROM fiscal_dispatches WHERE operation_key = ?", key);
  if (previous) {
    assertDomain(previous.status === "issued" && previous.response_json, "FISCAL_RECONCILIATION_REQUIRED", "Ishod slanja se prvo mora proveriti u Fiscomm servisu; novi račun nije poslat.", 503);
    body = JSON.parse(String(previous.response_json));
  } else if (config().APP_ENV === "local" && (config().FISCOMM_MODE === "mock" || (!fiscommSelected() && (config().BADI_MODE ?? "mock") === "mock"))) {
    body = {invoiceNumber: `MOCK-${kind}-${order.order_number}`, sdcDateTime: new Date().toISOString(), ...(final ? {refundReceipt: {invoiceNumber: `MOCK-refund-${order.order_number}`, sdcDateTime: new Date().toISOString()}} : {})};
  } else {
    assertDomain(fiscommSelected() && config().FISCOMM_MODE === "live", "FISCAL_NOT_CONFIGURED", "Fiscomm izdavanje čeka aktivaciju i potvrđene poreske oznake.", 503);
    const taxes = await fiscommRead("/receipt/tax-rates");
    const validLabels = new Set<string>((taxes.currentTaxRates?.taxCategories ?? []).flatMap((category: {taxRates: {label: string}[]}) => category.taxRates.map(rate => rate.label)));
    let request: Record<string, unknown>;
    if (final) {
      const saved = await first<Record<string, unknown>>("SELECT request_json FROM fiscal_dispatches WHERE operation_key = ? AND status = 'issued'", `receipt:${orderId}:advance`);
      assertDomain(saved, "ADVANCE_SNAPSHOT_MISSING", "Nedostaje sačuvani zahtev avansa; potrebna je provera u servisu.", 503);
      const original = JSON.parse(String(saved.request_json));
      request = {...original, orderNumber: `${order.order_number}-FINAL`, referentDocumentNumber: advance!.invoice_number, referentDocumentDt: advance!.pfr_time, payments: [{type: order.payment_method === "card" ? "card" : "cash", amount: Number(order.total_minor) / 100, advanceAmount: Number(order.total_minor) / 100}], settings: {...original.settings, isFinal: true, skipBuyerIdValidation: true}};
    } else {
      const items = await all<Record<string, unknown>>("SELECT oi.*, COALESCE(oi.fiscal_tax_label, p.fiscal_tax_label) AS tax_label FROM order_items oi JOIN products p ON p.id = oi.product_id WHERE order_id = ? ORDER BY oi.id", orderId);
      assertDomain(items.length && items.every(item => validLabels.has(String(item.tax_label))), "FISCAL_TAX_LABEL_MISSING", "Izaberite potvrđenu poresku oznaku za svaki proizvod u administraciji.", 503);
      const deliveryLabel = config().FISCOMM_DELIVERY_TAX_LABEL;
      assertDomain(!Number(order.delivery_fee_minor) || validLabels.has(deliveryLabel ?? ""), "FISCAL_TAX_LABEL_MISSING", "Potrebna je potvrđena poreska oznaka dostave.", 503);
      const mapped = items.map((item, index) => ({...item, badi_sku: index + 1}));
      const amounts = fiscalAmounts(mapped, Number(order.total_minor), Number(order.delivery_fee_minor), items.length + 1, null);
      request = {orderNumber: `${order.order_number}-${kind === "advance" ? "ADV" : "SALE"}`, items: amounts.map((line: {sku: number; quantity: number; unitPrice: number}) => ({name: line.sku <= items.length ? items[line.sku - 1].product_name : "Dostava", quantity: line.quantity, unitPrice: line.unitPrice, totalAmount: Math.round(line.quantity * line.unitPrice * 100) / 100, labels: [line.sku <= items.length ? items[line.sku - 1].tax_label : deliveryLabel]})), payments: [{type: order.payment_method === "card" ? "card" : "cash", amount: Number(order.total_minor) / 100}], metaFields: {order_id: orderId}, settings: {returnIfOrderNumberExists: true}};
    }
    const billing = JSON.parse(String(order.billing_json ?? '{}'));
    if (billing.taxId) request.buyerId = `10:${billing.taxId}`;
    body = await dispatchFiscalOnce({operationKey: key, requestJson: JSON.stringify(request), url: `${host}/receipt/${final ? "advance/finalize" : kind + "/sale"}`, headers: {"content-type": "application/json", Authorization: `Bearer ${config().FISCOMM_API_KEY}`},
      normalizeResponse(value: Record<string, unknown>) {
        const receipt = (final ? value.finalReceipt : value.receipt) as Record<string, unknown> | undefined;
        const refund = value.refundReceipt as Record<string, unknown> | undefined;
        if (final && !refund?.invoiceNumber) return {};
        if (!receipt?.sdcDateTime || Math.round(Number(receipt.totalAmount) * 100) !== Number(order.total_minor)) return {};
        return {...value, ...receipt};
      },
      journal: {
        async claim(operationKey: string, requestJson: string) { const result = await run("INSERT INTO fiscal_dispatches (operation_key, request_json, status) VALUES (?, ?, 'sending') ON CONFLICT(operation_key) DO NOTHING", operationKey, requestJson); return Number(result.meta?.changes ?? 0) === 1; },
        async read(operationKey: string) { const row = await first<Record<string, unknown>>("SELECT * FROM fiscal_dispatches WHERE operation_key = ?", operationKey); return row ? {status: row.status, responseJson: row.response_json} : null; },
        async finish(operationKey: string, status: string, responseJson: string | null) { await run("UPDATE fiscal_dispatches SET status = ?, response_json = ?, updated_at = ? WHERE operation_key = ?", status, responseJson, new Date().toISOString(), operationKey); },
      },
    }) as Record<string, unknown>;
  }
  let referenceId = advance ? String(advance.id) : null;
  if (final) referenceId = await saveIssued(orderId, `receipt:${orderId}:advance_refund`, "refund", body.refundReceipt as Record<string, unknown>, referenceId);
  await saveIssued(orderId, key, kind, body, referenceId);
  return {externalId: String(body.invoiceNumber), status: "issued" as const};
}
