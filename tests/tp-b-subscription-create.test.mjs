// TEST_PLAN section B: creating a subscription (4-delivery prepaid weekly package).
// Run: node --test tests/tp-b-subscription-create.test.mjs
// Real post-migration catalogue: 25000 para per litre per delivery, delivery fee 35000 per delivery, 4 deliveries.
// 2 L weekly = 4 x 2 x 25000 + 4 x 35000 = 200000 + 140000 = 340000.
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import {
  COW, account, adminDay, buy, call, count, database, env, expectError, expectStatus, fresh, inst, noDuplicateOutbox, sessionByEmail, setSetting, sql, teardown, topicCount, weekly,
} from './tp-abd-helpers.mjs';

const NS = { city: 'Novi Sad', postalCode: '21000' };
const TUE = '2026-11-24', FRI = '2026-11-27';
beforeEach(() => fresh());
afterEach(() => teardown());

let ipCounter = 0;
const ip = () => `203.0.113.${(ipCounter++ % 200) + 1}`;
const generate = (date) => call('/api/admin/deliveries', { admin: true, body: { action: 'generate', date } });
async function adminList(date) { expectStatus(await generate(date)); return expectStatus(await adminDay(date)); }
const packageTotal = (litres) => 4 * litres * 25000 + 4 * 35000;
const nothingStored = () => {
  for (const table of ['orders', 'order_items', 'customers', 'subscriptions', 'subscription_items', 'subscription_packages', 'package_lines', 'outbox', 'idempotency_keys', 'fiscal_receipts']) assert.equal(count(table), 0, table + ' must stay empty');
};

/** The four checks of plan section F for a freshly created subscription. */
async function assertCreated(result, { email, date, litres, payment, city = 'Beograd' }) {
  const { order, subscription } = result.body;
  assert.equal(order.subtotalMinor, 4 * litres * 25000);
  assert.equal(order.deliveryFeeMinor, 4 * 35000);
  assert.equal(order.totalMinor, packageTotal(litres));
  assert.equal(order.paymentStatus, payment);
  assert.equal(subscription.status, 'active');
  assert.equal(subscription.nextDeliveryDate, date);
  // 1) DB
  const sub = sql('SELECT * FROM subscriptions WHERE id=?', subscription.id);
  assert.deepEqual([sub.status, sub.next_delivery_date, sub.payment_method, sub.version], ['active', date, payment === 'paid' ? 'card' : 'cash', 1]);
  assert.equal(sub.renewal_enabled, 1);
  const o = sql('SELECT * FROM orders WHERE id=?', order.id);
  assert.deepEqual([o.kind, o.total_minor, o.payment_status, o.delivery_date, o.subscription_id], ['subscription_invoice', packageTotal(litres), payment, date, subscription.id]);
  const item = sql('SELECT * FROM order_items WHERE order_id=?', order.id);
  assert.deepEqual([item.quantity, item.unit_price_minor, item.line_total_minor, item.purchase_type, item.cadence], [litres, 25000, 4 * litres * 25000, 'subscription', 'weekly']);
  const si = sql('SELECT * FROM subscription_items WHERE subscription_id=?', subscription.id);
  assert.deepEqual([si.quantity, si.cadence, si.cadence_anchor_date, si.status], [litres, 'weekly', date, 'active']);
  const pkg = sql('SELECT * FROM subscription_packages WHERE subscription_id=?', subscription.id);
  assert.equal(pkg.status, 'open');
  const line = sql('SELECT required_deliveries r, anchor_date a FROM package_lines WHERE package_id=?', pkg.id);
  assert.deepEqual([line.r, line.a], [4, date]);
  assert.equal(JSON.parse(sub.shipping_json).city, city);
  // 2) account
  const view = expectStatus(await account(sessionByEmail(email).cookie));
  const shown = view.subscriptions.find((s) => s.id === subscription.id);
  assert.deepEqual([shown.status, shown.nextDeliveryDate, shown.paymentMethod, shown.locked], ['active', date, payment === 'paid' ? 'card' : 'cash', false]);
  assert.deepEqual(shown.packageSummary, { purchased: 4, realized: 0, remaining: 4, openForAdditions: 4, paymentStatus: payment });
  assert.equal(shown.items[0].quantity, litres);
  assert.equal(shown.items[0].priceMinor, 25000);
  const shownOrder = view.orders.find((x) => x.id === order.id);
  assert.equal(shownOrder.total_minor, packageTotal(litres));
  assert.equal(shownOrder.role, 'package');
  // 3) admin list of the first delivery day
  const day = await adminList(date);
  assert.equal(day.orders.length, 1);
  assert.equal(day.orders[0].subscription_id, subscription.id);
  assert.equal(day.orders[0].customer_snapshot.city, city);
  assert.deepEqual(day.orders[0].items.map((i) => [i.product_id, i.quantity, i.source_type]), [[COW, litres, 'subscription']]);
  assert.equal(day.preparation.find((p) => p.product_id === COW).total_quantity, litres);
  // 4) outbox
  assert.equal(topicCount('subscription.activated', subscription.id), 1);
  assert.equal(topicCount('order.created', order.id), 1);
  assert.equal(topicCount('email.order_confirmation.requested', order.id), 1);
  assert.equal(topicCount(payment === 'paid' ? 'payment.captured' : 'payment.cash_due', order.id), 1);
  assert.equal(topicCount(payment === 'paid' ? 'payment.cash_due' : 'payment.captured'), 0);
  noDuplicateOutbox();
}

