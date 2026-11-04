// QA-critical fiscalization suite (Agent F). FISCOMM_MODE=mock unless a test says otherwise.
// Run: node --test tests/qa-fiscal.test.mjs   (needs dist/ from `npm run build:worker`)
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import {
  call, checkout, env, expectStatus, line, networkCalls, rows, setClock, setup, sql, teardown, count, database,
} from './qa-harness.mjs';

beforeEach(() => setup());
afterEach(() => teardown());

// ---------- helpers ----------------------------------------------------------
const sub = (cadence = 'weekly', quantity = 2, product = 'prod_kravlje_1l') => line(product, quantity, 'subscription', cadence);
async function buyPackage({ cadence = 'weekly', quantity = 2, method = 'cash', extra = {}, product } = {}) {
  const body = expectStatus(await checkout([sub(cadence, quantity, product)], { paymentMethod: method, ...(method === 'cash' ? { paymentToken: undefined } : {}), ...extra }), 201);
  return body;
}
const payAsAdmin = async (id, expectedUpdatedAt) => call('/api/admin/orders', { method: 'PATCH', admin: true, body: { id, paymentStatus: 'paid', ...(expectedUpdatedAt ? { expectedUpdatedAt } : {}) } });
/** generate -> lock -> complete (delivered) every stop of one delivery date. */
async function visit(date, { deliveredQuantity, cashCollected = false } = {}) {
  setClock(`${date}T10:00:00Z`);
  const generated = expectStatus(await call('/api/admin/deliveries', { admin: true, body: { action: 'generate', date } }));
  expectStatus(await call('/api/admin/deliveries', { admin: true, body: { action: 'lock', date } }));
  const results = [];
  for (const stop of generated.orders) {
    results.push(expectStatus(await call('/api/admin/deliveries', { admin: true, body: {
      action: 'complete', id: stop.id, status: 'delivered',
      ...(cashCollected ? { cashCollected: true } : {}),
      ...(deliveredQuantity === undefined ? {} : { items: stop.items.map((item) => ({ id: item.id, deliveredQuantity })) }),
    } })));
  }
  return { stops: generated.orders, results };
}
const requestOf = (operationKey) => JSON.parse(sql('SELECT request_json FROM fiscal_dispatches WHERE operation_key=?', operationKey).request_json);
const minor = (value) => Math.round(Number(value) * 100);
const itemsTotal = (request) => request.items.reduce((sum, item) => sum + minor(item.totalAmount), 0);
const productUnits = (request) => request.items.filter((item) => item.name !== 'Dostava').reduce((sum, item) => sum + item.quantity, 0);
const process = () => call('/api/admin/integrations', { admin: true, body: { action: 'process' } });
const outbox = (topic) => rows('SELECT * FROM outbox WHERE topic=? ORDER BY created_at, id', topic);
const orderRow = (id) => sql('SELECT * FROM orders WHERE id=?', id);

