// QA-critical checkout / payment suite (Agent F).
// Run: node --test tests/qa-checkout.test.mjs   (needs dist/ from `npm run build:worker`)
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import {
  TEST_CUSTOMER, call, checkout, checkoutBody, count, database, env, expectError, expectStatus, line, networkCalls, setClock, setup, sql, teardown,
} from './qa-harness.mjs';

beforeEach(() => setup());
afterEach(() => teardown());

const customer = (extra = {}) => ({ ...TEST_CUSTOMER, ...extra });
const topics = (topic) => count('outbox', 'topic=?', topic);
const setSetting = (key, value) => database.raw.prepare('INSERT INTO settings(key,value_json) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json').run(key, JSON.stringify(value));
function addPromo(overrides = {}) {
  const promo = { id: 'promo_test_f', code: 'TESTF10', discount_type: 'percent', discount_value: 10, minimum_order_minor: 0, usage_limit: null, starts_at: null, ends_at: null, is_active: 1, per_customer_limit: null, stackable: 0, ...overrides };
  database.raw.prepare('INSERT INTO promo_codes(id,code,description,discount_type,discount_value,minimum_order_minor,usage_limit,starts_at,ends_at,is_active,per_customer_limit,stackable) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)')
    .run(promo.id, promo.code, 'TEST-F promo', promo.discount_type, promo.discount_value, promo.minimum_order_minor, promo.usage_limit, promo.starts_at, promo.ends_at, promo.is_active, promo.per_customer_limit, promo.stackable);
  return promo;
}
const patchOrder = (body) => call('/api/admin/orders', { method: 'PATCH', admin: true, body });

// ---------- F-B01 idempotency ------------------------------------------------
test('F-B01 Idempotency-Key replay with the same body returns the identical response and creates one order', async () => {
  const key = 'test-f-idem-0001';
  const body = checkoutBody([line('prod_kravlje_1l', 2, 'one_time')]);
  const first = await call('/api/checkout', { body, key });
  expectStatus(first, 201);
  const replay = await call('/api/checkout', { body, key });
  assert.equal(replay.status, 201);
  assert.deepEqual(replay.body, first.body, 'replay is byte-for-byte the stored response');
  // Property order must not matter (stable hash).
  const reordered = { paymentMethod: body.paymentMethod, deliveryDate: body.deliveryDate, items: body.items, customer: Object.fromEntries(Object.entries(body.customer).reverse()) };
  assert.deepEqual((await call('/api/checkout', { body: reordered, key })).body, first.body);
  assert.equal(count('orders'), 1);
  assert.equal(topics('order.created'), 1);
  assert.equal(topics('email.order_confirmation.requested'), 1);
  assert.equal(count('idempotency_keys', "namespace='checkout'"), 1);
});

test('F-B02 same Idempotency-Key with a different body -> 409 IDEMPOTENCY_CONFLICT and no second order; a new key makes a new order', async () => {
  const key = 'test-f-idem-0002';
  expectStatus(await call('/api/checkout', { body: checkoutBody([line('prod_kravlje_1l', 2, 'one_time')]), key }), 201);
  for (const changed of [
    checkoutBody([line('prod_kravlje_1l', 3, 'one_time')]),
    checkoutBody([line('prod_kravlje_1l', 2, 'one_time')], { customer: customer({ email: 'test-f-drugi@example.test' }) }),
    checkoutBody([line('prod_kravlje_1l', 2, 'one_time')], { deliveryDate: '2027-01-05' }),
    checkoutBody([line('prod_kravlje_1l', 2, 'one_time')], { customerNote: 'TEST-F' }),
  ]) expectError(await call('/api/checkout', { body: changed, key }), 409, 'IDEMPOTENCY_CONFLICT');
  assert.equal(count('orders'), 1);
  assert.equal(count('customers'), 1);
  const fresh = expectStatus(await call('/api/checkout', { body: checkoutBody([line('prod_kravlje_1l', 2, 'one_time')]), key: 'test-f-idem-0003' }), 201);
  assert.equal(count('orders'), 2);
  assert.notEqual(fresh.order.id, sql('SELECT id FROM orders WHERE idempotency_key=?', key).id);
});

test('F-B03 Idempotency-Key must be present and 8-200 characters', async () => {
  const body = checkoutBody();
  expectError(await call('/api/checkout', { body, key: 'short' }), 422, 'IDEMPOTENCY_KEY_REQUIRED');
  expectError(await call('/api/checkout', { body, key: '1234567' }), 422, 'IDEMPOTENCY_KEY_REQUIRED');
  expectError(await call('/api/checkout', { body, key: 'x'.repeat(201) }), 422, 'VALIDATION_ERROR');
  expectError(await call('/api/checkout', { body, key: '', headers: { 'Idempotency-Key': '' } }), 422, 'VALIDATION_ERROR');
  assert.equal(count('orders'), 0);
  expectStatus(await call('/api/checkout', { body, key: '12345678' }), 201);
  expectStatus(await call('/api/checkout', { body: checkoutBody([line('prod_kravlje_1l', 3, 'one_time')]), key: 'x'.repeat(200) }), 201);
  assert.equal(count('orders'), 2);
});