// ---------------------------------------------------------------- B1-B7 weekly by day/city
test('B1 weekly 2 L, Tuesday, Beograd, cash: 340000 = 200000 + 140000, active, first delivery Tuesday', async () => {
  const result = await buy(weekly(2), TUE, { email: 'b1@example.test' });
  expectStatus(result, 201);
  await assertCreated(result, { email: 'b1@example.test', date: TUE, litres: 2, payment: 'pending' });
});
test('B2 weekly 2 L, Friday, Beograd, cash: 340000', async () => {
  const result = await buy(weekly(2), FRI, { email: 'b2@example.test' });
  expectStatus(result, 201);
  await assertCreated(result, { email: 'b2@example.test', date: FRI, litres: 2, payment: 'pending' });
});
test('B3 weekly 3 L, Friday, Novi Sad, cash: 4 x 3 x 25000 + 140000 = 440000', async () => {
  const result = await buy(weekly(3), FRI, { email: 'b3@example.test', where: NS });
  expectStatus(result, 201);
  await assertCreated(result, { email: 'b3@example.test', date: FRI, litres: 3, payment: 'pending', city: 'Novi Sad' });
});
test('B4 weekly card payment (mock) on Tuesday, Beograd: paid package 340000, payment.captured + fiscal request', async () => {
  const result = await buy(weekly(2), TUE, { email: 'b4@example.test', paymentMethod: 'card' });
  expectStatus(result, 201);
  await assertCreated(result, { email: 'b4@example.test', date: TUE, litres: 2, payment: 'paid' });
  assert.equal(topicCount('fiscal.receipt.requested', result.body.order.id), 1);
  assert.ok(sql('SELECT payment_provider_ref r FROM subscriptions').r.startsWith('mock_pay_'));
});

test('B5 Tuesday for Novi Sad is refused (INVALID_DELIVERY_DATE) on checkout and cart; nothing is stored', async () => {
  expectError(await buy(weekly(2), TUE, { where: NS }), 422, 'INVALID_DELIVERY_DATE');
  expectError(await call('/api/cart', { body: { items: weekly(2), deliveryDate: TUE, city: 'Novi Sad', postalCode: '21000' } }), 422, 'INVALID_DELIVERY_DATE');
  nothingStored();
});