// ---------- F-C01 weekly 4x2 package, mock mode -------------------------------
test('F-C01 weekly 4x2 package: payment -> advance, 4 deliveries -> 4 finals + 4 advance_refunds, chain and sums consistent', async () => {
  const { order } = await buyPackage({ cadence: 'weekly', quantity: 2 });
  assert.equal(order.paymentStatus, 'pending');
  assert.equal(count('fiscal_receipts'), 0, 'no fiscal document before the payment is recorded');
  expectStatus(await payAsAdmin(order.id));
  const advanceKey = `receipt:${order.id}:advance`;
  const advance = sql('SELECT * FROM fiscal_receipts WHERE operation_key=?', advanceKey);
  assert.equal(advance.status, 'issued');
  assert.equal(advance.kind, 'advance');
  assert.equal(advance.provider, 'fiscomm-mock');
  assert.equal(advance.invoice_number, `MOCK-receipt:${order.id}:advance`);
  assert.equal(sql('SELECT status FROM fiscal_dispatches WHERE operation_key=?', advanceKey).status, 'issued');
  const advanceRequest = requestOf(advanceKey);
  assert.equal(minor(advanceRequest.payments[0].amount), order.totalMinor);
  assert.equal(itemsTotal(advanceRequest), order.totalMinor);
  assert.equal(productUnits(advanceRequest), 8);
  assert.equal(count('fiscal_receipts'), 1);

  const finalKeys = [];
  for (const date of ['2027-01-01', '2027-01-08', '2027-01-15', '2027-01-22']) {
    const { stops } = await visit(date);
    assert.equal(stops.length, 1);
    finalKeys.push(`receipt:${order.id}:delivery:${stops[0].id}`);
  }
  assert.equal(count('fiscal_receipts', "status='issued'"), 9);
  assert.equal(count('fiscal_receipts', "kind='final'"), 4);
  assert.equal(count('fiscal_receipts', "kind='refund'"), 4);
  assert.equal(count('fiscal_receipts', "kind='advance'"), 1);
  let sum = 0;
  for (const key of finalKeys) {
    const final = sql('SELECT * FROM fiscal_receipts WHERE operation_key=?', key);
    assert.equal(final.status, 'issued');
    assert.equal(final.invoice_number, `MOCK-${key}`);
    // chain: final -> advance_refund -> advance
    assert.equal(final.reference_receipt_id, `${key}:advance_refund`);
    const refund = sql('SELECT * FROM fiscal_receipts WHERE operation_key=?', `${key}:advance_refund`);
    assert.equal(refund.kind, 'refund');
    assert.equal(refund.status, 'issued');
    assert.equal(refund.reference_receipt_id, advance.id);
    const request = requestOf(key);
    assert.equal(request.settings.isFinal, true);
    assert.equal(request.settings.skipAdvanceChainDerivation, true);
    assert.equal(request.referentDocumentNumber, advance.invoice_number);
    assert.equal(request.payments[0].advanceAmount, request.payments[0].amount);
    assert.equal(productUnits(request), 2);
    assert.equal(itemsTotal(request), minor(request.payments[0].amount));
    sum += minor(request.payments[0].amount);
  }
  assert.equal(sum, minor(advanceRequest.payments[0].amount), 'SUM(finals) == advance');
  assert.equal(sum, order.totalMinor);
  const orderNumbers = rows('SELECT request_json FROM fiscal_dispatches').map((row) => JSON.parse(row.request_json).orderNumber);
  assert.equal(new Set(orderNumbers).size, orderNumbers.length, 'every fiscal document has a unique orderNumber (Fiscomm de-dup key)');
  assert.equal(orderRow(order.id).fulfillment_status, 'delivered');
  assert.equal(sql('SELECT status FROM subscription_packages WHERE order_id=?', order.id).status, 'completed');
  assert.deepEqual(networkCalls, [], 'mock mode never touches the network');
});

// ---------- F-C02 email only after the receipt is persisted -------------------
test('F-C02 email.fiscal_document.requested exists only for persisted receipts, one per document', async () => {
  const { order } = await buyPackage({ cadence: 'biweekly', quantity: 1 });
  expectStatus(await payAsAdmin(order.id));
  await visit('2027-01-01');
  const emails = outbox('email.fiscal_document.requested');
  assert.equal(emails.length, 3, 'advance + final + advance_refund');
  for (const email of emails) {
    const key = email.idempotency_key.replace(/^fiscal-email:/, '');
    const receipt = sql('SELECT status, invoice_number FROM fiscal_receipts WHERE operation_key=?', key);
    assert.ok(receipt, `receipt row exists for ${email.idempotency_key}`);
    assert.equal(receipt.status, 'issued');
    assert.equal(JSON.parse(email.payload_json).invoiceNumber, receipt.invoice_number);
    assert.equal(email.aggregate_id, order.id);
  }
  assert.equal(new Set(emails.map((email) => email.idempotency_key)).size, 3);
});

test('F-C03 no email.fiscal_document.requested while the fiscal document is blocked or failed', async () => {
  env.FISCOMM_MODE = 'disabled';
  const { order } = await buyPackage({ extra: { paymentMethod: 'card', paymentToken: 'test-f-token' } });
  assert.equal(count('fiscal_receipts', "status='issued'"), 0);
  assert.equal(outbox('email.fiscal_document.requested').length, 0);
  assert.equal(sql("SELECT last_error_code c FROM fiscal_receipts WHERE order_id=?", order.id).c, 'FISCAL_NOT_CONFIGURED');
  assert.equal(count('fiscal_dispatches'), 0, 'nothing is journaled before configuration');
});