// ---------- F-B04 prices come from the server --------------------------------
test('F-B04 client supplied prices, totals, statuses and discounts are ignored', async () => {
  const forged = checkoutBody([{ ...line('prod_kravlje_1l', 2, 'one_time'), unitPriceMinor: 1, priceMinor: 1, lineTotalMinor: 1, price: 0.01 }], {
    totalMinor: 1, subtotalMinor: 1, discountMinor: 49999, deliveryFeeMinor: 0, paymentStatus: 'paid', fulfillmentStatus: 'delivered', currency: 'EUR', total: 1,
  });
  const { order } = expectStatus(await call('/api/checkout', { body: forged }), 201);
  assert.equal(order.subtotalMinor, 50000);
  assert.equal(order.discountMinor, 0);
  assert.equal(order.deliveryFeeMinor, 35000);
  assert.equal(order.totalMinor, 85000);
  assert.equal(order.currency, 'RSD');
  assert.equal(order.paymentStatus, 'pending');
  const row = sql('SELECT * FROM orders WHERE id=?', order.id);
  assert.equal(row.total_minor, 85000);
  assert.equal(row.payment_status, 'pending');
  assert.equal(row.fulfillment_status, 'planned');
  const item = sql('SELECT * FROM order_items WHERE order_id=?', order.id);
  assert.equal(item.unit_price_minor, 25000);
  assert.equal(item.line_total_minor, 50000);
  assert.equal(count('fiscal_receipts'), 0, 'forged paymentStatus cannot trigger fiscalization');
});

test('F-B05 /api/cart quote equals the checkout total for the same cart, promo and fee', async () => {
  addPromo({ discount_value: 10 });
  database.raw.exec("UPDATE products SET price_minor=11111, subscription_price_minor=11111 WHERE id='prod_kravlje_1l'");
  const items = [line('prod_kravlje_1l', 3, 'one_time')];
  const quote = expectStatus(await call('/api/cart', { body: { items, deliveryDate: '2027-01-01', promoCode: 'testf10' } }));
  const { order } = expectStatus(await checkout(items, { promoCode: 'testf10' }), 201);
  assert.equal(order.subtotalMinor, 33333);
  assert.equal(order.discountMinor, 3333, '10% of 33333 rounds down to 3333');
  assert.equal(order.deliveryFeeMinor, 35000, 'the promo never discounts delivery');
  assert.equal(order.totalMinor, 33333 - 3333 + 35000);
  assert.equal(quote.totalMinor, order.totalMinor);
  assert.equal(order.promoCode, 'TESTF10');
});

// ---------- F-B06 card data --------------------------------------------------
test('F-B06 raw card data in any field or nesting is rejected with CARD_DATA_REJECTED and nothing is stored', async () => {
  const attempts = [
    { cardNumber: '4111111111111111' }, { pan: '4111111111111111' }, { cvv: '123' }, { CVC: '123' }, { expiry: '12/30' }, { expiration: '1230' }, { cardholder: 'TEST-F Kupac' }, { card: '4111111111111111' },
    { payment: { cardNumber: '4111111111111111', cvv: '123' } },
    { meta: { deep: { deeper: [{ pan: '4111111111111111' }] } } },
    { paymentToken: '4111111111111111' }, { paymentToken: '4111 1111 1111 1111' }, { paymentToken: '4111-1111-1111-1111' }, { paymentToken: '378282246310005' },
  ];
  for (const extra of attempts) {
    const result = await checkout([line('prod_kravlje_1l', 2, 'one_time')], { paymentMethod: 'card', ...extra }, { ip: `203.0.113.${(attempts.indexOf(extra) % 200) + 1}` });
    expectError(result, 422, 'CARD_DATA_REJECTED');
  }
  assert.equal(count('orders'), 0);
  assert.equal(count('customers'), 0);
  assert.equal(count('idempotency_keys'), 0);
  assert.equal(count('outbox'), 0);
});

test('F-B06b alternative spellings of card fields (card_number, cardNo, securityCode) are not silently accepted', async () => {
  const spellings = [{ card_number: '4111111111111111' }, { cardNo: '4111111111111111' }, { cc_number: '4111111111111111' }, { securityCode: '123' }, { card_cvv: '123' }, { 'card-number': '4111111111111111' }];
  const accepted = [];
  for (const [index, extra] of spellings.entries()) {
    const result = await checkout([line('prod_kravlje_1l', 2, 'one_time')], extra, { ip: `203.0.113.${index + 10}` });
    if (result.status === 201) accepted.push(Object.keys(extra)[0]);
  }
  assert.deepEqual(accepted, [], `server accepted a checkout carrying raw-card-looking fields: ${accepted.join(', ')}`);
});

