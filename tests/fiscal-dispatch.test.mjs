import assert from 'node:assert/strict';
import test from 'node:test';
import { dispatchFiscalOnce } from '../integrations/fiscal-dispatch.mjs';
import { commerceReadiness } from '../integrations/commerce-readiness.mjs';

function fixture(fetcher) {
  const records = new Map(); let calls = 0;
  const journal = {
    async claim(key, requestJson) { if (records.has(key)) return false; records.set(key, { requestJson, status: 'sending' }); return true; },
    async read(key) { return records.get(key); },
    async finish(key, status, responseJson) { Object.assign(records.get(key), { status, responseJson }); },
  };
  const dispatch = (requestJson = '{"amount":100}') => dispatchFiscalOnce({ operationKey: 'receipt:1:sale', requestJson, url: 'https://fiscal.example.test', headers: {}, journal, fetcher: async (...args) => { calls++; return fetcher(...args); } });
  return { records, journal, dispatch, calls: () => calls };
}

test('fiscal response persists before receipt projection and replay never issues twice', async () => {
  const f = fixture(async () => Response.json({ invoiceNumber: 'PFR-123', pdf: 'https://example.test/a.pdf' }));
  assert.equal((await f.dispatch()).invoiceNumber, 'PFR-123');
  assert.equal((await f.dispatch('{"changed":true}')).invoiceNumber, 'PFR-123');
  assert.equal(f.calls(), 1);
  assert.equal(f.records.values().next().value.requestJson, '{"amount":100}');
});

test('timeout or malformed response stays blocked even if operator requeues event', async () => {
  for (const fetcher of [async () => { throw new Error('connection reset'); }, async () => new Response('broken'), async () => Response.json({ requestId: 'accepted-is-not-issued' })]) {
    const f = fixture(fetcher);
    await assert.rejects(f.dispatch(), /prekinuta|nema broj/);
    await assert.rejects(f.dispatch(), { code: 'FISCAL_RECONCILIATION_REQUIRED' });
    assert.equal(f.calls(), 1);
    assert.equal(f.records.values().next().value.status, 'unknown');
  }
});

test('crash while sending and concurrent attempts cannot double POST', async () => {
  const f = fixture(async () => Response.json({ invoiceNumber: 'PFR-2' }));
  await f.journal.claim('receipt:1:sale', '{}');
  await assert.rejects(f.dispatch(), { code: 'FISCAL_RECONCILIATION_REQUIRED' });
  assert.equal(f.calls(), 0);
  const g = fixture(async () => Response.json({ invoiceNumber: 'PFR-3' }));
  const result = await Promise.allSettled([g.dispatch(), g.dispatch()]);
  assert.ok(result.some(r => r.status === 'fulfilled'));
  assert.equal(g.calls(), 1);
});

test('provider rejection and 5xx do not become issued or silently retry', async () => {
  for (const status of [400, 500]) {
    const f = fixture(async () => Response.json({ error: 'nope' }, { status }));
    await assert.rejects(f.dispatch(), { code: `BADI_HTTP_${status}` });
    assert.equal(f.records.values().next().value.status, status === 400 ? 'rejected' : 'unknown');
    await assert.rejects(f.dispatch(), { code: 'FISCAL_RECONCILIATION_REQUIRED' });
    assert.equal(f.calls(), 1);
  }
});

test('readiness never equates populated credentials or mocks with real card availability', () => {
  const result = commerceReadiness({ PAYMENT_PROVIDER: 'otp', PAYMENT_MODE: 'production', PAYMENT_API_SECRET: 'secret-value', BADI_MODE: 'mock', BADI_API_SECRET: 'fiscal-secret' });
  assert.equal(result.payment.cardAvailable, false);
  assert.equal(result.payment.recurringCardAvailable, false);
  assert.equal(result.fiscalization.status, 'not_connected');
  assert.doesNotMatch(JSON.stringify(result), /secret-value|fiscal-secret/);
});