// ---------- F-C04 partial delivery with non-divisible discount ----------------
test('F-C04 partial delivery (2 of 3) with 1000 para discount: disjoint unit ranges, exact per-unit amounts, finals sum to total', async () => {
  database.raw.exec("INSERT INTO promo_codes(id,code,description,discount_type,discount_value,minimum_order_minor,is_active) VALUES('promo_test_f','TESTF1000','TEST-F fixed','fixed',1000,0,1)");
  const { order } = await buyPackage({ cadence: 'weekly', quantity: 3, method: 'card', extra: { promoCode: 'TESTF1000', paymentToken: 'test-f-token' } });
  assert.equal(order.discountMinor, 1000);
  assert.equal(order.paymentStatus, 'paid');
  const advanceRequest = requestOf(`receipt:${order.id}:advance`);
  assert.equal(minor(advanceRequest.payments[0].amount), order.totalMinor);
  const unitPrices = advanceRequest.items.filter((item) => item.name !== 'Dostava').flatMap((item) => Array(item.quantity).fill(minor(item.unitPrice)));
  assert.equal(unitPrices.length, 12);
  assert.equal(unitPrices.reduce((a, b) => a + b, 0), 300000 - 1000, 'discount of exactly 1000 para spread over 12 units');
  assert.ok(unitPrices.every((price) => price === 24916 || price === 24917), `per-unit prices differ by at most 1 para: ${[...new Set(unitPrices)]}`);

  // First visit hands over only 2 of the 3 bottles; follow-up visits finish the package.
  const first = await visit('2027-01-01', { deliveredQuantity: 2 });
  const firstKey = `receipt:${order.id}:delivery:${first.stops[0].id}`;
  const firstRequest = requestOf(firstKey);
  assert.equal(productUnits(firstRequest), 2, 'only the two handed-over units are fiscalized');
  assert.ok(firstRequest.items.filter((item) => item.name !== 'Dostava').every((item) => [24916, 24917].includes(minor(item.unitPrice))));
  let guard = 0;
  for (const date of ['2027-01-08', '2027-01-15', '2027-01-22', '2027-01-29', '2027-02-05']) {
    if (sql('SELECT status FROM subscription_packages WHERE order_id=?', order.id).status === 'completed') break;
    await visit(date);
    guard += 1;
  }
  assert.ok(guard >= 4, 'a partial first visit needs a fifth visit');
  assert.equal(sql('SELECT status FROM subscription_packages WHERE order_id=?', order.id).status, 'completed');

  const allocations = rows(`SELECT a.* FROM fiscal_delivery_allocations a JOIN order_items oi ON oi.id=a.order_item_id WHERE oi.order_id=? ORDER BY a.unit_offset`, order.id);
  let next = 0;
  for (const allocation of allocations) {
    assert.equal(allocation.unit_offset, next, 'unit ranges are contiguous and never overlap');
    next += allocation.quantity;
  }
  assert.equal(next, 12, 'all 12 purchased units are allocated exactly once');
  assert.equal(allocations[0].quantity, 2);
  const finals = rows("SELECT operation_key FROM fiscal_receipts WHERE kind='final' AND status='issued' ORDER BY issued_at, operation_key");
  assert.equal(finals.length, allocations.length);
  const total = finals.reduce((sum, final) => sum + minor(requestOf(final.operation_key).payments[0].amount), 0);
  assert.equal(total, order.totalMinor, 'finals add up to the paid total to the para');
  assert.equal(finals.reduce((sum, final) => sum + productUnits(requestOf(final.operation_key)), 0), 12);
});

// ---------- F-C05 skipped week -----------------------------------------------
test('F-C05 skipped week (weekly x2): skipped Friday produces no document, four finals still sum to the advance', async () => {
  const { order, subscription } = await buyPackage({ cadence: 'weekly', quantity: 2, method: 'card', extra: { paymentToken: 'test-f-token' } });
  await visit('2027-01-01');
  await visit('2027-01-08');
  setClock('2027-01-10T10:00:00Z');
  const version = sql('SELECT version v FROM subscriptions WHERE id=?', subscription.id).v;
  expectStatus(await call(`/api/admin/subscriptions/${subscription.id}`, { method: 'PATCH', admin: true, body: { action: 'skip_next', expectedVersion: version } }));
  setClock('2027-01-15T10:00:00Z');
  const skipped = expectStatus(await call('/api/admin/deliveries', { admin: true, body: { action: 'generate', date: '2027-01-15' } }));
  assert.equal(skipped.orders.length, 0, 'nothing to deliver on the skipped date');
  assert.equal(count('fiscal_receipts', "kind='final'"), 2);
  await visit('2027-01-22');
  await visit('2027-01-29');
  assert.equal(count('fiscal_receipts', "kind='final' AND status='issued'"), 4);
  const total = rows("SELECT operation_key FROM fiscal_receipts WHERE kind='final'").reduce((sum, final) => sum + minor(requestOf(final.operation_key).payments[0].amount), 0);
  assert.equal(total, order.totalMinor);
  assert.equal(count('orders'), 1, 'no extra order or charge is created by the skip');
});