// ---------- F-B07 payment method / adapter -----------------------------------
test('F-B07 card without an adapter fails closed (PAYMENT_METHOD_UNAVAILABLE) for disabled/unset/other modes; cash still works', async () => {
  for (const mode of ['disabled', undefined, '', 'production', 'live']) {
    setup({ PAYMENT_MODE: mode });
    expectError(await checkout([line('prod_kravlje_1l', 2, 'one_time')], { paymentMethod: 'card', paymentToken: 'test-f-token' }), 503, 'PAYMENT_METHOD_UNAVAILABLE');
    assert.equal(count('orders'), 0, `mode=${String(mode)}`);
    const cash = expectStatus(await checkout([line('prod_kravlje_1l', 2, 'one_time')], { paymentMethod: 'cash' }), 201);
    assert.equal(cash.order.paymentStatus, 'pending');
    assert.equal(count('fiscal_receipts'), 0);
  }
  assert.deepEqual(networkCalls, []);
});

test('F-B08 card checkout (mock adapter): token required, decline leaves no order, success is paid and fiscalized once', async () => {
  const items = [line('prod_kravlje_1l', 2, 'one_time')];
  expectError(await checkout(items, { paymentMethod: 'card' }), 422, 'PAYMENT_TOKEN_REQUIRED');
  const key = 'test-f-decline-1';
  expectError(await call('/api/checkout', { body: checkoutBody(items, { paymentMethod: 'card', paymentToken: 'mock-decline' }), key }), 402, 'PAYMENT_FAILED');
  assert.equal(count('orders'), 0);
  assert.equal(count('idempotency_keys'), 0, 'a declined payment is not cached as an order');
  const paid = expectStatus(await call('/api/checkout', { body: checkoutBody(items, { paymentMethod: 'card', paymentToken: 'test-f-token' }), key }), 201);
  assert.equal(paid.order.paymentStatus, 'paid');
  assert.equal(topics('payment.captured'), 1);
  assert.equal(topics('fiscal.receipt.requested'), 1);
  assert.equal(count('fiscal_receipts', "status='issued' AND kind='advance'"), 1);
  assert.equal(sql('SELECT payment_provider_ref r FROM orders').r, `mock_pay_${paid.order.id}`);
});

test('F-B09 unknown or missing paymentMethod is rejected', async () => {
  for (const paymentMethod of ['bank_transfer', 'CASH', 'paypal', '', null, 5]) {
    expectError(await checkout([line()], { paymentMethod }, { ip: `203.0.113.${count('orders') + 30 + String(paymentMethod).length}` }), 422, 'VALIDATION_ERROR');
  }
  const body = checkoutBody(); delete body.paymentMethod;
  expectError(await call('/api/checkout', { body }), 422, 'VALIDATION_ERROR');
  assert.equal(count('orders'), 0);
});

// ---------- F-B10 minimum order, zone, dates ---------------------------------
test('F-B10 minimum order is checked on products only, at the exact boundary, before discounts and delivery fee', async () => {
  setSetting('minimumOrderMinor', 50000);
  database.raw.exec("UPDATE products SET price_minor=24999, subscription_price_minor=24999 WHERE id='prod_kravlje_1l'");
  const below = await checkout([line('prod_kravlje_1l', 2, 'one_time')], {});
  expectError(below, 422, 'MINIMUM_ORDER');
  assert.match(below.body.error.message, /500/);
  assert.equal(count('orders'), 0);
  database.raw.exec("UPDATE products SET price_minor=25000, subscription_price_minor=25000 WHERE id='prod_kravlje_1l'");
  expectStatus(await checkout([line('prod_kravlje_1l', 2, 'one_time')], {}), 201);
  // The delivery fee must not help reach the minimum, and a promo must not push an order that met it below.
  database.raw.exec("UPDATE products SET price_minor=24999, subscription_price_minor=24999 WHERE id='prod_kravlje_1l'");
  expectError(await checkout([line('prod_kravlje_1l', 2, 'one_time')], { customer: customer({ email: 'test-f-min2@example.test' }) }), 422, 'MINIMUM_ORDER');
  database.raw.exec("UPDATE products SET price_minor=25000, subscription_price_minor=25000 WHERE id='prod_kravlje_1l'");
  addPromo({ discount_type: 'percent', discount_value: 50 });
  const discounted = expectStatus(await checkout([line('prod_kravlje_1l', 2, 'one_time')], { promoCode: 'TESTF10', customer: customer({ email: 'test-f-min3@example.test' }) }), 201);
  assert.equal(discounted.order.discountMinor, 25000);
  const quote = expectStatus(await call('/api/cart', { body: { items: [line('prod_kravlje_1l', 1, 'one_time')], deliveryDate: '2027-01-01' } }));
  assert.equal(quote.minimumOrderMet, false, 'the informational quote flags the unmet minimum');
});

