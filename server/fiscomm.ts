import { env } from "./runtime";
import { assertDomain } from "./domain";
import { all, batch, first, run } from "./sql";
import { enqueueOnce } from "./outbox";
import { dispatchFiscalOnce } from "../integrations/fiscal-dispatch.mjs";
import { buildFiscalSnapshot, fiscalDeliveryItems } from "../integrations/fiscal-deliveries.mjs";

const host = "https://api.fiscomm.rs";
const config = () => env as unknown as Record<string, string | undefined>;
export function fiscommMode() { return config().FISCOMM_MODE?.trim() || "training"; }
export async function fiscommRead(path: "/receipt/tax-rates" | "/auth/api-key/me") {
  assertDomain(config().FISCOMM_API_KEY, "FISCAL_NOT_CONFIGURED", "Fiscomm API ključ nije podešen na serveru.", 503);
  const response = await fetch(`${host}${path}`, {headers: {Authorization: `Bearer ${config().FISCOMM_API_KEY}`}, signal: AbortSignal.timeout(15_000)});
  assertDomain(response.ok, "FISCOMM_CONNECTION_FAILED", `Fiscomm provera nije uspela (HTTP ${response.status}).`, 503);
  return response.json();
}
export function fiscommSelected() { return config().FISCAL_PROVIDER === "fiscomm"; }
export async function receiptOperation(orderId: string, deliveryId: string | boolean = false) {
  const pack = await first<Record<string, unknown>>("SELECT status FROM subscription_packages WHERE order_id = ?", orderId);
  if (!deliveryId && !fiscommSelected() && !pack) return {pack, kind:"normal", key:`receipt:${orderId}:sale`};
  if (deliveryId) return {pack, kind: "final", key: typeof deliveryId === "string" ? `receipt:${orderId}:delivery:${deliveryId}` : `receipt:${orderId}:final`};
  const snapshot = await first<Record<string, unknown>>("SELECT snapshot_json FROM fiscal_order_snapshots WHERE order_id = ?", orderId);
  const cod = !pack && await first<Record<string, unknown>>(`SELECT o.id FROM orders o WHERE o.id = ? AND o.fulfillment_status = 'delivered'
    AND (SELECT COUNT(DISTINCT a.delivery_order_id) FROM fiscal_delivery_allocations a JOIN order_items oi ON oi.id=a.order_item_id WHERE oi.order_id=o.id) = 1
    AND NOT EXISTS(SELECT 1 FROM order_items oi WHERE oi.order_id=o.id AND (SELECT COALESCE(SUM(a.quantity),0) FROM fiscal_delivery_allocations a WHERE a.order_item_id=oi.id AND a.prepaid=0) < oi.quantity)`, orderId);
  const normal = snapshot ? JSON.parse(String(snapshot.snapshot_json)).paymentTiming === "normal" : Boolean(cod);
  return {pack, kind: normal ? "normal" : "advance", key: `receipt:${orderId}:${normal ? "sale" : "advance"}`};
}
function dispatchInProgress(row: Record<string, unknown> | null) {
  const timestamp = String(row?.updated_at ?? "").replace(" ", "T");
  const updated = Date.parse(/(?:Z|[+-]\d\d:\d\d)$/.test(timestamp) ? timestamp : timestamp + "Z");
  return row?.status === "sending" && Number.isFinite(updated) && Date.now() - updated < 5 * 60_000;
}
function safeUrl(value: unknown): string | null {
  try { const url = new URL(String(value)); return url.protocol === "https:" ? url.toString() : null; } catch { return null; }
}
async function saveIssued(orderId: string, key: string, kind: string, body: Record<string, unknown>, referenceId: string | null) {
  const id = key;
  const now = new Date().toISOString();
  const training = body.fiscommMode === "training";
  await batch([
    {sql: "INSERT INTO fiscal_receipts (id, order_id, operation_key, kind, status, provider, invoice_number, provider_reference, pdf_url, pfr_time, verification_url, reference_receipt_id, issued_at, updated_at) VALUES (?, ?, ?, ?, 'issued', ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(operation_key) DO UPDATE SET status = 'issued', provider = excluded.provider, invoice_number = excluded.invoice_number, provider_reference = excluded.provider_reference, pdf_url = excluded.pdf_url, pfr_time = excluded.pfr_time, verification_url = excluded.verification_url, reference_receipt_id = excluded.reference_receipt_id, issued_at = excluded.issued_at, updated_at = excluded.updated_at, last_error_code = NULL, last_error_message = NULL", bindings: [id, orderId, key, kind, training ? "fiscomm-training" : body.fiscommMode === "mock" ? "fiscomm-mock" : "fiscomm", String(body.invoiceNumber), String(body.invoiceNumber), safeUrl(body.invoicePdfUrl), String(body.sdcDateTime ?? now), safeUrl(body.verificationUrl), referenceId, now, now]},
    enqueueOnce("email.fiscal_document.requested", "order", orderId, {invoiceNumber: body.invoiceNumber, documentKind: kind, training, documentUrl: safeUrl(body.invoicePdfUrl) ?? safeUrl(body.verificationUrl)}, `fiscal-email:${key}`),
  ]);
  return id;
}
export async function issueFiscomm(orderId: string, deliveryId: string | boolean = false): Promise<{externalId: string; status: "issued"}> {
  assertDomain(deliveryId !== true, "FISCAL_LEGACY_REVIEW_REQUIRED", "Stari završni događaj zahteva usaglašavanje; računi se sada izdaju po isporuci.", 409);
  const final = typeof deliveryId === "string";
  const {kind, key} = await receiptOperation(orderId, deliveryId);
  const mode = fiscommMode();
  const training = fiscommSelected() && mode === "training";
  const mock = config().APP_ENV === "local" && (mode === "mock" || (!fiscommSelected() && (config().BADI_MODE ?? "mock") === "mock"));
  const expectedMode = training ? "training" : mock ? "mock" : "live";
  const assertSameMode = (previousMode: string) => assertDomain(expectedMode === previousMode, "FISCAL_MODE_MISMATCH", "Porudžbina već ima dokument iz drugog režima. Za test koristite novu porudžbinu.", 409);
  const order = await first<Record<string, unknown>>("SELECT * FROM orders WHERE id = ?", orderId);
  assertDomain(order, "ORDER_NOT_FOUND", "Porudžbina nije pronađena.", 404);
  assertDomain(order.payment_status === "paid", "PAYMENT_NOT_CAPTURED", "Najpre evidentirajte uplatu.", 409);
  if (final && (await receiptOperation(orderId)).kind === "normal") return issueFiscomm(orderId);
  await run("INSERT INTO fiscal_receipts (id, order_id, operation_key, kind, status, provider) VALUES (?, ?, ?, ?, 'pending', 'fiscomm') ON CONFLICT(operation_key) DO NOTHING", key, orderId, key, kind);
  if (final) {
    const owned = await first<Record<string, unknown>>("SELECT a.delivery_order_id FROM fiscal_delivery_allocations a JOIN order_items oi ON oi.id=a.order_item_id WHERE a.delivery_order_id=? AND oi.order_id=?", deliveryId, orderId);
    assertDomain(owned, "FISCAL_ALLOCATION_MISSING", "Isporuka nema sačuvanu raspodelu kupljenih količina.", 409);
    const delivered = await first<Record<string, unknown>>("SELECT id FROM delivery_orders WHERE id = ? AND status = 'delivered'", deliveryId);
    assertDomain(delivered, "FISCAL_DELIVERY_NOT_COMPLETED", "Račun zahteva potvrđenu isporuku.", 409);
    // The payment and delivery jobs may arrive in either order. Establish the
    // original document first; its durable journal prevents a second issuance.
    await issueFiscomm(orderId);
  }
  const current = await first<Record<string, unknown>>("SELECT * FROM fiscal_receipts WHERE operation_key = ?", key);
  if (current?.status === "issued") {
    assertSameMode(current.provider === "fiscomm-training" ? "training" : current.provider === "fiscomm-mock" ? "mock" : "live");
    return {externalId: String(current.invoice_number), status: "issued"};
  }
  const advance = final ? await first<Record<string, unknown>>("SELECT * FROM fiscal_receipts WHERE operation_key = ? AND status = 'issued'", `receipt:${orderId}:advance`) : null;
  if (final) assertDomain(advance, "ADVANCE_NOT_ISSUED", "Račun isporuke čeka uspešno izdat avansni račun.", 503);
  if (advance) assertSameMode(advance.provider === "fiscomm-training" ? "training" : advance.provider === "fiscomm-mock" ? "mock" : "live");
  let body: Record<string, unknown>;
  const previous = await first<Record<string, unknown>>("SELECT * FROM fiscal_dispatches WHERE operation_key = ?", key);
  if (previous) {
    assertDomain(previous.status === "issued" && previous.response_json, dispatchInProgress(previous) ? "FISCAL_ORDER_BUSY" : "FISCAL_RECONCILIATION_REQUIRED", "Ishod slanja se prvo mora proveriti u Fiscomm servisu; novi račun nije poslat.", 503);
    body = JSON.parse(String(previous.response_json));
    assertSameMode(String(body.fiscommMode ?? "live"));
  } else {
    assertDomain(mock || (fiscommSelected() && (training || mode === "live")), "FISCAL_NOT_CONFIGURED", "Fiscomm izdavanje čeka aktivaciju i potvrđene poreske oznake.", 503);
    const unresolved = await first<Record<string, unknown>>("SELECT fd.* FROM fiscal_dispatches fd JOIN fiscal_receipts fr ON fr.operation_key=fd.operation_key WHERE fr.order_id=? AND fd.operation_key != ? AND fd.status != 'issued'", orderId, key);
    assertDomain(!unresolved, dispatchInProgress(unresolved) ? "FISCAL_ORDER_BUSY" : "FISCAL_RECONCILIATION_REQUIRED", "Prethodni fiskalni zahtev ove porudžbine zahteva proveru pre novog izdavanja.", 503);
    const taxes = mock ? null : await fiscommRead("/receipt/tax-rates");
    const validLabels = new Set<string>((taxes?.currentTaxRates?.taxCategories ?? []).flatMap((category: {taxRates: {label: string}[]}) => category.taxRates.map(rate => rate.label)));
    let saved = await first<Record<string, unknown>>("SELECT snapshot_json FROM fiscal_order_snapshots WHERE order_id = ?", orderId);
    if (!saved) {
      // Never reinterpret receipts or historical fulfilled quantities under a new model.
      const old = await first<Record<string, unknown>>("SELECT id FROM fiscal_receipts fr WHERE order_id = ? AND (status = 'issued' OR EXISTS(SELECT 1 FROM fiscal_dispatches fd WHERE fd.operation_key=fr.operation_key AND fr.operation_key != ?))", orderId, key);
      const imported = await first<Record<string, unknown>>("SELECT pl.id FROM package_lines pl JOIN order_items oi ON oi.id=pl.order_item_id WHERE oi.order_id=? AND pl.imported_delivered_quantity > 0", orderId);
      assertDomain(!old && !imported, "FISCAL_LEGACY_REVIEW_REQUIRED", "Postojeći fiskalni dokumenti zahtevaju usaglašavanje pre izdavanja po isporuci.", 409);
      const rows = await all<Record<string, unknown>>(`SELECT oi.*, COALESCE(oi.fiscal_tax_label, p.fiscal_tax_label) AS tax_label,
        oi.quantity * COALESCE(pl.required_deliveries,1) AS purchased_quantity
        FROM order_items oi JOIN products p ON p.id=oi.product_id LEFT JOIN package_lines pl ON pl.order_item_id=oi.id WHERE oi.order_id=? ORDER BY oi.id`, orderId);
      assertDomain(rows.length && (mock || rows.every(item => validLabels.has(String(item.tax_label)))), "FISCAL_TAX_LABEL_MISSING", "Izaberite potvrđenu poresku oznaku za svaki proizvod u administraciji.", 503);
      const snapshot = buildFiscalSnapshot(rows, Number(order.total_minor), Number(order.delivery_fee_minor), config().FISCOMM_DELIVERY_TAX_LABEL, kind);
      const initial = fiscalDeliveryItems(snapshot);
      assertDomain(mock || initial.items.every((item: {labels: string[]}) => item.labels.every(label => validLabels.has(label))), "FISCAL_TAX_LABEL_MISSING", "Potrebna je potvrđena poreska oznaka dostave.", 503);
      await run("INSERT INTO fiscal_order_snapshots(order_id,snapshot_json) VALUES(?,?) ON CONFLICT(order_id) DO NOTHING", orderId, JSON.stringify(snapshot));
      saved = await first<Record<string, unknown>>("SELECT snapshot_json FROM fiscal_order_snapshots WHERE order_id = ?", orderId);
    }
    const snapshot = JSON.parse(String(saved!.snapshot_json));
    const allocations = final ? await all<Record<string, unknown>>(`SELECT a.* FROM fiscal_delivery_allocations a JOIN order_items oi ON oi.id=a.order_item_id WHERE a.delivery_order_id=? AND oi.order_id=? ORDER BY oi.id`, deliveryId, orderId) : undefined;
    assertDomain(!final || allocations?.length, "FISCAL_ALLOCATION_MISSING", "Isporuka nema sačuvanu raspodelu kupljenih količina.", 409);
    const {items, totalMinor} = fiscalDeliveryItems(snapshot, allocations);
    assertDomain(mock || items.every((item: {labels: string[]}) => item.labels.every(label => validLabels.has(label))), "FISCAL_TAX_LABEL_MISSING", "Sačuvana poreska oznaka više nije aktivna; potrebna je provera.", 503);
    const request: Record<string, unknown> = {
      orderNumber: `${order.order_number}-${training ? "TRAINING-" : ""}${final ? `DELIVERY-${deliveryId}` : kind.toUpperCase()}`,
      items, payments: [{type: order.payment_method === "card" ? "card" : "cash", amount:totalMinor/100, ...(!training && final ? {advanceAmount:totalMinor/100} : {})}],
      metaFields: {order_id:orderId, ...(final ? {delivery_order_id:deliveryId} : {})},
      settings: {returnIfOrderNumberExists:true, ...(!training && final ? {isFinal:true, skipBuyerIdValidation:true, skipAdvanceChainDerivation:true} : {})},
      ...(!training && final ? {referentDocumentNumber:advance!.invoice_number, referentDocumentDt:advance!.pfr_time} : {}),
    };
    const billing = JSON.parse(String(order.billing_json ?? '{}'));
    if (billing.taxId) request.buyerId = `10:${billing.taxId}`;
    // skipAdvanceChainDerivation is documented by Fiscomm: use precisely this
    // delivery's amount, not the remaining/full advance-chain amount.
    body = await dispatchFiscalOnce({operationKey:key, requestJson:JSON.stringify(request), url:`${host}/receipt/${training ? "training/sale" : final ? "advance/finalize" : kind + "/sale"}`,
      headers:{"content-type":"application/json", Authorization:`Bearer ${config().FISCOMM_API_KEY}`},
      ...(mock ? {fetcher:async () => {
        const receipt = {invoiceNumber:`MOCK-${key}`, sdcDateTime:new Date().toISOString(), totalAmount:totalMinor/100};
        return Response.json(final ? {finalReceipt:receipt, refundReceipt:{...receipt, invoiceNumber:`MOCK-REFUND-${key}`}} : {receipt});
      }} : {}),
      normalizeResponse(value: Record<string, unknown>) {
        const receipt = (final && !training ? value.finalReceipt : value.receipt) as Record<string, unknown> | undefined;
        const refund = value.refundReceipt as Record<string, unknown> | undefined;
        if (final && !training && (!refund?.invoiceNumber || !refund.sdcDateTime || Math.round(Number(refund.totalAmount)*100) !== totalMinor)) return {};
        if (!receipt?.sdcDateTime || Math.round(Number(receipt.totalAmount)*100) !== totalMinor) return {};
        return {...value, ...receipt, fiscommMode:training ? "training" : mock ? "mock" : "live"};
      },
      journal: {
        async claim(operationKey: string, requestJson: string) { const result = await run("INSERT INTO fiscal_dispatches (operation_key, request_json, status, updated_at) VALUES (?, ?, 'sending', ?) ON CONFLICT(operation_key) DO NOTHING", operationKey, requestJson, new Date().toISOString()); return Number(result.meta?.changes ?? 0) === 1; },
        async read(operationKey: string) { const row = await first<Record<string, unknown>>("SELECT * FROM fiscal_dispatches WHERE operation_key = ?", operationKey); return row ? {status:row.status, responseJson:row.response_json} : null; },
        async finish(operationKey: string, status: string, responseJson: string | null) { await run("UPDATE fiscal_dispatches SET status = ?, response_json = ?, updated_at = ? WHERE operation_key = ?", status, responseJson, new Date().toISOString(), operationKey); },
      },
    }).catch(async (error: unknown) => {
      if (error instanceof Error && "code" in error && error.code === "FISCAL_RECONCILIATION_REQUIRED") {
        const active = await first<Record<string, unknown>>("SELECT * FROM fiscal_dispatches WHERE operation_key=?", key);
        assertDomain(!dispatchInProgress(active), "FISCAL_ORDER_BUSY", "Fiskalni zahtev je u obradi. Provera će biti ponovljena bez duplog izdavanja.", 503);
      }
      throw error;
    }) as Record<string, unknown>;
  }
  let referenceId = advance ? String(advance.id) : null;
  // The nested refund receipt carries no mode of its own; label it like the final document.
  if (final && !training) referenceId = await saveIssued(orderId, `${key}:advance_refund`, "refund", {...(body.refundReceipt as Record<string, unknown>), fiscommMode: body.fiscommMode}, referenceId);
  await saveIssued(orderId, key, kind, body, referenceId);
  return {externalId:String(body.invoiceNumber), status:"issued"};
}