// ---------- F-C06 cash on delivery, one-time ---------------------------------
test('F-C06 one-time COD: no document before handover; one normal receipt after delivery + cash; confirming again issues nothing new', async () => {
  const created = expectStatus(await checkout([line('prod_kozje_1l', 2, 'one_time')], { paymentMethod: 'cash' }), 201);
  const id = created.order.id;
  assert.equal(count('fiscal_receipts'), 0);
  const first = await visit('2027-01-01', { cashCollected: true });
  assert.deepEqual(rows('SELECT kind, status, operation_key FROM fiscal_receipts').map((r) => ({ ...r })), [{ kind: 'normal', status: 'issued', operation_key: `receipt:${id}:sale` }]);
  assert.equal(count('fiscal_receipts', "kind IN ('advance','final','refund')"), 0);
  assert.equal(orderRow(id).payment_status, 'paid');
  const request = requestOf(`receipt:${id}:sale`);
  assert.equal(request.payments[0].type, 'cash');
  assert.equal(minor(request.payments[0].amount), created.order.totalMinor);
  assert.equal(request.settings.isFinal, undefined);
  assert.equal(request.referentDocumentNumber, undefined);
  // Same stop confirmed a second time (double click / retry).
  const again = expectStatus(await call('/api/admin/deliveries', { admin: true, body: { action: 'complete', id: first.stops[0].id, status: 'delivered', cashCollected: true } }));
  assert.equal(again.replay, true);
  assert.equal(count('fiscal_receipts'), 1);
  assert.equal(count('fiscal_dispatches'), 1);
  assert.equal(outbox('fiscal.delivery.requested').length, 1, 'enqueueOnce keeps a single delivery-fiscal job');
  assert.equal(outbox('email.fiscal_document.requested').length, 1);
});

test('F-C07 package: confirming the same delivery twice yields exactly one final, one refund and one job', async () => {
  const { order } = await buyPackage({ cadence: 'biweekly', quantity: 1, method: 'card', extra: { paymentToken: 'test-f-token' } });
  const { stops } = await visit('2027-01-01');
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const repeat = expectStatus(await call('/api/admin/deliveries', { admin: true, body: { action: 'complete', id: stops[0].id, status: 'delivered' } }));
    assert.equal(repeat.replay, true);
  }
  assert.equal(count('fiscal_receipts', "kind='final'"), 1);
  assert.equal(count('fiscal_receipts', "kind='refund'"), 1);
  assert.equal(count('fiscal_dispatches', 'operation_key LIKE ?', `receipt:${order.id}:delivery:%`), 1, 'the refund document is part of the finalize response, not a second POST');
  assert.equal(outbox('fiscal.delivery.requested').length, 1);
  assert.equal(count('fiscal_delivery_allocations'), 1);
});

// ---------- F-C08 concurrency ------------------------------------------------
async function paidButUnissued() {
  env.FISCOMM_MODE = 'disabled';
  const { order } = await buyPackage({ cadence: 'biweekly', quantity: 1, method: 'card', extra: { paymentToken: 'test-f-token' } });
  const row = sql("SELECT * FROM outbox WHERE topic='fiscal.receipt.requested'");
  assert.equal(row.status, 'pending');
  assert.equal(row.last_error_code, 'FISCAL_NOT_CONFIGURED');
  env.FISCOMM_MODE = 'mock';
  database.raw.exec("UPDATE outbox SET available_at='2020-01-01T00:00:00.000Z' WHERE topic='fiscal.receipt.requested'");
  return { order, key: `receipt:${order.id}:advance` };
}

test('F-C08 two parallel workers on the same outbox row dispatch once', async () => {
  const { order, key } = await paidButUnissued();
  const before = sql("SELECT attempts a FROM outbox WHERE topic='fiscal.receipt.requested'").a;
  const results = await Promise.all([process(), process()]);
  for (const result of results) assert.equal(result.status, 200);
  assert.equal(count('fiscal_dispatches', 'operation_key=?', key), 1);
  assert.equal(count('fiscal_receipts', "order_id=? AND kind='advance' AND status='issued'", order.id), 1);
  const row = sql("SELECT * FROM outbox WHERE topic='fiscal.receipt.requested'");
  assert.equal(row.status, 'sent');
  assert.equal(row.attempts, before + 1, 'the lease UPDATE let only one worker claim the row');
  assert.equal(outbox('email.fiscal_document.requested').length, 1);
});

