// Regression tests for the fixes of QA findings K-1, V-2, V-3 and V-4 (qa/2026-11-04/FINAL-REPORT.md).
// Runs the worker bundle against an isolated in-memory database; no network. Prefix: TEST-F-.
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { call, checkout, env, expectError, expectStatus, line, rows, setClock, setup, sql, teardown, count } from './qa-harness.mjs';

beforeEach(() => setup());
afterEach(() => teardown());

const sub = (cadence = 'weekly', quantity = 2) => line('prod_kravlje_1l', quantity, 'subscription', cadence);
const buyCashPackage = async () => expectStatus(await checkout([sub()], { paymentMethod: 'cash', paymentToken: undefined }), 201);
const buyCardPackage = async () => expectStatus(await checkout([sub()], { paymentMethod: 'card', paymentToken: 'test-f-token' }), 201);
const patchOrder = (body) => call('/api/admin/orders', { method: 'PATCH', admin: true, body });
const minor = (value) => Math.round(Number(value) * 100);
const requestOf = (key) => JSON.parse(sql('SELECT request_json FROM fiscal_dispatches WHERE operation_key=?', key).request_json);
async function visit(date, { deliveredQuantity } = {}) {
  setClock(`${date}T10:00:00Z`);
  const generated = expectStatus(await call('/api/admin/deliveries', { admin: true, body: { action: 'generate', date } }));
  expectStatus(await call('/api/admin/deliveries', { admin: true, body: { action: 'lock', date } }));
  for (const stop of generated.orders) {
    expectStatus(await call('/api/admin/deliveries', { admin: true, body: { action: 'complete', id: stop.id, status: 'delivered',
      ...(deliveredQuantity === undefined ? {} : { items: stop.items.map((item) => ({ id: item.id, deliveredQuantity })) }) } }));
  }
  return generated.orders;
}
const refund = (body) => call('/api/admin/refunds', { admin: true, body });

// ---------- K-1: a paid order with a fiscal document cannot be cancelled outside the refund flow ----------
const buyOneTimeCash = async () => expectStatus(await checkout([line()], { paymentMethod: 'cash' }), 201);

test('K-1 cancelling a paid one-time order with an issued advance is refused with FISCAL_REFUND_REQUIRED', async () => {
  const { order } = await buyOneTimeCash();
  expectStatus(await patchOrder({ id: order.id, paymentStatus: 'paid' }));
  assert.equal(sql('SELECT status FROM fiscal_receipts WHERE operation_key=?', `receipt:${order.id}:advance`).status, 'issued');
  expectError(await patchOrder({ id: order.id, fulfillmentStatus: 'cancelled' }), 409, 'FISCAL_REFUND_REQUIRED');
  const row = sql('SELECT payment_status, fulfillment_status FROM orders WHERE id=?', order.id);
  assert.deepEqual({ ...row }, { payment_status: 'paid', fulfillment_status: 'planned' });
});

test('K-1 an unpaid order can still be cancelled; a paid one in training mode without a fiscal document too', async () => {
  const { order } = expectStatus(await checkout([line()], { paymentMethod: 'cash' }), 201);
  expectStatus(await patchOrder({ id: order.id, fulfillmentStatus: 'cancelled' }));
  assert.equal(sql('SELECT fulfillment_status FROM orders WHERE id=?', order.id).fulfillment_status, 'cancelled');

  env.FISCOMM_MODE = 'training'; // no API key: the training document is never issued
  const paid = await buyOneTimeCash();
  expectStatus(await patchOrder({ id: paid.order.id, paymentStatus: 'paid' }));
  assert.equal(count('fiscal_receipts', "order_id=? AND status='issued'", paid.order.id), 0);
  expectStatus(await patchOrder({ id: paid.order.id, fulfillmentStatus: 'cancelled' }));
});

// ---------- V-2: rate limits key on a platform-controlled address ----------
const ADMIN = { ADMIN_LEGACY_ACCESS: undefined, ADMIN_SECRET: undefined, ADMIN_EMAIL: 'test-f-owner@example.test', ADMIN_PASSWORD: 'test-f-owner-password' };
const badLogin = (ip, extra = {}) => call('/api/admin/access', { ip, headers: extra, body: { email: ADMIN.ADMIN_EMAIL, password: 'wrong-password-123' } });