/** Units of a paid order that no delivery has consumed yet, priced exactly as the original
 * document priced them (per-unit split of discounts and the delivery fee). Null until the
 * original document froze the snapshot. */
export async function fiscalRefundRemainder(orderId: string): Promise<{items: Array<Record<string, unknown>>; totalMinor: number} | null> {
  const saved = await first<Record<string, unknown>>("SELECT snapshot_json FROM fiscal_order_snapshots WHERE order_id = ?", orderId);
  if (!saved) return null;
  const snapshot = JSON.parse(String(saved.snapshot_json));
  const used = new Map((await all<Record<string, unknown>>("SELECT order_item_id, COALESCE(SUM(quantity), 0) AS used FROM fiscal_delivery_allocations WHERE order_item_id IN (SELECT id FROM order_items WHERE order_id = ?) GROUP BY order_item_id", orderId)).map(row => [String(row.order_item_id), Number(row.used)]));
  const remaining = (snapshot.lines as Array<{orderItemId: string; quantity: number}>)
    .map(line => ({order_item_id: line.orderItemId, unit_offset: used.get(line.orderItemId) ?? 0, quantity: line.quantity - (used.get(line.orderItemId) ?? 0)}))
    .filter(allocation => allocation.quantity > 0);
  if (!remaining.length) return {items: [], totalMinor: 0};
  return fiscalDeliveryItems(snapshot, remaining);
}