test('F-B11 addresses outside the delivery zone are rejected before any customer or order is created', async () => {
  for (const [index, address] of [
    { postalCode: '99999' }, { postalCode: '11' }, { postalCode: '1100x' }, { postalCode: '' }, { postalCode: '18000', city: 'Niš' }, { postalCode: '26000', city: 'Pančevo' },
    { postalCode: '22320', city: 'Inđija' }, // Inđija stays closed until its schedule is approved
    { postalCode: '21000', city: 'Beograd' }, // city and postal code disagree
    { postalCode: '11000', city: 'Niš' },
  ].entries()) {
    const result = await checkout([line()], { customer: customer(address) }, { ip: `203.0.113.${index + 50}` });
    assert.ok([422].includes(result.status), `${JSON.stringify(address)} -> ${result.status} ${JSON.stringify(result.body)}`);
    assert.ok(['DELIVERY_AREA_UNAVAILABLE', 'VALIDATION_ERROR'].includes(result.code), `${JSON.stringify(address)} -> ${result.code}`);
  }
  assert.equal(count('orders'), 0);
  assert.equal(count('customers'), 0);
  assert.equal(expectStatus(await call('/api/cart', { body: { items: [line()], deliveryDate: '2027-01-01', postalCode: '99999' } })).serviceable, false, 'the informational quote flags an unserviceable postal code');
});

test('F-B12 Novi Sad is Friday-only; Belgrade Tuesday and Friday; other weekdays and weekends are rejected', async () => {
  const ns = customer({ city: 'Novi Sad', postalCode: '21000' });
  expectError(await checkout([line()], { customer: ns, deliveryDate: '2027-01-05' }), 422, 'INVALID_DELIVERY_DATE');
  expectStatus(await checkout([line()], { customer: ns, deliveryDate: '2027-01-01' }, { ip: '203.0.113.90' }), 201);
  expectStatus(await checkout([line()], { deliveryDate: '2027-01-05' }, { ip: '203.0.113.91' }), 201);
  for (const [index, deliveryDate] of ['2027-01-02', '2027-01-03', '2027-01-04', '2027-01-06', '2027-01-07'].entries()) {
    expectError(await checkout([line()], { deliveryDate }, { ip: `203.0.113.${100 + index}` }), 422, 'INVALID_DELIVERY_DATE');
  }
  assert.equal(count('orders'), 2);
});

test('F-B13 malformed delivery dates are rejected; omitted date selects the next window; holidays are refused', async () => {
  for (const [index, deliveryDate] of ['2027-13-45', '2027-02-30', '31.12.2027', '2027-1-1', '2027-01-01T00:00:00Z', '', 20270101, '<script>', "2027-01-01'; DROP TABLE orders;--"].entries()) {
    expectError(await checkout([line()], { deliveryDate }, { ip: `203.0.113.${110 + index}` }), 422, 'VALIDATION_ERROR');
  }
  assert.ok(count('orders') === 0 && count('customers') === 0);
  const defaulted = expectStatus(await checkout([line()], { deliveryDate: undefined }, { ip: '203.0.113.130' }), 201);
  assert.equal(defaulted.order.deliveryDate, '2027-01-01');
  setSetting('holidays', ['2027-01-08']);
  expectError(await checkout([line()], { deliveryDate: '2027-01-08' }, { ip: '203.0.113.131' }), 422, 'DELIVERY_HOLIDAY');
});

test('F-B14 cutoff: accepted until one millisecond before DELIVERY_EDIT cutoff, rejected from the exact cutoff instant', async () => {
  // Delivery Fri 2027-01-01 08:00 Belgrade (07:00Z), cutoff 24h before = 2026-12-31T07:00:00Z.
  setClock('2026-12-31T06:59:59.999Z');
  expectStatus(await checkout([line()], {}, { ip: '203.0.113.140' }), 201);
  setClock('2026-12-31T07:00:00.000Z');
  const locked = await checkout([line()], { customer: customer({ email: 'test-f-cutoff@example.test' }) }, { ip: '203.0.113.141' });
  expectError(locked, 409, 'DELIVERY_LOCKED');
  assert.equal(locked.body.error.details.cutoffAt, '2026-12-31T07:00:00.000Z');
  setClock('2027-01-01T09:00:00Z');
  expectError(await checkout([line()], { customer: customer({ email: 'test-f-cutoff2@example.test' }) }, { ip: '203.0.113.142' }), 409, 'DELIVERY_LOCKED');
  assert.equal(count('orders'), 1);
  expectError(await call('/api/cart', { body: { items: [line()], deliveryDate: '2027-01-01' } }), 409, 'DELIVERY_LOCKED');
  setClock('2026-12-31T07:00:00.000Z');
  expectStatus(await checkout([line()], { deliveryDate: '2027-01-05' }, { ip: '203.0.113.143' }), 201);
});