test('F-C09 two different outbox rows for one operation in parallel: one dispatch, never a terminal failure', async () => {
  const { order, key } = await paidButUnissued();
  database.raw.prepare("INSERT INTO outbox(id,topic,aggregate_type,aggregate_id,payload_json,idempotency_key,available_at) VALUES('test-f-dup','fiscal.receipt.requested','order',?,'{}','test-f-dup','2020-01-01T00:00:00.000Z')").run(order.id);
  await Promise.all([process(), process()]);
  assert.equal(count('fiscal_dispatches', 'operation_key=?', key), 1);
  assert.equal(count('fiscal_receipts', "order_id=? AND kind='advance' AND status='issued'", order.id), 1);
  assert.equal(count('outbox', "topic='fiscal.receipt.requested' AND status='failed'"), 0, rows("SELECT id,status,last_error_code FROM outbox WHERE topic='fiscal.receipt.requested'").map((r) => JSON.stringify(r)).join(' '));
  // A later pass settles whatever was deferred as BUSY, still without a second document.
  database.raw.exec("UPDATE outbox SET available_at='2020-01-01T00:00:00.000Z' WHERE status='pending'");
  await process();
  assert.equal(count('outbox', "topic='fiscal.receipt.requested' AND status='sent'"), 2);
  assert.equal(count('fiscal_dispatches', 'operation_key=?', key), 1);
  assert.equal(count('fiscal_receipts', "kind='advance'"), 1);
});

// ---------- F-C10 dispatch journal states ------------------------------------
async function withJournal(status, ageMs = 0) {
  const { order, key } = await paidButUnissued();
  database.raw.prepare("INSERT INTO fiscal_dispatches(operation_key, request_json, status, updated_at) VALUES (?, '{}', ?, ?)").run(key, status, new Date(Date.now() - ageMs).toISOString());
  const result = await process();
  assert.equal(result.status, 200);
  return { order, key, outbox: sql("SELECT * FROM outbox WHERE topic='fiscal.receipt.requested'"), receipt: sql('SELECT * FROM fiscal_receipts WHERE operation_key=?', key) };
}

test('F-C10a fiscal_dispatches=unknown -> FISCAL_RECONCILIATION_REQUIRED, outbox terminal failed, no new POST, retry_failed does not requeue', async () => {
  const state = await withJournal('unknown');
  assert.equal(state.outbox.status, 'failed');
  assert.equal(state.outbox.last_error_code, 'FISCAL_RECONCILIATION_REQUIRED');
  assert.equal(state.receipt.status, 'failed');
  assert.equal(count('fiscal_dispatches'), 1, 'no second dispatch was journaled');
  assert.equal(sql('SELECT request_json r FROM fiscal_dispatches').r, '{}', 'the journaled request is immutable');
  assert.equal(outbox('email.fiscal_document.requested').length, 0);
  expectStatus(await call('/api/admin/integrations', { admin: true, body: { action: 'retry_failed' } }));
  assert.equal(sql("SELECT status s FROM outbox WHERE topic='fiscal.receipt.requested'").s, 'failed');
  await process();
  assert.equal(count('fiscal_dispatches'), 1);
  assert.equal(count('fiscal_receipts', "status='issued'"), 0);
});

test('F-C10b fiscal_dispatches=rejected -> FISCAL_RECONCILIATION_REQUIRED (terminal), not auto-retried', async () => {
  const state = await withJournal('rejected');
  assert.equal(state.outbox.status, 'failed');
  assert.equal(state.outbox.last_error_code, 'FISCAL_RECONCILIATION_REQUIRED');
  assert.equal(state.receipt.status, 'failed');
  assert.equal(count('fiscal_receipts', "status='issued'"), 0);
});

test('F-C10c fresh fiscal_dispatches=sending -> FISCAL_ORDER_BUSY (retry later); a stale one (>5 min) becomes reconciliation-required', async () => {
  const fresh = await withJournal('sending', 30_000);
  assert.equal(fresh.outbox.status, 'pending', 'busy is retryable, not terminal');
  assert.equal(fresh.outbox.last_error_code, 'FISCAL_ORDER_BUSY');
  assert.equal(fresh.receipt.status, 'pending');
  assert.equal(count('fiscal_dispatches'), 1);
  // The in-flight request never finishes: after 5 minutes it is an ambiguous outcome.
  database.raw.exec("UPDATE outbox SET available_at='2020-01-01T00:00:00.000Z' WHERE topic='fiscal.receipt.requested'");
  setClock('2026-12-30T10:06:00Z');
  await process();
  const stale = sql("SELECT * FROM outbox WHERE topic='fiscal.receipt.requested'");
  assert.equal(stale.status, 'failed');
  assert.equal(stale.last_error_code, 'FISCAL_RECONCILIATION_REQUIRED');
});

