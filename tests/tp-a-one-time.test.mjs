// TEST_PLAN section A: one-time purchase. Real API routes, in-memory SQLite, fake clock.
// Run: node --test tests/tp-a-one-time.test.mjs
// Catalogue state is the real post-migration one (cow milk 1 L: 35000 one-time, 25000 subscription,
// delivery fee 35000, minimum 2 L). Amounts are always asserted in minor units (para).
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import {
  COW, account, adminDay, buy, call, cust, count, expectError, expectStatus, fresh, inst, oneTime, rows, sessionByEmail, setSetting, sql, teardown, topicCount, noDuplicateOutbox, env,
} from './tp-abd-helpers.mjs';

// Fri 2026-11-20 11:00 Belgrade. Tue 11-24 cutoff = Sun 11-22 18:00Z; Fri 11-27 cutoff = Wed 11-25 18:00Z.
const TUE = '2026-11-24', FRI = '2026-11-27';
beforeEach(() => fresh());
afterEach(() => teardown());

let ipCounter = 0;
const ip = () => `198.51.100.${(ipCounter++ % 200) + 1}`;
const generate = (date) => call('/api/admin/deliveries', { admin: true, body: { action: 'generate', date } });
/** Admin delivery list for a day, regenerated first so pre-cutoff orders appear. */
async function adminList(date) {
  expectStatus(await generate(date));
  return expectStatus(await adminDay(date));
}
const nothingStored = () => {
  for (const table of ['orders', 'order_items', 'customers', 'outbox', 'idempotency_keys', 'payment_attempts', 'refund_requests', 'fiscal_receipts']) assert.equal(count(table), 0, table + ' must stay empty');
};
const patchOrder = (id, cookie, body) => call('/api/account/orders/' + id, { method: 'PATCH', cookie, body });

// ---------------------------------------------------------------- A1 quantities
test('A1 2 L one-time on Tuesday: 70000 + 35000 = 105000 in DB, account, admin list and outbox', async () => {
  const response = expectStatus(await buy(oneTime(2), TUE, { email: 'a1@example.test' }), 201);
  const { order } = response;
  assert.equal(order.subtotalMinor, 70000);
  assert.equal(order.deliveryFeeMinor, 35000);
  assert.equal(order.totalMinor, 105000);
  assert.equal(order.paymentStatus, 'pending');
  assert.equal(response.subscription, null);
  // 1) DB
  const row = sql('SELECT * FROM orders WHERE id=?', order.id);
  assert.equal(row.kind, 'one_time');
  assert.equal(row.total_minor, 105000);
  assert.equal(row.delivery_fee_minor, 35000);
  assert.equal(row.delivery_date, TUE);
  assert.equal(row.payment_method, 'cash');
  const item = sql('SELECT * FROM order_items WHERE order_id=?', order.id);
  assert.deepEqual([item.quantity, item.unit_price_minor, item.line_total_minor, item.purchase_type], [2, 35000, 70000, 'one_time']);
  assert.equal(count('subscriptions'), 0);
  // 2) account
  const view = expectStatus(await account(sessionByEmail('a1@example.test').cookie));
  const shown = view.orders.find((o) => o.id === order.id);
  assert.equal(shown.total_minor, 105000);
  assert.equal(shown.role, 'one_time');
  assert.equal(shown.delivery_date, TUE);
  assert.deepEqual(view.oneTimeDeliveries.map((d) => d.date), [TUE]);
  // 3) admin delivery list
  const day = await adminList(TUE);
  assert.equal(day.orders.length, 1);
  assert.equal(day.orders[0].email, 'a1@example.test');
  assert.deepEqual(day.orders[0].items.map((i) => [i.product_id, i.quantity, i.unit_price_minor]), [[COW, 2, 35000]]);
  assert.equal(day.preparation.find((p) => p.product_id === COW).total_quantity, 2);
  // 4) outbox: exactly one of each, cash-due not captured
  assert.equal(topicCount('order.created', order.id), 1);
  assert.equal(topicCount('email.order_confirmation.requested', order.id), 1);
  assert.equal(topicCount('payment.cash_due', order.id), 1);
  assert.equal(topicCount('payment.captured'), 0);
  assert.equal(topicCount('fiscal.receipt.requested'), 0);
  noDuplicateOutbox();
});

test('A2 100 L is the maximum: accepted, 100 x 35000 + 35000 = 3535000', async () => {
  const { order } = expectStatus(await buy(oneTime(100), FRI), 201);
  assert.equal(order.subtotalMinor, 3_500_000);
  assert.equal(order.totalMinor, 3_535_000);
  assert.equal(sql('SELECT line_total_minor n FROM order_items WHERE order_id=?', order.id).n, 3_500_000);
});