// ---------- F-B15 quantities -------------------------------------------------
test('F-B15 quantity edge cases: 0, negative, decimal, huge, non-numeric and null never create an order; 1 and 100 are accepted', async () => {
  const bad = [0, -1, -100, 0.5, 1.0000001, 101, 1e9, 1e21, Number.MAX_SAFE_INTEGER, '2', '', null, true, [], {}];
  for (const [index, quantity] of bad.entries()) {
    const result = await checkout([{ productId: 'prod_kravlje_1l', quantity, purchaseType: 'one_time' }], {}, { ip: `203.0.113.${150 + index}` });
    assert.equal(result.status, 422, `quantity=${JSON.stringify(quantity)} -> ${result.status} ${JSON.stringify(result.body)}`);
    assert.equal(result.code, 'VALIDATION_ERROR');
  }
  const missing = await checkout([{ productId: 'prod_kravlje_1l', purchaseType: 'one_time' }], {}, { ip: '203.0.113.170' });
  assert.equal(missing.status, 422);
  assert.equal(count('orders'), 0);
  expectStatus(await checkout([line('prod_kravlje_1l', 1, 'one_time')], {}, { ip: '203.0.113.171' }), 201);
  expectStatus(await checkout([line('prod_kravlje_1l', 100, 'one_time')], { customer: customer({ email: 'test-f-sto@example.test' }) }, { ip: '203.0.113.172' }), 201);
  assert.equal(sql("SELECT total_minor t FROM orders WHERE customer_id=(SELECT id FROM customers WHERE email='test-f-sto@example.test')").t, 100 * 25000 + 35000);
});

test('F-B16 amount overflow is refused (AMOUNT_OVERFLOW) instead of corrupting totals', async () => {
  database.raw.exec("UPDATE products SET price_minor=9000000000000000, subscription_price_minor=9000000000000000 WHERE id='prod_kravlje_1l'");
  expectError(await checkout([line('prod_kravlje_1l', 100, 'one_time')], {}), 422, 'AMOUNT_OVERFLOW');
  expectError(await checkout([line('prod_kravlje_1l', 100, 'subscription', 'weekly')], { paymentMethod: 'cash', paymentToken: undefined }, { ip: '203.0.113.180' }), 422, 'AMOUNT_OVERFLOW');
  assert.equal(count('orders'), 0);
});

test('F-B17 item list shape: unknown product, inactive product, bad purchase type/cadence, empty and oversize carts', async () => {
  const cases = [
    [[{ productId: 'prod_does_not_exist', quantity: 1, purchaseType: 'one_time' }], 409, 'PRODUCT_UNAVAILABLE'],
    [[{ productId: 'prod_jogurt_1l', quantity: 1, purchaseType: 'one_time' }], 200, null],
    [[{ productId: 'prod_kravlje_1l', quantity: 1, purchaseType: 'gift' }], 422, 'VALIDATION_ERROR'],
    [[{ productId: 'prod_kravlje_1l', quantity: 1, purchaseType: 'subscription', cadence: 'monthly' }], 422, 'VALIDATION_ERROR'],
    [[{ productId: 'prod_kravlje_1l', quantity: 1, purchaseType: 'subscription' }], 422, 'VALIDATION_ERROR'],
    [[], 422, 'VALIDATION_ERROR'],
    [Array.from({ length: 51 }, () => line()), 422, 'VALIDATION_ERROR'],
    [[null], 422, 'VALIDATION_ERROR'],
    [{ productId: 'prod_kravlje_1l' }, 422, 'VALIDATION_ERROR'],
  ];
  database.raw.exec("UPDATE products SET is_active=0 WHERE id='prod_jogurt_1l'");
  for (const [index, [items, status, code]] of cases.entries()) {
    const result = await call('/api/checkout', { body: checkoutBody(items, { paymentMethod: 'cash', paymentToken: undefined }), ip: `203.0.113.${190 + index}` });
    if (status === 200) { assert.equal(result.status, 409, 'inactive product'); assert.equal(result.code, 'PRODUCT_UNAVAILABLE'); continue; }
    expectError(result, status, code);
  }
  assert.equal(count('orders'), 0);
});

test('F-B18 the demo customer email can never place an order (any case or spacing)', async () => {
  for (const [index, email] of ['demo@example.invalid', 'DEMO@EXAMPLE.INVALID', '  Demo@Example.Invalid  '].entries()) {
    expectError(await checkout([line()], { customer: customer({ email }) }, { ip: `203.0.113.${200 + index}` }), 403, 'DEMO_READ_ONLY');
  }
  assert.equal(count('orders'), 0);
  assert.equal(count('customers', "email='demo@example.invalid'"), 0);
});

test('F-B19 checkout is rate limited per client address: the 21st request in the window gets 429', async () => {
  for (let index = 0; index < 20; index += 1) {
    const result = await call('/api/checkout', { body: { items: [] }, ip: '203.0.113.250' });
    assert.equal(result.status, 422);
  }
  expectError(await call('/api/checkout', { body: checkoutBody() , ip: '203.0.113.250' }), 429, 'RATE_LIMITED');
  expectStatus(await call('/api/checkout', { body: checkoutBody(), ip: '203.0.113.251' }), 201);
  assert.equal(count('orders'), 1);
});