test('B6 biweekly (and any other cadence) is refused: CADENCE_UNAVAILABLE / VALIDATION_ERROR on checkout and cart; nothing stored', async () => {
  const biweekly = [{ productId: COW, quantity: 2, purchaseType: 'subscription', cadence: 'biweekly' }];
  expectError(await buy(biweekly, FRI), 422, 'CADENCE_UNAVAILABLE');
  expectError(await call('/api/cart', { body: { items: biweekly, deliveryDate: FRI } }), 422, 'CADENCE_UNAVAILABLE');
  for (const cadence of ['monthly', 'WEEKLY', '', null, 7]) {
    const items = [{ productId: COW, quantity: 2, purchaseType: 'subscription', cadence }];
    assert.equal((await buy(items, FRI, { ip: ip() })).status, 422, `cadence ${JSON.stringify(cadence)}`);
  }
  assert.equal((await buy([{ productId: COW, quantity: 2, purchaseType: 'subscription' }], FRI, { ip: ip() })).status, 422, 'missing cadence');
  nothingStored();
});

test('B7 subscription quantities: 1 L below the minimum (MINIMUM_QUANTITY), 100 L is the maximum (4 x 100 x 25000 + 140000 = 10140000), 101 / 0 / negative / decimal / string rejected', async () => {
  expectError(await buy(weekly(1), FRI), 422, 'MINIMUM_QUANTITY');
  expectError(await call('/api/cart', { body: { items: weekly(1), deliveryDate: FRI } }), 422, 'MINIMUM_QUANTITY');
  for (const quantity of [0, -3, 101, 2.5, '2']) assert.equal((await buy(weekly(quantity), FRI, { ip: ip() })).status, 422, `quantity ${JSON.stringify(quantity)}`);
  nothingStored();
  assert.equal(expectStatus(await buy(weekly(100), FRI), 201).order.totalMinor, 10_140_000);
});

// ---------------------------------------------------------------- B8-B10 first delivery date around the cutoff
test('B8 sign-up one minute BEFORE the Tuesday cutoff (Sun 17:59Z): first delivery is Tuesday 11-24, total 340000; explicit Tuesday accepted', async () => {
  fresh('2026-11-22T17:59:00Z');
  const quote = expectStatus(await call('/api/cart', { body: { items: weekly(2), city: 'Beograd', postalCode: '11000' } }));
  assert.equal(quote.deliveryDate, TUE);
  assert.deepEqual(quote.lines[0].deliveryDates, [TUE, '2026-12-01', '2026-12-08', '2026-12-15']);
  assert.equal(quote.totalMinor, 340000);
  const byDefault = expectStatus(await buy(weekly(2), undefined, { email: 'minb@example.test' }), 201);
  assert.equal(byDefault.subscription.nextDeliveryDate, TUE);
  assert.equal(byDefault.order.totalMinor, 340000);
  assert.equal(expectStatus(await buy(weekly(2), TUE, { email: 'minb2@example.test' }), 201).order.totalMinor, 340000);
});

test('B9 sign-up one minute AFTER the Tuesday cutoff (and at 18:00:00 exactly): explicit Tuesday refused (DELIVERY_LOCKED); default first delivery Friday 11-27; total unchanged 340000', async () => {
  for (const instant of ['2026-11-22T18:00:00Z', '2026-11-22T18:01:00Z']) {
    fresh(instant);
    expectError(await buy(weekly(2), TUE, { email: 'mina@example.test' }), 409, 'DELIVERY_LOCKED');
    expectError(await call('/api/cart', { body: { items: weekly(2), deliveryDate: TUE } }), 409, 'DELIVERY_LOCKED');
    assert.equal(count('subscriptions'), 0);
    const quote = expectStatus(await call('/api/cart', { body: { items: weekly(2), city: 'Beograd', postalCode: '11000' } }));
    assert.equal(quote.deliveryDate, FRI);
    assert.deepEqual(quote.lines[0].deliveryDates, [FRI, '2026-12-04', '2026-12-11', '2026-12-18']);
    const created = expectStatus(await buy(weekly(2), undefined, { email: 'mina@example.test' }), 201);
    assert.equal(created.subscription.nextDeliveryDate, FRI);
    assert.equal(created.order.totalMinor, 340000);
    assert.equal(sql('SELECT delivery_date d FROM orders').d, FRI);
  }
});