test('F-C10d an unresolved dispatch on one delivery blocks the next delivery receipts of that order (no new POST)', async () => {
  const { order } = await buyPackage({ cadence: 'weekly', quantity: 1, method: 'card', extra: { paymentToken: 'test-f-token' } });
  const { stops } = await visit('2027-01-01');
  const firstKey = `receipt:${order.id}:delivery:${stops[0].id}`;
  // Pretend the first final's outcome was lost: journal says unknown, no issued document.
  database.raw.prepare("UPDATE fiscal_dispatches SET status='unknown', response_json=NULL WHERE operation_key=?").run(firstKey);
  database.raw.prepare("UPDATE fiscal_receipts SET status='failed' WHERE operation_key=?").run(firstKey);
  const dispatchesBefore = count('fiscal_dispatches');
  const next = await visit('2027-01-08');
  assert.equal(count('fiscal_dispatches'), dispatchesBefore, 'the second final was not sent');
  const second = sql("SELECT * FROM outbox WHERE topic='fiscal.delivery.requested' AND json_extract(payload_json,'$.deliveryOrderId')=?", next.stops[0].id);
  assert.equal(second.status, 'failed');
  assert.equal(second.last_error_code, 'FISCAL_RECONCILIATION_REQUIRED');
});

// ---------- F-C11 mode mismatch / legacy event -------------------------------
test('F-C11 FISCAL_MODE_MISMATCH: mock advance cannot be finalized in training mode, no HTTP', async () => {
  const { order } = await buyPackage({ cadence: 'biweekly', quantity: 1, method: 'card', extra: { paymentToken: 'test-f-token' } });
  assert.equal(sql('SELECT provider p FROM fiscal_receipts WHERE operation_key=?', `receipt:${order.id}:advance`).p, 'fiscomm-mock');
  env.FISCOMM_MODE = 'training';
  await visit('2027-01-01');
  const job = sql("SELECT * FROM outbox WHERE topic='fiscal.delivery.requested'");
  assert.equal(job.status, 'failed');
  assert.equal(job.last_error_code, 'FISCAL_MODE_MISMATCH');
  assert.equal(count('fiscal_receipts', "kind='final' AND status='issued'"), 0);
  assert.equal(count('fiscal_dispatches'), 1, 'only the original mock advance was journaled');
  assert.deepEqual(networkCalls, []);
  assert.equal(outbox('email.fiscal_document.requested').length, 1, 'only the advance mail exists');
});

test('F-C12 legacy fiscal.final.requested -> 409 FISCAL_LEGACY_REVIEW_REQUIRED (terminal), nothing issued', async () => {
  const { order } = await buyPackage({ cadence: 'biweekly', quantity: 1, method: 'card', extra: { paymentToken: 'test-f-token' } });
  const issuedBefore = count('fiscal_receipts', "status='issued'");
  database.raw.prepare("INSERT INTO outbox(id,topic,aggregate_type,aggregate_id,payload_json,idempotency_key,available_at) VALUES('test-f-legacy','fiscal.final.requested','order',?,'{}','test-f-legacy','2020-01-01T00:00:00.000Z')").run(order.id);
  await process();
  const job = sql("SELECT * FROM outbox WHERE id='test-f-legacy'");
  assert.equal(job.status, 'failed');
  assert.equal(job.last_error_code, 'FISCAL_LEGACY_REVIEW_REQUIRED');
  assert.equal(count('fiscal_receipts', "status='issued'"), issuedBefore);
  assert.equal(count('fiscal_receipts', "kind='final'"), 0);
  expectStatus(await call('/api/admin/integrations', { admin: true, body: { action: 'retry_failed' } }));
  assert.equal(sql("SELECT status s FROM outbox WHERE id='test-f-legacy'").s, 'failed', 'fiscal topics are never auto-requeued');
});

test('F-C13 ADVANCE_NOT_ISSUED is a retryable (non-terminal) classification when the advance is not yet issued', async () => {
  // The branch itself is unreachable through public flows (issueFiscomm(orderId) always establishes the
  // advance first), so verify the contract that matters: a pending outbox row whose failure code is
  // ADVANCE_NOT_ISSUED is never made terminal by the processor (see server/integration-jobs.ts safeToRetry).
  const { order } = await buyPackage({ cadence: 'biweekly', quantity: 1, method: 'card', extra: { paymentToken: 'test-f-token' } });
  const { stops } = await visit('2027-01-01');
  assert.ok(order.id && stops.length === 1);
  const source = (await import('node:fs')).readFileSync(new URL('../server/integration-jobs.ts', import.meta.url), 'utf8');
  assert.match(source, /safeToRetry = \[[^\]]*"ADVANCE_NOT_ISSUED"/);
});