test('A3 101 L is rejected (422 VALIDATION_ERROR) on /api/cart and /api/checkout and nothing is stored', async () => {
  expectError(await buy(oneTime(101), FRI), 422, 'VALIDATION_ERROR');
  expectError(await call('/api/cart', { body: { items: oneTime(101), deliveryDate: FRI } }), 422, 'VALIDATION_ERROR');
  nothingStored();
});

test('A4 1 L is below the 2 L minimum: MINIMUM_QUANTITY on cart and checkout; with the setting off 1 L = 35000 + 35000', async () => {
  expectError(await buy(oneTime(1), FRI), 422, 'MINIMUM_QUANTITY');
  expectError(await call('/api/cart', { body: { items: oneTime(1), deliveryDate: FRI } }), 422, 'MINIMUM_QUANTITY');
  nothingStored();
  setSetting('minimumLitres', 0);
  const { order } = expectStatus(await buy(oneTime(1), FRI), 201);
  assert.equal(order.subtotalMinor, 35000);
  assert.equal(order.totalMinor, 70000);
  // the minimum counts litres per delivery line: 2 L is exactly on the boundary
  setSetting('minimumLitres', 2);
  expectStatus(await buy(oneTime(2), FRI, { email: 'boundary@example.test' }), 201);
});

test('A5 invalid quantities (0, negative, decimal, string, null, boolean, huge, NaN-like) are rejected with 422 and store nothing', async () => {
  for (const quantity of [0, -1, -2, 1.5, 2.5, 0.1, '2', '', 'abc', null, true, [], {}, 1e3, 1e21, Number.MAX_SAFE_INTEGER, 'Infinity']) {
    const items = [{ productId: COW, quantity, purchaseType: 'one_time' }];
    const result = await buy(items, FRI, { ip: ip() });
    assert.equal(result.status, 422, `checkout quantity=${JSON.stringify(quantity)} -> ${result.status} ${JSON.stringify(result.body)}`);
    const cart = await call('/api/cart', { body: { items, deliveryDate: FRI }, ip: ip() });
    assert.equal(cart.status, 422, `cart quantity=${JSON.stringify(quantity)} -> ${cart.status}`);
  }
  // a missing quantity and a missing/unknown productId too
  assert.equal((await buy([{ productId: COW, purchaseType: 'one_time' }], FRI, { ip: ip() })).status, 422);
  assert.equal((await buy([{ quantity: 2, purchaseType: 'one_time' }], FRI, { ip: ip() })).status, 422);
  assert.equal((await buy([], FRI, { ip: ip() })).status, 422);
  nothingStored();
});

test('A6 the same product twice in one cart is priced per line and the total is the sum (2 + 3 L = 175000 + 35000 fee)', async () => {
  const items = [{ productId: COW, quantity: 2, purchaseType: 'one_time' }, { productId: COW, quantity: 3, purchaseType: 'one_time' }];
  const { order } = expectStatus(await buy(items, FRI), 201);
  assert.equal(order.subtotalMinor, 175000);
  assert.equal(order.totalMinor, 210000);
  assert.equal(count('order_items', 'order_id=?', order.id), 2);
});

test('A7 forged client prices/status/fee are ignored; goat milk (inactive) cannot be bought', async () => {
  const forged = [{ productId: COW, quantity: 2, purchaseType: 'one_time', unitPriceMinor: 1, priceMinor: 1, lineTotalMinor: 1 }];
  const { order } = expectStatus(await buy(forged, FRI, { body: { totalMinor: 1, deliveryFeeMinor: 0, paymentStatus: 'paid' } }), 201);
  assert.equal(order.totalMinor, 105000);
  assert.equal(order.paymentStatus, 'pending');
  const goat = await buy([{ productId: 'prod_kozje_1l', quantity: 2, purchaseType: 'one_time' }], FRI, { ip: ip() });
  expectError(goat, 409, 'PRODUCT_UNAVAILABLE');
  assert.equal(count('orders'), 1);
});

// ---------------------------------------------------------------- A8 guest / signed in
test('A8 guest checkout creates the customer; a signed-in customer buying again reuses the same customer and sees both orders', async () => {
  const first = expectStatus(await buy(oneTime(2), TUE, { email: 'repeat@example.test' }), 201);
  assert.equal(count('customers'), 1);
  const customerId = sql('SELECT id FROM customers').id;
  const session = sessionByEmail('repeat@example.test');
  // signed-in purchase: cookie present, same body email
  const second = expectStatus(await buy(oneTime(3), FRI, { email: 'repeat@example.test', cookie: session.cookie }), 201);
  assert.equal(count('customers'), 1, 'no duplicate customer');
  assert.deepEqual(rows('SELECT DISTINCT customer_id FROM orders').map((r) => r.customer_id), [customerId]);
  const view = expectStatus(await account(session.cookie));
  assert.deepEqual(view.orders.map((o) => [o.id, o.total_minor]).sort(), [[first.order.id, 105000], [second.order.id, 140000]].sort());
  // E-mail case does not create a second customer
  expectStatus(await buy(oneTime(2), FRI, { email: 'REPEAT@Example.test' }), 201);
  assert.equal(count('customers'), 1);
  noDuplicateOutbox();
});