test('V-2 behind Vercel a client-supplied cf-connecting-ip cannot reset the admin login limit', async () => {
  setup({ ...ADMIN, TRUSTED_PROXY: 'vercel' });
  for (let i = 0; i < 10; i++) expectError(await badLogin('203.0.113.7', { 'cf-connecting-ip': `198.51.100.${i}` }), 403, 'ADMIN_FORBIDDEN');
  expectError(await badLogin('203.0.113.7', { 'cf-connecting-ip': '198.51.100.99' }), 429, 'RATE_LIMITED');
});

test('V-2 in production mode cf-connecting-ip is ignored unless TRUSTED_PROXY=cloudflare', async () => {
  setup({ ...ADMIN, APP_ENV: 'production', APP_ORIGIN: 'http://localhost' });
  for (let i = 0; i < 10; i++) expectError(await badLogin('203.0.113.8', { 'cf-connecting-ip': `198.51.100.${i}` }), 403, 'ADMIN_FORBIDDEN');
  expectError(await badLogin('203.0.113.8', { 'cf-connecting-ip': '198.51.100.99' }), 429, 'RATE_LIMITED');

  setup({ ...ADMIN, APP_ENV: 'production', APP_ORIGIN: 'http://localhost', TRUSTED_PROXY: 'cloudflare' });
  for (let i = 0; i < 10; i++) expectError(await badLogin('203.0.113.9', { 'cf-connecting-ip': '198.51.100.50' }), 403, 'ADMIN_FORBIDDEN');
  expectError(await badLogin('203.0.113.9', { 'cf-connecting-ip': '198.51.100.50' }), 429, 'RATE_LIMITED');
});

test('V-2 rotating addresses still hit the per-account limit of 20 attempts', async () => {
  setup({ ...ADMIN, TRUSTED_PROXY: 'vercel' });
  for (let i = 0; i < 20; i++) expectError(await badLogin(`203.0.113.${i + 10}`), 403, 'ADMIN_FORBIDDEN');
  expectError(await badLogin('203.0.113.250'), 429, 'RATE_LIMITED');
});

// ---------- V-3: a locked route is never offered as the next delivery date ----------
test('V-3 cart and checkout skip a route locked ahead of its cutoff and explain the lock in Serbian', async () => {
  expectStatus(await call('/api/admin/deliveries', { admin: true, body: { action: 'generate', date: '2027-01-01' } }));
  expectStatus(await call('/api/admin/deliveries', { admin: true, body: { action: 'lock', date: '2027-01-01', force: true } }));
  assert.equal(sql("SELECT status FROM deliveries WHERE delivery_date='2027-01-01'").status, 'locked');

  const quote = expectStatus(await call('/api/cart', { body: { items: [line()], city: 'Beograd', postalCode: '11000' } }));
  assert.notEqual(quote.deliveryDate, '2027-01-01', 'the locked Friday is not offered');
  assert.ok(quote.deliveryDate > '2027-01-01');
  const order = expectStatus(await checkout([line()], { deliveryDate: undefined }), 201).order;
  assert.equal(order.deliveryDate, quote.deliveryDate);

  const locked = await checkout([line()], { deliveryDate: '2027-01-01' });
  expectError(locked, 409, 'DELIVERY_LOCKED');
  assert.match(locked.body.error.message, /Rok za izmene/);
});