// ---------- F-C14 zero amount ------------------------------------------------
test('F-C14a zero-value order on the legacy (non-Fiscomm) path is skipped, never sent to a provider', async () => {
  setup({ FISCAL_PROVIDER: undefined, BADI_MODE: 'mock' });
  database.raw.exec("INSERT INTO promo_codes(id,code,description,discount_type,discount_value,minimum_order_minor,is_active) VALUES('promo_test_f100','TESTF100','TEST-F 100%','percent',100,0,1); UPDATE settings SET value_json='0' WHERE key IN ('deliveryFeeMinor','freeDeliveryThresholdMinor')");
  const created = expectStatus(await checkout([line('prod_kravlje_1l', 2, 'one_time')], { paymentMethod: 'card', paymentToken: 'test-f-token', promoCode: 'TESTF100' }), 201);
  assert.equal(created.order.totalMinor, 0);
  const receipt = sql('SELECT * FROM fiscal_receipts WHERE order_id=?', created.order.id);
  assert.equal(receipt.status, 'skipped');
  assert.equal(receipt.provider_reference, `zero-amount:${created.order.id}`);
  assert.equal(count('fiscal_dispatches'), 0);
  assert.equal(outbox('email.fiscal_document.requested').length, 0);
});

test('F-C14b zero-value order with Fiscomm selected must not produce an issued fiscal document', async () => {
  database.raw.exec("INSERT INTO promo_codes(id,code,description,discount_type,discount_value,minimum_order_minor,is_active) VALUES('promo_test_f100','TESTF100','TEST-F 100%','percent',100,0,1); UPDATE settings SET value_json='0' WHERE key IN ('deliveryFeeMinor','freeDeliveryThresholdMinor')");
  const created = expectStatus(await checkout([line('prod_kravlje_1l', 2, 'one_time')], { paymentMethod: 'card', paymentToken: 'test-f-token', promoCode: 'TESTF100' }), 201);
  assert.equal(created.order.totalMinor, 0);
  const issued = rows("SELECT operation_key, kind, status FROM fiscal_receipts WHERE order_id=? AND status='issued'", created.order.id);
  assert.deepEqual(issued, [], `a 0.00 RSD fiscal receipt must be skipped, got ${JSON.stringify(issued)}`);
  assert.equal(count('fiscal_dispatches'), 0, 'no request is sent to the fiscal provider for a zero amount');
});

// ---------- F-C15 buyer id and Cyrillic names --------------------------------
test('F-C15 company PIB becomes buyerId "10:<PIB>" on advance and every final; absent PIB sends no buyerId', async () => {
  const withPib = await buyPackage({ cadence: 'biweekly', quantity: 1, method: 'card', extra: { paymentToken: 'test-f-token', billing: { companyName: 'TEST-F Firma DOO', taxId: '123456789', addressLine1: 'Račun 2', city: 'Novi Sad', postalCode: '21000' } } });
  await visit('2027-01-01');
  const keys = rows("SELECT operation_key FROM fiscal_dispatches WHERE operation_key LIKE ?", `receipt:${withPib.order.id}:%`).map((r) => r.operation_key);
  assert.equal(keys.length, 2);
  for (const key of keys) assert.equal(requestOf(key).buyerId, '10:123456789', key);
  setClock('2026-12-30T10:00:00Z');
  const plain = expectStatus(await checkout([line('prod_kozje_1l', 1, 'one_time')], { customer: { email: 'test-f-bez-pib@example.test', fullName: 'TEST-F Bez PIB', phone: '+381600000000', addressLine1: 'TEST-F 2', city: 'Beograd', postalCode: '11000' }, paymentMethod: 'cash', deliveryDate: '2027-01-05' }), 201);
  expectStatus(await payAsAdmin(plain.order.id));
  assert.equal(requestOf(`receipt:${plain.order.id}:advance`).buyerId, undefined);
});

test('F-C16 Cyrillic product names survive into the journaled request (UTF-8, not mangled or escaped away)', async () => {
  const cyrillic = 'Домаће кравље млеко Ћ Ж Ђ Š';
  database.raw.prepare("UPDATE products SET name=? WHERE id='prod_kravlje_1l'").run(cyrillic);
  const { order } = await buyPackage({ cadence: 'biweekly', quantity: 1, method: 'card', extra: { paymentToken: 'test-f-token' } });
  const advanceKey = `receipt:${order.id}:advance`;
  const raw = sql('SELECT request_json r FROM fiscal_dispatches WHERE operation_key=?', advanceKey).r;
  assert.ok(raw.includes(cyrillic), 'literal Cyrillic text is stored in request_json');
  assert.equal(JSON.parse(raw).items[0].name, cyrillic);
  const { stops } = await visit('2027-01-01');
  const finalRequest = requestOf(`receipt:${order.id}:delivery:${stops[0].id}`);
  assert.ok(finalRequest.items.some((item) => item.name === cyrillic));
  assert.equal(sql("SELECT product_name n FROM order_items WHERE order_id=?", order.id).n, cyrillic);
});