test('A9 [PITANJE] a signed-in session does not bind the order: the order lands on the e-mail typed in the body, not on the session owner', async () => {
  expectStatus(await buy(oneTime(2), TUE, { email: 'owner@example.test' }), 201);
  const owner = sessionByEmail('owner@example.test');
  const { order } = expectStatus(await buy(oneTime(2), FRI, { email: 'someone-else@example.test', cookie: owner.cookie }), 201);
  assert.equal(sql('SELECT c.email FROM orders o JOIN customers c ON c.id=o.customer_id WHERE o.id=?', order.id).email, 'someone-else@example.test');
  const view = expectStatus(await account(owner.cookie));
  assert.equal(view.orders.some((o) => o.id === order.id), false);
  // Question for the owner: should a signed-in customer's checkout be forced to the session e-mail, or is guest-style checkout under any e-mail intended?
});

test('A10 a returning customer typing a new address: order snapshot keeps the new address, the customer row is NOT overwritten (document current behaviour)', async () => {
  expectStatus(await buy(oneTime(2), TUE, { email: 'move@example.test' }), 201);
  const result = expectStatus(await buy(oneTime(2), FRI, { customer: cust('move@example.test', { city: 'Novi Sad', postalCode: '21000' }, { addressLine1: 'Nova ulica 5' }) }), 201);
  const shipping = JSON.parse(sql('SELECT shipping_json s FROM orders WHERE id=?', result.order.id).s);
  assert.equal(shipping.addressLine1, 'Nova ulica 5');
  assert.equal(shipping.city, 'Novi Sad');
  const day = await adminList(FRI);
  assert.equal(day.orders[0].customer_snapshot.addressLine1, 'Nova ulica 5', 'the driver list must show the address typed at checkout, not the stale customer row');
});

// ---------------------------------------------------------------- A11 idempotency
test('A11 same Idempotency-Key + same body (double click / refresh / replay): one order, identical response, no extra outbox rows', async () => {
  const key = 'tp-a-idem-0001';
  const first = await buy(oneTime(2), FRI, { key, email: 'dc@example.test' });
  assert.equal(first.status, 201);
  const outboxBefore = count('outbox');
  const replay = await buy(oneTime(2), FRI, { key, email: 'dc@example.test' });
  assert.equal(replay.status, 201);
  assert.deepEqual(replay.body, first.body);
  inst('2026-11-20T10:05:00Z'); // a later refresh still replays
  assert.deepEqual((await buy(oneTime(2), FRI, { key, email: 'dc@example.test' })).body, first.body);
  assert.equal(count('orders'), 1);
  assert.equal(count('order_items'), 1);
  assert.equal(count('outbox'), outboxBefore);
  assert.equal(count('idempotency_keys', "namespace='checkout'"), 1);
  noDuplicateOutbox();
});

test('A12 same key with a different body (quantity, e-mail, date, payment method, note) -> 409 IDEMPOTENCY_CONFLICT, still one order', async () => {
  const key = 'tp-a-idem-0002';
  expectStatus(await buy(oneTime(2), FRI, { key, email: 'k@example.test' }), 201);
  for (const variant of [
    () => buy(oneTime(3), FRI, { key, email: 'k@example.test' }),
    () => buy(oneTime(2), FRI, { key, email: 'other@example.test' }),
    () => buy(oneTime(2), TUE, { key, email: 'k@example.test' }),
    () => buy(oneTime(2), FRI, { key, email: 'k@example.test', paymentMethod: 'card' }),
    () => buy(oneTime(2), FRI, { key, email: 'k@example.test', body: { customerNote: 'x' } }),
  ]) expectError(await variant(), 409, 'IDEMPOTENCY_CONFLICT');
  assert.equal(count('orders'), 1);
  assert.equal(count('customers'), 1);
});

