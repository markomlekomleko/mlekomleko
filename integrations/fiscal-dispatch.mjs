/** A journal is committed before POST. No provider idempotency guarantee is assumed. */
export class FiscalDispatchError extends Error {
  constructor(code, message) { super(message); this.name = 'FiscalDispatchError'; this.code = code; }
}

export async function dispatchFiscalOnce({ operationKey, requestJson, url, headers, journal, fetcher = fetch, normalizeResponse = value => value }) {
  // claim atomically inserts immutable request + sending state; one process wins.
  const claimed = await journal.claim(operationKey, requestJson);
  if (!claimed) {
    const previous = await journal.read(operationKey);
    if (previous?.status === 'issued' && previous.responseJson) return JSON.parse(previous.responseJson);
    throw new FiscalDispatchError('FISCAL_RECONCILIATION_REQUIRED', 'Ishod prethodnog zahteva mora se proveriti kod fiskalnog servisa. Novo izdavanje je zaustavljeno da se račun ne duplira.');
  }
  let response;
  let body;
  try {
    response = await fetcher(url, { method: 'POST', headers, body: requestJson, signal: AbortSignal.timeout(25_000) });
    body = await response.json();
  } catch {
    await journal.finish(operationKey, 'unknown', null);
    throw new FiscalDispatchError('FISCAL_OUTCOME_UNKNOWN', 'Veza sa fiskalnim servisom je prekinuta ili odgovor nije čitljiv. Proverite da li je račun izdat pre bilo kakvog ponavljanja.');
  }
  if (!response.ok) {
    // A 5xx can follow issuance. Even a rejected request requires an explicit reviewed retry.
    await journal.finish(operationKey, response.status >= 500 ? 'unknown' : 'rejected', JSON.stringify(body));
    throw new FiscalDispatchError(`BADI_HTTP_${response.status}`, `Fiskalni servis je vratio HTTP ${response.status}. Proverite zahtev i njegov ishod u servisu.`);
  }
  try { body = normalizeResponse(body); } catch { /* Invalid response remains unknown. */ }
  if (!body || typeof body.invoiceNumber !== 'string' || !body.invoiceNumber.trim()) {
    await journal.finish(operationKey, 'unknown', JSON.stringify(body ?? null));
    throw new FiscalDispatchError('FISCAL_RESPONSE_INVALID', 'Odgovor fiskalnog servisa nema broj izdatog računa. Potrebna je provera u servisu.');
  }
  await journal.finish(operationKey, 'issued', JSON.stringify(body));
  return body;
}