// ---------- F-B20 promo codes ------------------------------------------------
test('F-B20 promo usage limit: the last use is consumed once; a failed checkout does not burn a use', async () => {
  addPromo({ usage_limit: 1 });
  expectError(await checkout([line()], { promoCode: 'TESTF10', customer: customer({ postalCode: '99999' }) }, { ip: '203.0.113.60' }), 422, 'DELIVERY_AREA_UNAVAILABLE');
  assert.equal(sql("SELECT times_used n FROM promo_codes WHERE code='TESTF10'").n, 0, 'rejected checkout must not consume the promo');
  const first = expectStatus(await checkout([line()], { promoCode: 'TESTF10' }, { ip: '203.0.113.61' }), 201);
  assert.equal(first.order.discountMinor, 5000);
  assert.equal(sql("SELECT times_used n FROM promo_codes WHERE code='TESTF10'").n, 1);
  assert.equal(count('order_promotions'), 1);
  expectError(await checkout([line()], { promoCode: 'TESTF10', customer: customer({ email: 'test-f-druga@example.test' }) }, { ip: '203.0.113.62' }), 422, 'PROMO_INVALID');
  assert.equal(count('orders'), 1);
  assert.equal(sql("SELECT times_used n FROM promo_codes WHERE code='TESTF10'").n, 1);
  // Replaying the original request must not consume another use or fail.
  expectStatus(await call('/api/checkout', { body: checkoutBody([line()], { promoCode: 'TESTF10' }), key: sql('SELECT idempotency_key k FROM orders').k, ip: '203.0.113.63' }), 201);
  assert.equal(sql("SELECT times_used n FROM promo_codes WHERE code='TESTF10'").n, 1);
});

test('F-B21 promo validity window is inclusive at ends_at and starts_at, exclusive one millisecond beyond', async () => {
  const now = '2026-12-30T10:00:00.000Z';
  addPromo({ id: 'p_end_ok', code: 'ENDOK', ends_at: now });
  addPromo({ id: 'p_end_bad', code: 'ENDBAD', ends_at: '2026-12-30T09:59:59.999Z' });
  addPromo({ id: 'p_start_ok', code: 'STARTOK', starts_at: now });
  addPromo({ id: 'p_start_bad', code: 'STARTBAD', starts_at: '2026-12-30T10:00:00.001Z' });
  addPromo({ id: 'p_off', code: 'OFF', is_active: 0 });
  const attempt = async (code, index) => checkout([line()], { promoCode: code, customer: customer({ email: `test-f-promo${index}@example.test` }) }, { ip: `203.0.113.${70 + index}` });
  expectStatus(await attempt('ENDOK', 1), 201);
  expectStatus(await attempt('startok', 2), 201);
  for (const [index, code] of ['ENDBAD', 'STARTBAD', 'OFF', 'NEMA-TAKVOG', '<script>', 'A'.repeat(41), 'TESTF10,A,B,C,D,E'].entries()) {
    expectError(await attempt(code, 3 + index), 422, code === '<script>' || code === 'A'.repeat(41) || code.includes(',') ? 'PROMO_INVALID' : 'PROMO_INVALID');
  }
  assert.equal(count('orders'), 2);
});

test('F-B22 per-customer promo limit is enforced for a returning customer (case-insensitive email)', async () => {
  addPromo({ per_customer_limit: 1 });
  expectStatus(await checkout([line()], { promoCode: 'TESTF10' }, { ip: '203.0.113.80' }), 201);
  expectError(await checkout([line()], { promoCode: 'TESTF10', customer: customer({ email: TEST_CUSTOMER.email.toUpperCase() }) }, { ip: '203.0.113.81' }), 422, 'PROMO_CUSTOMER_LIMIT');
  expectStatus(await checkout([line()], { customer: customer({ email: TEST_CUSTOMER.email.toUpperCase() }) }, { ip: '203.0.113.82' }), 201);
  assert.equal(count('order_promotions'), 1);
});

// ---------- F-B23 admin payment confirmation ---------------------------------
test('F-B23 admin marks an order paid: exactly one fiscal.receipt.requested and email.receipt.requested; repeating changes nothing', async () => {
  const { order } = expectStatus(await checkout([line('prod_kravlje_1l', 2, 'one_time')], { paymentMethod: 'cash' }), 201);
  assert.equal(topics('fiscal.receipt.requested'), 0);
  assert.equal(topics('email.receipt.requested'), 0);
  const updatedAt = sql('SELECT updated_at u FROM orders WHERE id=?', order.id).u;
  const paid = expectStatus(await patchOrder({ id: order.id, paymentStatus: 'paid', expectedUpdatedAt: updatedAt }));
  assert.equal(paid.order.payment_status, 'paid');
  assert.notEqual(paid.order.updated_at, updatedAt);
  assert.equal(topics('fiscal.receipt.requested'), 1);
  assert.equal(topics('email.receipt.requested'), 1);
  assert.equal(topics('email.order_updated.requested'), 1);
  assert.equal(count('audit_log', "action='order.updated' AND entity_id=?", order.id), 1);
  assert.equal(count('fiscal_receipts', "order_id=? AND status='issued' AND kind='advance'", order.id), 1);
  assert.equal(sql('SELECT invoice_number i FROM fiscal_receipts').i, `MOCK-receipt:${order.id}:advance`);
  const again = expectStatus(await patchOrder({ id: order.id, paymentStatus: 'paid' }));
  assert.equal(again.order.payment_status, 'paid');
  assert.equal(topics('fiscal.receipt.requested'), 1, 'paid -> paid must not enqueue another fiscal job');
  assert.equal(topics('email.receipt.requested'), 1);
  assert.equal(count('fiscal_receipts'), 1);
  assert.equal(count('fiscal_dispatches'), 1);
});