test('A13 15 parallel identical card requests with one key: exactly one order, one payment (paid, one reference), one fiscal request, all responses identical', async () => {
  const key = 'tp-a-parallel-0001';
  const results = await Promise.all(Array.from({ length: 15 }, () => buy(oneTime(2), TUE, { key, email: 'par@example.test', paymentMethod: 'card', ip: ip() })));
  assert.deepEqual([...new Set(results.map((r) => r.status))], [201], results.map((r) => `${r.status}:${r.code ?? ''}`).join(' '));
  assert.equal(new Set(results.map((r) => r.body.order.id)).size, 1);
  assert.equal(count('orders'), 1);
  assert.equal(count('order_items'), 1);
  const order = sql('SELECT * FROM orders');
  assert.equal(order.payment_status, 'paid');
  assert.equal(order.total_minor, 105000);
  assert.ok(order.payment_provider_ref?.startsWith('mock_pay_'));
  assert.equal(topicCount('payment.captured', order.id), 1);
  assert.equal(topicCount('fiscal.receipt.requested', order.id), 1);
  assert.equal(topicCount('order.created', order.id), 1);
  assert.equal(topicCount('email.order_confirmation.requested', order.id), 1);
  assert.equal(count('fiscal_receipts'), 1);
  assert.equal(count('idempotency_keys', "namespace='checkout'"), 1);
  noDuplicateOutbox();
});

test('A14 10 parallel identical CASH requests with one key: exactly one order and one customer', async () => {
  const key = 'tp-a-parallel-0002';
  const results = await Promise.all(Array.from({ length: 10 }, () => buy(oneTime(2), FRI, { key, email: 'parcash@example.test', ip: ip() })));
  assert.deepEqual([...new Set(results.map((r) => r.status))], [201], results.map((r) => `${r.status}:${r.code ?? ''}`).join(' '));
  assert.equal(count('orders'), 1);
  assert.equal(count('customers'), 1);
  assert.equal(topicCount('payment.cash_due'), 1);
  noDuplicateOutbox();
});

test('A15 BUG: two parallel requests with the same key but different bodies: one wins, the other is 409; never two orders', async () => {
  const key = 'tp-a-parallel-0003';
  const results = await Promise.all([
    buy(oneTime(2), FRI, { key, email: 'diff@example.test', ip: ip() }),
    buy(oneTime(3), FRI, { key, email: 'diff@example.test', ip: ip() }),
  ]);
  assert.equal(count('orders'), 1);
  assert.equal(results.filter((r) => r.status === 201).length, 1, results.map((r) => `${r.status}:${r.code ?? ''}`).join(' '));
  assert.ok(results.some((r) => r.status === 409), 'the loser must be a 409, not a 5xx: ' + results.map((r) => `${r.status}:${r.code ?? ''}`).join(' '));
});

// ---------------------------------------------------------------- A16 card payment
test('A16 mock card payment succeeds: paid, payment.captured + fiscal request, no cash_due, account shows paid', async () => {
  const { order } = expectStatus(await buy(oneTime(2), FRI, { email: 'card@example.test', paymentMethod: 'card', paymentToken: 'tok_ok' }), 201);
  assert.equal(order.paymentStatus, 'paid');
  assert.equal(order.totalMinor, 105000);
  const row = sql('SELECT * FROM orders WHERE id=?', order.id);
  assert.deepEqual([row.payment_method, row.payment_status, row.payment_fee_minor], ['card', 'paid', Math.round(105000 * 250 / 10000)]);
  assert.equal(topicCount('payment.captured', order.id), 1);
  assert.equal(topicCount('payment.cash_due'), 0);
  const view = expectStatus(await account(sessionByEmail('card@example.test').cookie));
  assert.equal(view.orders[0].payment_status, 'paid');
  assert.equal((await adminList(FRI)).orders.length, 1, 'a paid one-time order is on the driver list');
});

test('A17 declined mock card (token "mock-decline") -> 402 PAYMENT_FAILED and NOTHING is left behind; a retry with a good token then works', async () => {
  const declined = await buy(oneTime(2), FRI, { email: 'decl@example.test', paymentMethod: 'card', paymentToken: 'mock-decline', key: 'tp-a-decline-001' });
  expectError(declined, 402, 'PAYMENT_FAILED');
  nothingStored();
  assert.equal((await adminList(FRI)).orders.length, 0);
  // same key, good token: no half-stored state blocks the retry
  const retry = expectStatus(await buy(oneTime(2), FRI, { email: 'decl@example.test', paymentMethod: 'card', paymentToken: 'tok_good', key: 'tp-a-decline-001' }), 201);
  assert.equal(retry.order.paymentStatus, 'paid');
  assert.equal(count('orders'), 1);
});