/** Refund document for the undelivered remainder of a paid order (Avans–Refundacija, or
 * Promet–Refundacija when the original was a normal receipt). It references the original
 * document and is issued at most once per order; the dispatch journal makes a repeat a replay. */
export async function issueFiscommRefund(orderId: string): Promise<{externalId: string; status: "issued" | "skipped"; amountMinor: number}> {
  const order = await first<Record<string, unknown>>("SELECT * FROM orders WHERE id = ?", orderId);
  assertDomain(order, "ORDER_NOT_FOUND", "Porudžbina nije pronađena.", 404);
  assertDomain(order.payment_status === "paid", "PAYMENT_NOT_CAPTURED", "Refundacija je moguća samo za naplaćenu porudžbinu.", 409);
  const original = await first<Record<string, unknown>>("SELECT * FROM fiscal_receipts WHERE order_id = ? AND status = 'issued' AND kind IN ('advance','normal') ORDER BY issued_at LIMIT 1", orderId);
  assertDomain(original, "FISCAL_ORIGINAL_MISSING", "Fiskalni dokument uplate još nije izdat; refundacija čeka njegovo izdavanje.", 409);
  assertDomain(String(original.provider).startsWith("fiscomm"), "FISCAL_LEGACY_REVIEW_REQUIRED", "Originalni dokument nije izdat kroz Fiscomm; refundacija zahteva usaglašavanje.", 409);
  const key = `receipt:${orderId}:refund`;
  const remainder = await fiscalRefundRemainder(orderId);
  assertDomain(remainder, "FISCAL_ORIGINAL_MISSING", "Nema sačuvanog fiskalnog snimka porudžbine.", 409);
  const {items, totalMinor} = remainder;
  assertDomain(totalMinor > 0, "NOTHING_TO_REFUND", "Nema neisporučene količine za fiskalnu refundaciju.", 409);
  // Training documents represent no fiscal transaction, so there is nothing to refund fiscally.
  if (original.provider === "fiscomm-training") return {externalId: `training-skip:${orderId}`, status: "skipped", amountMinor: totalMinor};
  const mode = fiscommMode();
  const mock = config().APP_ENV === "local" && (mode === "mock" || (!fiscommSelected() && (config().BADI_MODE ?? "mock") === "mock"));
  assertDomain((original.provider === "fiscomm-mock") === mock, "FISCAL_MODE_MISMATCH", "Porudžbina već ima dokument iz drugog režima. Za test koristite novu porudžbinu.", 409);
  await run("INSERT INTO fiscal_receipts (id, order_id, operation_key, kind, status, provider) VALUES (?, ?, ?, 'refund', 'pending', 'fiscomm') ON CONFLICT(operation_key) DO NOTHING", key, orderId, key);
  const current = await first<Record<string, unknown>>("SELECT * FROM fiscal_receipts WHERE operation_key = ?", key);
  if (current?.status === "issued") return {externalId: String(current.invoice_number), status: "issued", amountMinor: totalMinor};
  let body: Record<string, unknown>;
  const previous = await first<Record<string, unknown>>("SELECT * FROM fiscal_dispatches WHERE operation_key = ?", key);
  if (previous) {
    assertDomain(previous.status === "issued" && previous.response_json, dispatchInProgress(previous) ? "FISCAL_ORDER_BUSY" : "FISCAL_RECONCILIATION_REQUIRED", "Ishod slanja se prvo mora proveriti u Fiscomm servisu; novi dokument nije poslat.", 503);
    body = JSON.parse(String(previous.response_json));
  } else {
    assertDomain(mock || (fiscommSelected() && mode === "live"), "FISCAL_NOT_CONFIGURED", "Fiscomm izdavanje čeka aktivaciju i potvrđene poreske oznake.", 503);
    const unresolved = await first<Record<string, unknown>>("SELECT fd.* FROM fiscal_dispatches fd JOIN fiscal_receipts fr ON fr.operation_key=fd.operation_key WHERE fr.order_id=? AND fd.operation_key != ? AND fd.status != 'issued'", orderId, key);
    assertDomain(!unresolved, dispatchInProgress(unresolved) ? "FISCAL_ORDER_BUSY" : "FISCAL_RECONCILIATION_REQUIRED", "Prethodni fiskalni zahtev ove porudžbine zahteva proveru pre novog izdavanja.", 503);
    const billing = JSON.parse(String(order.billing_json ?? "{}"));
    const request: Record<string, unknown> = {
      orderNumber: `${order.order_number}-REFUND`,
      items, payments: [{type: order.payment_method === "card" ? "card" : "cash", amount: totalMinor / 100}],
      referentDocumentNumber: original.invoice_number, referentDocumentDt: original.pfr_time,
      metaFields: {order_id: orderId, referent_operation_key: original.operation_key},
      settings: {returnIfOrderNumberExists: true, ...(billing.taxId ? {} : {skipBuyerIdValidation: true})},
      ...(billing.taxId ? {buyerId: `10:${billing.taxId}`} : {}),
    };
    body = await dispatchFiscalOnce({operationKey: key, requestJson: JSON.stringify(request), url: `${host}/receipt/${original.kind}/refund`,
      headers: {"content-type": "application/json", Authorization: `Bearer ${config().FISCOMM_API_KEY}`},
      ...(mock ? {fetcher: async () => Response.json({receipt: {invoiceNumber: `MOCK-${key}`, sdcDateTime: new Date().toISOString(), totalAmount: totalMinor / 100}})} : {}),
      normalizeResponse(value: Record<string, unknown>) {
        const receipt = value.receipt as Record<string, unknown> | undefined;
        if (!receipt?.sdcDateTime || Math.round(Number(receipt.totalAmount) * 100) !== totalMinor) return {};
        return {...value, ...receipt, fiscommMode: mock ? "mock" : "live"};
      },
      journal: {
        async claim(operationKey: string, requestJson: string) { const result = await run("INSERT INTO fiscal_dispatches (operation_key, request_json, status, updated_at) VALUES (?, ?, 'sending', ?) ON CONFLICT(operation_key) DO NOTHING", operationKey, requestJson, new Date().toISOString()); return Number(result.meta?.changes ?? 0) === 1; },
        async read(operationKey: string) { const row = await first<Record<string, unknown>>("SELECT * FROM fiscal_dispatches WHERE operation_key = ?", operationKey); return row ? {status: row.status, responseJson: row.response_json} : null; },
        async finish(operationKey: string, status: string, responseJson: string | null) { await run("UPDATE fiscal_dispatches SET status = ?, response_json = ?, updated_at = ? WHERE operation_key = ?", status, responseJson, new Date().toISOString(), operationKey); },
      },
    }).catch(async (error: unknown) => {
      if (error instanceof Error && "code" in error && error.code === "FISCAL_RECONCILIATION_REQUIRED") {
        const active = await first<Record<string, unknown>>("SELECT * FROM fiscal_dispatches WHERE operation_key=?", key);
        assertDomain(!dispatchInProgress(active), "FISCAL_ORDER_BUSY", "Fiskalni zahtev je u obradi. Provera će biti ponovljena bez duplog izdavanja.", 503);
      }
      throw error;
    }) as Record<string, unknown>;
  }
  await saveIssued(orderId, key, "refund", body, String(original.id));
  return {externalId: String(body.invoiceNumber), status: "issued", amountMinor: totalMinor};
}