test('F-B24 expectedUpdatedAt guards the order: stale -> 409 ORDER_VERSION_CONFLICT with no side effects; reused value is stale afterwards', async () => {
  const { order } = expectStatus(await checkout([line()], { paymentMethod: 'cash' }), 201);
  const before = sql('SELECT * FROM orders WHERE id=?', order.id);
  for (const stale of ['2020-01-01T00:00:00.000Z', '', 123, 'nonsense']) {
    expectError(await patchOrder({ id: order.id, paymentStatus: 'paid', expectedUpdatedAt: stale }), 409, 'ORDER_VERSION_CONFLICT');
  }
  assert.equal(sql('SELECT payment_status p FROM orders WHERE id=?', order.id).p, 'pending');
  assert.equal(sql('SELECT updated_at u FROM orders WHERE id=?', order.id).u, before.updated_at);
  assert.equal(topics('fiscal.receipt.requested'), 0);
  assert.equal(count('fiscal_receipts'), 0);
  expectStatus(await patchOrder({ id: order.id, customerNote: 'TEST-F prva izmena', expectedUpdatedAt: before.updated_at }));
  expectError(await patchOrder({ id: order.id, customerNote: 'TEST-F druga izmena', expectedUpdatedAt: before.updated_at }), 409, 'ORDER_VERSION_CONFLICT');
  assert.equal(sql('SELECT customer_note n FROM orders WHERE id=?', order.id).n, 'TEST-F prva izmena');
});

test('F-B25 admin PATCH validation: unknown id 404, bad enum 422, paid orders cannot be reverted under Fiscomm, delivery needs the Dostave flow', async () => {
  expectError(await patchOrder({ id: 'ord_ne_postoji', paymentStatus: 'paid' }), 404, 'ORDER_NOT_FOUND');
  const { order } = expectStatus(await checkout([line()], { paymentMethod: 'cash' }), 201);
  expectError(await patchOrder({ id: order.id, paymentStatus: 'bitcoin' }), 422, 'VALIDATION_ERROR');
  expectError(await patchOrder({ id: order.id, fulfillmentStatus: 'delivered' }), 409, 'DELIVERY_CONFIRMATION_REQUIRED');
  expectStatus(await patchOrder({ id: order.id, paymentStatus: 'paid' }));
  for (const paymentStatus of ['pending', 'failed', 'refunded']) expectError(await patchOrder({ id: order.id, paymentStatus }), 409, 'FISCAL_PAYMENT_IMMUTABLE');
  assert.equal(sql('SELECT payment_status p FROM orders').p, 'paid');
  expectError(await call('/api/admin/orders', { method: 'PATCH', body: { id: order.id, paymentStatus: 'paid' } }), 403, 'ADMIN_FORBIDDEN');
});

// ---------- F-B26 payment webhook (local simulator) --------------------------
const webhook = (body, secret = env.PAYMENT_WEBHOOK_SECRET, extra = {}) => call('/api/webhooks/payments', { body, headers: secret === null ? {} : { 'x-webhook-secret': secret }, ...extra });

test('F-B26 webhook is only a local simulator: 503 unless PAYMENT_MODE=mock (and APP_ENV local/test), checked after the secret', async () => {
  const { order } = expectStatus(await checkout([line()], { paymentMethod: 'cash' }), 201);
  const event = { eventId: 'test-f-evt-1', orderId: order.id, status: 'paid' };
  for (const [label, overrides] of [['disabled', { PAYMENT_MODE: 'disabled' }], ['unset', { PAYMENT_MODE: undefined }], ['production env', { APP_ENV: 'production' }]]) {
    Object.assign(env, { PAYMENT_MODE: 'mock', APP_ENV: 'local' }, overrides);
    for (const key of Object.keys(overrides)) if (overrides[key] === undefined) delete env[key];
    expectError(await webhook(event, 'wrong-secret'), 401, 'INVALID_WEBHOOK_SIGNATURE');
    expectError(await webhook(event), 503, 'PAYMENT_ADAPTER_NOT_CONNECTED');
    assert.equal(sql('SELECT payment_status p FROM orders').p, 'pending', label);
    assert.equal(count('webhook_events'), 0, label);
  }
  Object.assign(env, { PAYMENT_MODE: 'mock', APP_ENV: 'local' });
  delete env.PAYMENT_WEBHOOK_SECRET;
  expectError(await webhook(event, 'anything'), 503, 'WEBHOOK_NOT_CONFIGURED');
  assert.equal(topics('fiscal.receipt.requested'), 0);
});