// ---------- V-4: refund execution issues the fiscal refund of the undelivered remainder ----------
test('V-4 cash package: refund = fiscal remainder incl. delivery share; execute issues one refund document referencing the advance', async () => {
  const { order } = await buyCashPackage();
  expectStatus(await patchOrder({ id: order.id, paymentStatus: 'paid' }));
  const advance = sql('SELECT * FROM fiscal_receipts WHERE operation_key=?', `receipt:${order.id}:advance`);
  const stops = await visit('2027-01-01');
  const firstFinal = minor(requestOf(`receipt:${order.id}:delivery:${stops[0].id}`).payments[0].amount);

  const preview = expectStatus(await call(`/api/admin/refunds?orderId=${order.id}`, { admin: true }));
  assert.equal(preview.includesDelivery, true);
  assert.equal(preview.amountMinor, order.totalMinor - firstFinal, 'remaining three visits incl. their delivery fee');

  const requested = expectStatus(await refund({ action: 'request', orderId: order.id, reason: 'TEST-F odustanak', idempotencyKey: 'test-f-refund-1' }));
  expectStatus(await refund({ id: requested.id, expectedVersion: 1, action: 'approve' }));
  env.PAYMENT_MODE = 'disabled'; // cash is returned by hand: no bank adapter needed
  const completed = expectStatus(await refund({ id: requested.id, expectedVersion: 2, action: 'execute' }));
  assert.equal(completed.status, 'completed');
  assert.equal(completed.fiscal_reference, `MOCK-receipt:${order.id}:refund`);
  assert.equal(completed.payment_reference, `manual-refund:${requested.id}`);

  const document = sql('SELECT * FROM fiscal_receipts WHERE operation_key=?', `receipt:${order.id}:refund`);
  assert.equal(document.kind, 'refund');
  assert.equal(document.status, 'issued');
  assert.equal(document.provider, 'fiscomm-mock');
  assert.equal(document.reference_receipt_id, advance.id);
  const request = requestOf(`receipt:${order.id}:refund`);
  assert.equal(request.referentDocumentNumber, advance.invoice_number);
  assert.equal(request.referentDocumentDt, advance.pfr_time);
  assert.equal(minor(request.payments[0].amount), preview.amountMinor);
  assert.equal(request.items.reduce((sum, item) => sum + minor(item.totalAmount), 0), preview.amountMinor);
  assert.equal(firstFinal + preview.amountMinor, order.totalMinor, 'delivered final + refund close the advance exactly');
  assert.equal(count('outbox', "topic='email.fiscal_document.requested' AND idempotency_key=?", `fiscal-email:receipt:${order.id}:refund`), 1);
  assert.equal(sql('SELECT fulfillment_status FROM orders WHERE id=?', order.id).fulfillment_status, 'cancelled');

  expectError(await refund({ id: requested.id, expectedVersion: 3, action: 'execute' }), 409, 'REFUND_STATE_INVALID');
  assert.equal(count('fiscal_receipts', 'operation_key=?', `receipt:${order.id}:refund`), 1);
  assert.equal(count('fiscal_dispatches', 'operation_key=?', `receipt:${order.id}:refund`), 1);
});

test('V-4 card package: without a bank adapter execute is refused BEFORE any fiscal document; with the mock bank it completes', async () => {
  const { order } = await buyCardPackage();
  assert.equal(order.paymentStatus, 'paid');
  await visit('2027-01-01');
  const requested = expectStatus(await refund({ action: 'request', orderId: order.id, reason: 'TEST-F kartica', idempotencyKey: 'test-f-refund-2' }));
  expectStatus(await refund({ id: requested.id, expectedVersion: 1, action: 'approve' }));
  env.PAYMENT_MODE = 'disabled';
  expectError(await refund({ id: requested.id, expectedVersion: 2, action: 'execute' }), 503, 'REFUND_PROVIDER_NOT_CONNECTED');
  assert.equal(count('fiscal_receipts', 'operation_key=?', `receipt:${order.id}:refund`), 0, 'no fiscal refund while the money cannot be returned');
  assert.equal(sql('SELECT status FROM refund_requests WHERE id=?', requested.id).status, 'approved');

  env.PAYMENT_MODE = 'mock';
  const completed = expectStatus(await refund({ id: requested.id, expectedVersion: 2, action: 'execute' }));
  assert.equal(completed.status, 'completed');
  assert.match(completed.payment_reference, /^MOCK-REFUND-/);
  assert.equal(sql('SELECT status FROM fiscal_receipts WHERE operation_key=?', `receipt:${order.id}:refund`).status, 'issued');
});

test('V-4 a paid order whose advance is not issued yet cannot be refunded fiscally (FISCAL_ORIGINAL_MISSING), nothing changes', async () => {
  env.FISCOMM_MODE = 'disabled'; // payment recorded, advance blocked (FISCAL_NOT_CONFIGURED)
  const { order } = await buyCashPackage();
  expectStatus(await patchOrder({ id: order.id, paymentStatus: 'paid' }));
  assert.equal(count('fiscal_receipts', "order_id=? AND status='issued'", order.id), 0);
  env.FISCOMM_MODE = 'mock';
  const requested = expectStatus(await refund({ action: 'request', orderId: order.id, reason: 'TEST-F', idempotencyKey: 'test-f-refund-3' }));
  expectStatus(await refund({ id: requested.id, expectedVersion: 1, action: 'approve' }));
  expectError(await refund({ id: requested.id, expectedVersion: 2, action: 'execute' }), 409, 'FISCAL_ORIGINAL_MISSING');
  assert.equal(sql('SELECT status FROM refund_requests WHERE id=?', requested.id).status, 'approved');
  assert.equal(sql('SELECT fulfillment_status FROM orders WHERE id=?', order.id).fulfillment_status, 'planned');
  assert.equal(count('fiscal_receipts', 'operation_key=?', `receipt:${order.id}:refund`), 0);
  assert.equal(rows('SELECT 1').length, 1);
});