test('A18 card payment without a token / raw card data / disabled adapter fail closed', async () => {
  expectError(await call('/api/checkout', { body: { customer: cust('nt@example.test'), items: oneTime(2), paymentMethod: 'card', deliveryDate: FRI } }), 422, 'PAYMENT_TOKEN_REQUIRED');
  expectError(await buy(oneTime(2), FRI, { paymentMethod: 'card', paymentToken: '4111 1111 1111 1111', ip: ip() }), 422, 'CARD_DATA_REJECTED');
  expectError(await buy(oneTime(2), FRI, { paymentMethod: 'card', body: { cvv: '123' }, ip: ip() }), 422, 'CARD_DATA_REJECTED');
  env.PAYMENT_MODE = 'disabled';
  expectError(await buy(oneTime(2), FRI, { paymentMethod: 'card', ip: ip() }), 503, 'PAYMENT_METHOD_UNAVAILABLE');
  nothingStored();
  // "payment interrupted half way" (customer closes the bank page) cannot be simulated: there is no redirect/3-DS flow, only the synchronous mock.
});

// ---------------------------------------------------------------- A19 delivery date validation
test('A19 past date -> 409 DELIVERY_LOCKED; non-delivery weekday -> 422 INVALID_DELIVERY_DATE; Novi Sad on Tuesday -> 422; malformed -> 422', async () => {
  expectError(await buy(oneTime(2), '2026-11-17', { ip: ip() }), 409, 'DELIVERY_LOCKED'); // a Tuesday in the past
  expectError(await buy(oneTime(2), '2026-11-13', { ip: ip() }), 409, 'DELIVERY_LOCKED'); // a Friday in the past
  expectError(await buy(oneTime(2), '2026-11-25', { ip: ip() }), 422, 'INVALID_DELIVERY_DATE'); // Wednesday
  expectError(await buy(oneTime(2), '2026-11-23', { ip: ip() }), 422, 'INVALID_DELIVERY_DATE'); // Monday
  expectError(await buy(oneTime(2), '2026-11-29', { ip: ip() }), 422, 'INVALID_DELIVERY_DATE'); // Sunday
  expectError(await buy(oneTime(2), TUE, { where: { city: 'Novi Sad', postalCode: '21000' }, ip: ip() }), 422, 'INVALID_DELIVERY_DATE');
  for (const bad of ['2026-13-40', '2026-02-30', 'sutra', '24.11.2026', '', 12, {}]) expectError(await buy(oneTime(2), bad, { ip: ip() }), 422, 'VALIDATION_ERROR');
  assert.equal(count('orders'), 0);
});

test('A20 BUG: a REJECTED checkout for a past date must not write anything, but it persists a locked deliveries row for that date', async () => {
  const before = count('deliveries');
  expectError(await buy(oneTime(2), '2026-11-17', { ip: ip() }), 409, 'DELIVERY_LOCKED');
  expectError(await buy(oneTime(2), '2020-01-07', { ip: ip() }), 409, 'DELIVERY_LOCKED');
  assert.equal(count('deliveries'), before, 'rejected requests created delivery rows: ' + JSON.stringify(rows('SELECT delivery_date, status FROM deliveries')));
});

test('A21 holiday: the date is refused (422 DELIVERY_HOLIDAY), the default date skips it, /api/delivery-options does not offer it', async () => {
  setSetting('holidays', [FRI]);
  expectError(await buy(oneTime(2), FRI), 422, 'DELIVERY_HOLIDAY');
  expectError(await call('/api/cart', { body: { items: oneTime(2), deliveryDate: FRI } }), 422, 'DELIVERY_HOLIDAY');
  const options = expectStatus(await call('/api/delivery-options?city=Novi%20Sad&postalCode=21000'));
  assert.equal(options.dates.includes(FRI), false);
  assert.equal(options.dates[0], '2026-12-04');
  // without a date, Belgrade gets the next non-holiday route day (Tuesday)
  assert.equal(expectStatus(await buy(oneTime(2), undefined, { email: 'nodate@example.test' }), 201).order.deliveryDate, TUE);
  assert.equal(count('orders'), 1);
});

test('A22 cutoff instant (Tuesday 11-24, cutoff = Sun 11-22 18:00:00Z = 19:00 Belgrade): 17:59 ok, 17:59:59 ok, exactly 18:00:00 locked, 18:01 locked, default date moves to Friday', async () => {
  const cases = [['2026-11-22T17:59:00Z', 201], ['2026-11-22T17:59:59Z', 201], ['2026-11-22T18:00:00Z', 409], ['2026-11-22T18:01:00Z', 409], ['2026-11-23T08:00:00Z', 409]];
  for (const [instant, status] of cases) {
    fresh(instant);
    const result = await buy(oneTime(2), TUE, { email: 'cut@example.test' });
    assert.equal(result.status, status, `${instant} -> ${result.status} ${result.code ?? ''}`);
    if (status === 409) {
      assert.equal(result.code, 'DELIVERY_LOCKED');
      assert.equal(count('orders'), 0);
    } else assert.equal(result.body.order.totalMinor, 105000);
    // /api/cart quotes follow the same rule
    const quote = await call('/api/cart', { body: { items: oneTime(2), deliveryDate: TUE } });
    assert.equal(quote.status, status === 201 ? 200 : 409, `cart ${instant}`);
    // and the default date: Tuesday while open, otherwise the next route day
    const defaulted = expectStatus(await buy(oneTime(2), undefined, { email: 'cut2@example.test', ip: ip() }), 201);
    assert.equal(defaulted.order.deliveryDate, status === 201 ? TUE : '2026-11-27', instant);
    const options = expectStatus(await call('/api/delivery-options?city=Beograd&postalCode=11000'));
    assert.equal(options.dates.includes(TUE), status === 201, `delivery-options ${instant}`);
  }
});