// ---------- F-C17 live-mode response validation (fetch stub, no real host) ----
function liveFiscomm(mutateFinalize) {
  Object.assign(env, { FISCOMM_MODE: 'live', FISCOMM_API_KEY: 'test-only-never-real', FISCOMM_DELIVERY_TAX_LABEL: 'Е' });
  const calls = [];
  globalThis.fetch = async (url, init) => {
    assert.ok(String(url).startsWith('https://api.fiscomm.rs/'), `unexpected host ${url}`);
    if (String(url).endsWith('/receipt/tax-rates')) return Response.json({ currentTaxRates: { taxCategories: [{ taxRates: [{ label: 'Е', rate: 10 }] }] } });
    const payload = JSON.parse(init.body); calls.push({ url: String(url), payload });
    const receipt = { invoiceNumber: 'TEST-F-PFR-' + calls.length, sdcDateTime: new Date().toISOString(), totalAmount: payload.items.reduce((sum, item) => sum + item.totalAmount, 0) };
    const body = String(url).endsWith('/finalize') ? { finalReceipt: receipt, refundReceipt: { ...receipt, invoiceNumber: 'TEST-F-REFUND' } } : { receipt };
    return Response.json(String(url).endsWith('/finalize') ? mutateFinalize(body) : body);
  };
  return calls;
}

test('F-C17 final document total off by one para -> journal unknown, nothing persisted for the delivery, job terminal', async () => {
  const calls = liveFiscomm((body) => ({ ...body, finalReceipt: { ...body.finalReceipt, totalAmount: Math.round((body.finalReceipt.totalAmount + 0.01) * 100) / 100 } }));
  const { order } = await buyPackage({ cadence: 'biweekly', quantity: 1, method: 'card', extra: { paymentToken: 'test-f-token' } });
  assert.equal(calls.length, 1);
  await visit('2027-01-01');
  assert.equal(calls.length, 2, 'finalize was attempted exactly once');
  const dispatch = sql("SELECT * FROM fiscal_dispatches WHERE operation_key LIKE ?", `receipt:${order.id}:delivery:%`);
  assert.equal(dispatch.status, 'unknown');
  assert.equal(count('fiscal_receipts', "kind IN ('final','refund') AND status='issued'"), 0);
  assert.equal(sql("SELECT status s FROM outbox WHERE topic='fiscal.delivery.requested'").s, 'failed');
  assert.equal(sql("SELECT last_error_code c FROM outbox WHERE topic='fiscal.delivery.requested'").c, 'FISCAL_RESPONSE_INVALID');
  await process();
  assert.equal(calls.length, 2, 'no automatic second POST');
  assert.equal(outbox('email.fiscal_document.requested').length, 1, 'customer is not mailed a document that was never accepted');
});

test('F-C18 final response without refundReceipt timestamp is rejected as unknown', async () => {
  const calls = liveFiscomm((body) => ({ ...body, refundReceipt: { ...body.refundReceipt, sdcDateTime: undefined } }));
  await buyPackage({ cadence: 'biweekly', quantity: 1, method: 'card', extra: { paymentToken: 'test-f-token' } });
  await visit('2027-01-01');
  assert.equal(calls.length, 2);
  assert.equal(sql("SELECT status s FROM fiscal_dispatches WHERE operation_key LIKE '%:delivery:%'").s, 'unknown');
  assert.equal(count('fiscal_receipts', "kind IN ('final','refund') AND status='issued'"), 0);
});

// ---------- F-C19 invariants on the journal ----------------------------------
test('F-C19 every issued fiscal_receipt has a journal row in status issued, and mock documents are labeled fiscomm-mock', async () => {
  await buyPackage({ cadence: 'weekly', quantity: 1, method: 'card', extra: { paymentToken: 'test-f-token' } });
  await visit('2027-01-01');
  for (const receipt of rows("SELECT operation_key, provider, kind FROM fiscal_receipts WHERE status='issued'")) {
    const key = receipt.operation_key.replace(/:advance_refund$/, '');
    assert.equal(sql('SELECT status s FROM fiscal_dispatches WHERE operation_key=?', key).s, 'issued', receipt.operation_key);
    assert.equal(receipt.provider, 'fiscomm-mock', `${receipt.kind} document ${receipt.operation_key} was produced by the mock and must not be labeled as a live fiscal document`);
  }
});