test('B10 Friday cutoff (Wed 11-25 18:00Z): before -> Friday 11-27 for Beograd and Novi Sad; after -> Beograd Tuesday 12-01, Novi Sad Friday 12-04', async () => {
  fresh('2026-11-25T17:59:00Z');
  assert.equal(expectStatus(await buy(weekly(2), undefined, { email: 'fb@example.test' }), 201).subscription.nextDeliveryDate, FRI);
  assert.equal(expectStatus(await buy(weekly(2), undefined, { email: 'fn@example.test', where: NS }), 201).subscription.nextDeliveryDate, FRI);
  fresh('2026-11-25T18:01:00Z');
  expectError(await buy(weekly(2), FRI, { email: 'late@example.test' }), 409, 'DELIVERY_LOCKED');
  const bg = expectStatus(await buy(weekly(2), undefined, { email: 'fb2@example.test' }), 201);
  const ns = expectStatus(await buy(weekly(2), undefined, { email: 'fn2@example.test', where: NS }), 201);
  assert.equal(bg.subscription.nextDeliveryDate, '2026-12-01');
  assert.equal(ns.subscription.nextDeliveryDate, '2026-12-04');
  assert.equal(bg.order.totalMinor, 340000);
  assert.equal(ns.order.totalMinor, 340000);
});

// ---------------------------------------------------------------- B11-B12 the four package dates / holiday
test('B11 a holiday inside the package is skipped: dates 11-27, 12-11, 12-18, 12-25 (12-04 missing), total still 4 deliveries = 340000; the route really serves exactly those four days', async () => {
  setSetting('holidays', ['2026-12-04']);
  const quote = expectStatus(await call('/api/cart', { body: { items: weekly(2), deliveryDate: FRI, city: 'Beograd', postalCode: '11000' } }));
  assert.deepEqual(quote.lines[0].deliveryDates, [FRI, '2026-12-11', '2026-12-18', '2026-12-25']);
  assert.equal(quote.deliveryOccurrences, 4);
  assert.equal(quote.totalMinor, 340000);
  const created = expectStatus(await buy(weekly(2), FRI, { email: 'hol@example.test', paymentMethod: 'card' }), 201);
  assert.equal(created.order.totalMinor, 340000);
  // Drive the whole package through the admin route, the day before each date.
  const served = [];
  for (const date of [FRI, '2026-12-04', '2026-12-11', '2026-12-18', '2026-12-25']) {
    inst(new Date(Date.parse(`${date}T10:00:00Z`) - 86_400_000).toISOString());
    const day = await adminList(date);
    if (day.orders.length) {
      assert.equal(day.orders[0].items[0].quantity, 2);
      served.push(date);
      expectStatus(await call('/api/admin/deliveries', { admin: true, body: { action: 'lock', date } }));
    }
  }
  assert.deepEqual(served, [FRI, '2026-12-11', '2026-12-18', '2026-12-25']);
  assert.equal(count('delivery_orders'), 4);
  assert.equal(count('deliveries', "delivery_date='2026-12-04' AND status='locked'"), 0, 'the holiday is never locked/served');
  // after the 4th visit the subscription points at the following Friday (renewal is the daily job)
  assert.equal(sql('SELECT next_delivery_date n FROM subscriptions').n, '2027-01-01');
});

test('B12 a holiday on the FIRST package date is refused (DELIVERY_HOLIDAY); the default first date skips the holiday', async () => {
  setSetting('holidays', [TUE]);
  expectError(await buy(weekly(2), TUE), 422, 'DELIVERY_HOLIDAY');
  assert.equal(expectStatus(await buy(weekly(2), undefined, { email: 'nh@example.test' }), 201).subscription.nextDeliveryDate, FRI);
});