test('A23 Friday cutoff (Wed 11-25 18:00Z) applies to Beograd and Novi Sad alike', async () => {
  for (const where of [{ city: 'Beograd', postalCode: '11000' }, { city: 'Novi Sad', postalCode: '21000' }]) {
    fresh('2026-11-25T17:59:00Z');
    expectStatus(await buy(oneTime(2), FRI, { where }), 201);
    fresh('2026-11-25T18:01:00Z');
    expectError(await buy(oneTime(2), FRI, { where }), 409, 'DELIVERY_LOCKED');
  }
});

test('A24 route locked early by the admin: checkout for that date is DELIVERY_LOCKED, the default date and /api/delivery-options skip it', async () => {
  expectStatus(await buy(oneTime(2), FRI, { email: 'before-lock@example.test' }), 201);
  expectStatus(await generate(FRI));
  expectStatus(await call('/api/admin/deliveries', { admin: true, body: { action: 'lock', date: FRI, force: true } }));
  assert.equal(sql('SELECT status FROM deliveries WHERE delivery_date=?', FRI).status, 'locked');
  expectError(await buy(oneTime(2), FRI, { email: 'late@example.test' }), 409, 'DELIVERY_LOCKED');
  const options = expectStatus(await call('/api/delivery-options?city=Beograd&postalCode=11000'));
  assert.equal(options.dates.includes(FRI), false);
  const ns = expectStatus(await call('/api/delivery-options?city=Novi%20Sad&postalCode=21000'));
  assert.equal(ns.dates[0], '2026-12-04');
  assert.equal(expectStatus(await buy(oneTime(2), undefined, { email: 'late2@example.test', where: { city: 'Novi Sad', postalCode: '21000' } }), 201).order.deliveryDate, '2026-12-04');
  assert.equal(count('orders'), 2);
  // the driver list of the locked day still has exactly the order placed before the lock
  const day = expectStatus(await adminDay(FRI));
  assert.equal(day.orders.length, 1);
  assert.equal(day.orders[0].email, 'before-lock@example.test');
});

test('A24b BUG: /api/cart quotes an admin-locked route day as orderable (200) although checkout then refuses it with DELIVERY_LOCKED', async () => {
  expectStatus(await generate(FRI));
  expectStatus(await call('/api/admin/deliveries', { admin: true, body: { action: 'lock', date: FRI, force: true } }));
  expectError(await buy(oneTime(2), FRI, { email: 'late@example.test' }), 409, 'DELIVERY_LOCKED');
  expectError(await call('/api/cart', { body: { items: oneTime(2), deliveryDate: FRI } }), 409, 'DELIVERY_LOCKED');
});

// ---------------------------------------------------------------- A25 cancel / refund
test('A25 cash one-time order cancelled by the customer before the cutoff: cancelled, off the driver list, outbox order.updated once, not cancellable twice', async () => {
  const { order } = expectStatus(await buy(oneTime(2), FRI, { email: 'cancel@example.test' }), 201);
  assert.equal((await adminList(FRI)).orders.length, 1);
  const { cookie } = sessionByEmail('cancel@example.test');
  const cancelled = expectStatus(await patchOrder(order.id, cookie, { action: 'cancel' }));
  assert.equal(cancelled.order.fulfillment_status, 'cancelled');
  assert.equal(sql('SELECT fulfillment_status f, payment_status p, total_minor t FROM orders WHERE id=?', order.id).f, 'cancelled');
  assert.equal(sql('SELECT payment_status p FROM orders WHERE id=?', order.id).p, 'pending', 'nothing was paid, nothing to refund');
  const view = expectStatus(await account(cookie));
  assert.equal(view.orders.find((o) => o.id === order.id).fulfillment_status, 'cancelled');
  assert.deepEqual(view.oneTimeDeliveries, []);
  const day = await adminList(FRI);
  assert.equal(day.orders.length, 0);
  assert.equal(topicCount('order.updated', order.id), 1);
  assert.equal(count('refund_requests'), 0);
  expectError(await patchOrder(order.id, cookie, { action: 'cancel' }), 409, 'ORDER_NOT_EDITABLE');
  assert.equal(topicCount('order.updated', order.id), 1, 'a refused second cancel adds nothing');
  noDuplicateOutbox();
});