test('F-B27 webhook (mock mode): bad/missing secret 401, valid event pays once, replayed eventId is duplicate:true with no second fiscal job', async () => {
  const { order } = expectStatus(await checkout([line('prod_kravlje_1l', 2, 'one_time')], { paymentMethod: 'cash' }), 201);
  const event = { eventId: 'test-f-evt-2', orderId: order.id, status: 'paid' };
  expectError(await webhook(event, 'wrong'), 401, 'INVALID_WEBHOOK_SIGNATURE');
  expectError(await webhook(event, null), 401, 'INVALID_WEBHOOK_SIGNATURE');
  expectError(await webhook(event, env.PAYMENT_WEBHOOK_SECRET + 'x'), 401, 'INVALID_WEBHOOK_SIGNATURE');
  assert.equal(count('webhook_events'), 0);
  assert.equal(sql('SELECT payment_status p FROM orders').p, 'pending');
  const first = expectStatus(await webhook(event));
  assert.deepEqual(first, { received: true, duplicate: false });
  assert.equal(sql('SELECT payment_status p FROM orders').p, 'paid');
  assert.equal(topics('fiscal.receipt.requested'), 1);
  assert.equal(topics('email.receipt.requested'), 1);
  assert.equal(count('fiscal_receipts', "status='issued'"), 1);
  const replay = expectStatus(await webhook(event));
  assert.deepEqual(replay, { received: true, duplicate: true });
  const otherOrderSameEvent = expectStatus(await webhook({ ...event, orderId: 'ord_nepostojeci' }));
  assert.equal(otherOrderSameEvent.duplicate, true, 'event ids are unique per provider, not per order');
  assert.equal(count('webhook_events'), 1);
  assert.equal(topics('fiscal.receipt.requested'), 1);
  assert.equal(count('fiscal_receipts'), 1);
  assert.equal(count('audit_log', "action='payment.status_changed'"), 1);
});

test('F-B28 webhook input validation: missing/odd fields, unknown order, non-JSON and oversized bodies', async () => {
  const { order } = expectStatus(await checkout([line()], { paymentMethod: 'cash' }), 201);
  expectError(await webhook({ orderId: order.id, status: 'paid' }), 422, 'VALIDATION_ERROR');
  expectError(await webhook({ eventId: 'test-f-evt-3', status: 'paid' }), 422, 'VALIDATION_ERROR');
  expectError(await webhook({ eventId: 'test-f-evt-3', orderId: order.id, status: 'captured' }), 422, 'VALIDATION_ERROR');
  expectError(await webhook({ eventId: 'test-f-evt-3', orderId: 'ord_nepostojeci', status: 'paid' }), 404, 'ORDER_NOT_FOUND');
  expectError(await webhook('{not json'), 400, 'INVALID_JSON');
  expectError(await webhook('[]'), 400, 'INVALID_JSON');
  expectError(await webhook({ eventId: 'x'.repeat(201), orderId: order.id, status: 'paid' }), 422, 'VALIDATION_ERROR');
  assert.equal(count('webhook_events'), 0);
  assert.equal(sql('SELECT payment_status p FROM orders').p, 'pending');
  const failed = expectStatus(await webhook({ eventId: 'test-f-evt-4', orderId: order.id, status: 'failed' }));
  assert.equal(failed.duplicate, false);
  assert.equal(sql('SELECT payment_status p FROM orders').p, 'failed');
  assert.equal(topics('fiscal.receipt.requested'), 0, 'a failed payment never fiscalizes');
});

test('F-B29 webhook on a prepaid package: paid works, but a later failed/refunded event cannot rewrite a paid package', async () => {
  const { order } = expectStatus(await checkout([line('prod_kravlje_1l', 1, 'subscription', 'biweekly')], { paymentMethod: 'cash', paymentToken: undefined }), 201);
  expectStatus(await webhook({ eventId: 'test-f-evt-5', orderId: order.id, status: 'paid' }));
  assert.equal(sql('SELECT status s FROM subscription_packages').s, 'open');
  assert.equal(count('fiscal_receipts', "kind='advance' AND status='issued'"), 1);
  for (const [index, status] of ['failed', 'refunded'].entries()) expectError(await webhook({ eventId: `test-f-evt-6${index}`, orderId: order.id, status }), 409, 'PACKAGE_PAYMENT_IMMUTABLE');
  assert.equal(sql('SELECT payment_status p FROM orders').p, 'paid');
  assert.equal(count('webhook_events'), 1);
});