// ---------------------------------------------------------------- B13-B16 payment state
test('B13 cash package = unpaid: subscription is ACTIVE, order pending; it enters preparation for the FIRST delivery only until the package is paid', async () => {
  const { order, subscription } = expectStatus(await buy(weekly(2), FRI, { email: 'cashpkg@example.test' }), 201);
  assert.equal(order.paymentStatus, 'pending');
  assert.equal(sql('SELECT status s FROM subscriptions WHERE id=?', subscription.id).s, 'active');
  assert.equal((await adminList(FRI)).orders.length, 1, 'first delivery of an unpaid cash package is prepared (cash on delivery)');
  assert.equal((await adminList('2026-12-04')).orders.length, 0, 'second delivery is NOT prepared while the package is unpaid');
  assert.equal((await adminList('2026-12-11')).orders.length, 0);
  // the admin records the payment (cash collected): the later deliveries now appear
  expectStatus(await call('/api/admin/orders', { method: 'PATCH', admin: true, body: { id: order.id, paymentStatus: 'paid' } }));
  assert.equal(sql('SELECT payment_status p FROM orders WHERE id=?', order.id).p, 'paid');
  assert.equal((await adminList('2026-12-04')).orders.length, 1);
  assert.equal((await adminList('2026-12-11')).orders.length, 1);
  const view = expectStatus(await account(sessionByEmail('cashpkg@example.test').cookie));
  assert.equal(view.subscriptions[0].packageSummary.paymentStatus, 'paid');
});

test('B14 card (mock) package = paid at once: all four deliveries are prepared, a fifth day is not', async () => {
  expectStatus(await buy(weekly(2), FRI, { email: 'paidpkg@example.test', paymentMethod: 'card' }), 201);
  for (const date of [FRI, '2026-12-04', '2026-12-11', '2026-12-18']) assert.equal((await adminList(date)).orders.length, 1, date);
  assert.equal((await adminList('2026-12-25')).orders.length, 0, 'a package covers exactly 4 deliveries');
});

test('B15 declined first card payment (token mock-decline): 402 PAYMENT_FAILED, no customer/subscription/package/outbox, nothing on the driver list; a retry with a good token creates ONE active paid package', async () => {
  expectError(await buy(weekly(2), FRI, { email: 'decl@example.test', paymentMethod: 'card', paymentToken: 'mock-decline', key: 'tp-b-decline-001' }), 402, 'PAYMENT_FAILED');
  nothingStored();
  assert.equal((await adminList(FRI)).orders.length, 0);
  const retry = expectStatus(await buy(weekly(2), FRI, { email: 'decl@example.test', paymentMethod: 'card', paymentToken: 'tok_good', key: 'tp-b-decline-001' }), 201);
  assert.equal(retry.order.paymentStatus, 'paid');
  assert.equal(count('subscriptions'), 1);
  assert.equal(count('subscription_packages'), 1);
  assert.equal(count('orders'), 1);
});

test('B16 a card package whose payment is pending/failed (state forced in the DB - the mock cannot produce it) is NOT prepared; webhook "paid" activates it once, a duplicate event changes nothing', async () => {
  const { order } = expectStatus(await buy(weekly(2), FRI, { email: 'pend@example.test', paymentMethod: 'card' }), 201);
  database.raw.exec(`UPDATE orders SET payment_status='pending' WHERE id='${order.id}'`);
  assert.equal((await adminList(FRI)).orders.length, 0, 'unpaid card package must not enter preparation');
  const hook = (eventId, status) => call('/api/webhooks/payments', { headers: { 'x-webhook-secret': env.PAYMENT_WEBHOOK_SECRET }, body: { eventId, orderId: order.id, status }, ip: ip() });
  expectStatus(await hook('tp-b-evt-1', 'failed'));
  assert.equal(sql('SELECT payment_status p FROM orders WHERE id=?', order.id).p, 'failed');
  assert.equal((await adminList(FRI)).orders.length, 0, 'failed payment: still not prepared');
  expectStatus(await hook('tp-b-evt-2', 'paid'));
  assert.equal(sql('SELECT payment_status p FROM orders WHERE id=?', order.id).p, 'paid');
  assert.equal((await adminList(FRI)).orders.length, 1);
  assert.equal(expectStatus(await hook('tp-b-evt-2', 'paid')).duplicate, true);
  assert.equal(count('webhook_events'), 2);
  assert.equal(topicCount('payment.status_changed', order.id), 2);
});