test('A26 cash order cancel at the cutoff instant (and after): 409 ORDER_NOT_EDITABLE, order stays planned and on the driver list', async () => {
  const { order } = expectStatus(await buy(oneTime(2), FRI, { email: 'late-cancel@example.test' }), 201);
  const { cookie } = sessionByEmail('late-cancel@example.test');
  for (const instant of ['2026-11-25T18:00:00Z', '2026-11-25T18:01:00Z', '2026-11-26T09:00:00Z']) {
    inst(instant);
    expectError(await patchOrder(order.id, cookie, { action: 'cancel' }), 409, 'ORDER_NOT_EDITABLE');
    const detail = expectStatus(await call('/api/account/orders/' + order.id, { cookie }));
    assert.equal(detail.editable, false);
  }
  assert.equal(sql('SELECT fulfillment_status f FROM orders WHERE id=?', order.id).f, 'planned');
  assert.equal((await adminList(FRI)).orders.length, 1);
});

test('A27 cancel one minute before the cutoff still works', async () => {
  const { order } = expectStatus(await buy(oneTime(2), FRI, { email: 'min-before@example.test' }), 201);
  const { cookie } = sessionByEmail('min-before@example.test');
  inst('2026-11-25T17:59:00Z');
  expectStatus(await patchOrder(order.id, cookie, { action: 'cancel' }));
  assert.equal(sql('SELECT fulfillment_status f FROM orders WHERE id=?', order.id).f, 'cancelled');
});

test("A28 another customer cannot cancel, read or refund someone else's order (404)", async () => {
  const { order } = expectStatus(await buy(oneTime(2), FRI, { email: 'victim@example.test' }), 201);
  expectStatus(await buy(oneTime(2), FRI, { email: 'attacker@example.test' }), 201);
  const attacker = sessionByEmail('attacker@example.test').cookie;
  expectError(await patchOrder(order.id, attacker, { action: 'cancel' }), 404, 'ORDER_NOT_FOUND');
  expectError(await call('/api/account/orders/' + order.id, { cookie: attacker }), 404, 'ORDER_NOT_FOUND');
  expectError(await call('/api/account/refunds', { cookie: attacker, body: { orderId: order.id, reason: 'x', idempotencyKey: 'tp-a-steal-001' } }), 404, 'ORDER_NOT_FOUND');
  assert.equal(sql('SELECT fulfillment_status f FROM orders WHERE id=?', order.id).f, 'planned');
  assert.equal(count('refund_requests'), 0);
  // no session / wrong Origin
  expectError(await patchOrder(order.id, undefined, { action: 'cancel' }), 401, 'AUTH_REQUIRED');
  const crossOrigin = await call('/api/account/orders/' + order.id, { method: 'PATCH', cookie: sessionByEmail('victim@example.test').cookie, origin: 'http://evil.example', body: { action: 'cancel' } });
  assert.ok([401, 403].includes(crossOrigin.status), `cross-origin cancel -> ${crossOrigin.status}`);
  assert.equal(sql('SELECT fulfillment_status f FROM orders WHERE id=?', order.id).f, 'planned');
});

test('A29 paid (card) one-time order: customer self-cancel is refused; a refund request before the cutoff takes it off the driver list, amount = 105000 (delivery fee included)', async () => {
  const { order } = expectStatus(await buy(oneTime(2), FRI, { email: 'paid@example.test', paymentMethod: 'card' }), 201);
  const { cookie } = sessionByEmail('paid@example.test');
  expectError(await patchOrder(order.id, cookie, { action: 'cancel' }), 409, 'ORDER_NOT_EDITABLE');
  assert.equal((await adminList(FRI)).orders.length, 1);
  const preview = expectStatus(await call('/api/account/refunds?orderId=' + order.id, { cookie }));
  assert.equal(preview.amountMinor, 105000);
  const refund = expectStatus(await call('/api/account/refunds', { cookie, body: { orderId: order.id, reason: 'Predomislio sam se', idempotencyKey: 'tp-a-refund-001' } }), 201);
  assert.equal(refund.status, 'requested');
  assert.equal(refund.amount_minor, 105000);
  assert.equal(count('refund_requests'), 1);
  assert.equal((await adminList(FRI)).orders.length, 0, 'an order with an open refund request is not delivered');
  // same key again returns the same request
  const again = expectStatus(await call('/api/account/refunds', { cookie, body: { orderId: order.id, reason: 'Predomislio sam se', idempotencyKey: 'tp-a-refund-001' } }), 201);
  assert.equal(again.id, refund.id);
  assert.equal(count('refund_requests'), 1);
  // the customer's order is still "paid / planned" until the admin executes it
  assert.deepEqual(Object.values(sql('SELECT payment_status, fulfillment_status FROM orders WHERE id=?', order.id)), ['paid', 'planned']);
});

test('A30 BUG: a second refund request for the same order (new idempotency key) must be a clean 409, not a 500', async () => {
  const { order } = expectStatus(await buy(oneTime(2), FRI, { email: 'twice@example.test', paymentMethod: 'card' }), 201);
  const { cookie } = sessionByEmail('twice@example.test');
  expectStatus(await call('/api/account/refunds', { cookie, body: { orderId: order.id, reason: 'prvi', idempotencyKey: 'tp-a-refund-010' } }), 201);
  const second = await call('/api/account/refunds', { cookie, body: { orderId: order.id, reason: 'drugi', idempotencyKey: 'tp-a-refund-011' } });
  assert.ok(second.status >= 400 && second.status < 500, `expected a 4xx (refund already open) but got ${second.status} ${second.code}`);
  assert.equal(count('refund_requests'), 1);
});

test('A31 [PITANJE] refund of a paid one-time order requested AFTER the cutoff but before the driver locks the route: currently accepted for the FULL amount (105000) and pulls the order off the list', async () => {
  const { order } = expectStatus(await buy(oneTime(2), FRI, { email: 'late-refund@example.test', paymentMethod: 'card' }), 201);
  const { cookie } = sessionByEmail('late-refund@example.test');
  inst('2026-11-25T18:01:00Z');
  const refund = await call('/api/account/refunds', { cookie, body: { orderId: order.id, reason: 'kasno', idempotencyKey: 'tp-a-refund-020' } });
  assert.equal(refund.status, 201);
  assert.equal(refund.body.amount_minor, 105000);
  // Questions: after the cutoff the milk is already ordered from the farm - should the refund be refused, reduced, or exclude the delivery fee?
});

test('A32 BUG (money): a refund request for a paid one-time order whose route is already locked/packed must be NOTHING_TO_REFUND (409), but the Fiscomm path accepts the full 105000', { todo: 'PITANJE: povraćaj posle zaključavanja ture — čeka odluku vlasnika' }, async () => {
  const { order } = expectStatus(await buy(oneTime(2), FRI, { email: 'packed@example.test', paymentMethod: 'card' }), 201);
  const { cookie } = sessionByEmail('packed@example.test');
  expectStatus(await generate(FRI));
  expectStatus(await call('/api/admin/deliveries', { admin: true, body: { action: 'lock', date: FRI, force: true } }));
  expectError(await call('/api/account/refunds', { cookie, body: { orderId: order.id, reason: 'pakovano', idempotencyKey: 'tp-a-refund-030' } }), 409, 'NOTHING_TO_REFUND');
  assert.equal(count('refund_requests'), 0);
});

test('A33 refund of an unpaid cash order is refused (REFUND_PAYMENT_REQUIRED); of an unknown order 404', async () => {
  const { order } = expectStatus(await buy(oneTime(2), FRI, { email: 'cashref@example.test' }), 201);
  const { cookie } = sessionByEmail('cashref@example.test');
  expectError(await call('/api/account/refunds', { cookie, body: { orderId: order.id, reason: 'x', idempotencyKey: 'tp-a-refund-040' } }), 409, 'REFUND_PAYMENT_REQUIRED');
  expectError(await call('/api/account/refunds', { cookie, body: { orderId: 'ord_nepostoji', reason: 'x', idempotencyKey: 'tp-a-refund-041' } }), 404, 'ORDER_NOT_FOUND');
  assert.equal(count('refund_requests'), 0);
});

test('A34 [PITANJE] admin cancel of a CASH order after the cutoff via PATCH /api/admin/orders is refused (409 DELIVERY_LOCKED) and the order becomes "locked" (stays on the list)', async () => {
  const { order } = expectStatus(await buy(oneTime(2), FRI, { email: 'admincancel@example.test' }), 201);
  inst('2026-11-25T18:01:00Z');
  expectError(await call('/api/admin/orders', { method: 'PATCH', admin: true, body: { id: order.id, fulfillmentStatus: 'cancelled' } }), 409, 'DELIVERY_LOCKED');
  assert.equal(sql('SELECT fulfillment_status f FROM orders WHERE id=?', order.id).f, 'locked');
  assert.equal(sql('SELECT payment_status p FROM orders WHERE id=?', order.id).p, 'pending');
  // Question: after the cutoff the only way to drop a cash order is "nije isporučeno" at the door - is the delivery fee then still owed, and does the customer pay for the milk?
});