// ---------------------------------------------------------------- B17 idempotency of sign-up
test('B17 10 parallel identical sign-ups (one key) create ONE subscription, ONE package, ONE order; the same key with another body is 409', async () => {
  const key = 'tp-b-idem-0001';
  const results = await Promise.all(Array.from({ length: 10 }, () => buy(weekly(2), FRI, { key, email: 'once@example.test', paymentMethod: 'card', ip: ip() })));
  assert.deepEqual([...new Set(results.map((r) => r.status))], [201], results.map((r) => `${r.status}:${r.code ?? ''}`).join(' '));
  assert.equal(count('subscriptions'), 1);
  assert.equal(count('subscription_items'), 1);
  assert.equal(count('subscription_packages'), 1);
  assert.equal(count('package_lines'), 1);
  assert.equal(count('orders'), 1);
  assert.equal(topicCount('subscription.activated'), 1);
  assert.equal(topicCount('payment.captured'), 1);
  noDuplicateOutbox();
  expectError(await buy(weekly(3), FRI, { key, email: 'once@example.test', paymentMethod: 'card' }), 409, 'IDEMPOTENCY_CONFLICT');
});

// ---------------------------------------------------------------- B18-B19 second subscription
test('B18 [PITANJE] a customer who already has an ACTIVE subscription buys another: currently allowed - two active subscriptions, two delivery stops on the same day (5 L total)', async () => {
  const first = expectStatus(await buy(weekly(2), TUE, { email: 'two@example.test' }), 201);
  const second = expectStatus(await buy(weekly(3), TUE, { email: 'two@example.test' }), 201);
  assert.notEqual(first.subscription.id, second.subscription.id);
  assert.equal(count('customers'), 1);
  assert.equal(count('subscriptions', "status='active'"), 2);
  const view = expectStatus(await account(sessionByEmail('two@example.test').cookie));
  assert.equal(view.subscriptions.length, 2);
  const day = await adminList(TUE);
  assert.equal(day.orders.length, 2);
  assert.equal(day.preparation.find((p) => p.product_id === COW).total_quantity, 5);
  // Questions: may one customer hold two active subscriptions (same address, same day)? If not: refuse, or merge into the existing package?
});

test('B19 [PITANJE] a customer whose subscription was cancelled signs up again: allowed, new independent subscription', async () => {
  const first = expectStatus(await buy(weekly(2), FRI, { email: 'again@example.test' }), 201);
  const { cookie } = sessionByEmail('again@example.test');
  expectStatus(await call('/api/account/subscriptions/' + first.subscription.id, { method: 'PATCH', cookie, body: { action: 'cancel', expectedVersion: 1 } }));
  const again = expectStatus(await buy(weekly(2), '2026-12-04', { email: 'again@example.test' }), 201);
  assert.notEqual(again.subscription.id, first.subscription.id);
  assert.equal(count('subscriptions', "status='active'"), 1);
  // Question: a cancelled UNPAID cash package - what happens to the already-created invoice (still pending)?
});

test('B20 quote equals checkout total for the same subscription cart (server-side pricing)', async () => {
  const quote = expectStatus(await call('/api/cart', { body: { items: weekly(5), deliveryDate: FRI, city: 'Novi Sad', postalCode: '21000' } }));
  const order = expectStatus(await buy(weekly(5), FRI, { where: NS }), 201).order;
  assert.equal(quote.totalMinor, 4 * 5 * 25000 + 140000);
  assert.equal(order.totalMinor, quote.totalMinor);
  assert.equal(order.deliveryFeeMinor, quote.deliveryFeeMinor);
  assert.equal(quote.lines[0].lineTotalMinor, 4 * 5 * 25000);
});
