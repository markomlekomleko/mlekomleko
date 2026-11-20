// TEST_PLAN section D: delivery zone (city + postal code), spelling variants, and subscribers changing address.
// Run: node --test tests/tp-d-zone.test.mjs
// Zone = Beograd + Novi Sad (exact postal codes, fail closed) + cities the owner adds in the admin.
// Endpoints: /api/checkout (rejects), /api/delivery-options (rejects), /api/storefront?postalCode= (reports available:false),
// /api/cart (informational quote: serviceable:false - it does NOT reject, by design), PATCH /api/account (rejects).
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import {
  account, adminDay, buy, call, count, cust, database, expectError, expectStatus, fresh, inst, oneTime, rows, sessionByEmail, setSetting, sql, teardown, topicCount, weekly,
} from './tp-abd-helpers.mjs';

const TUE = '2026-11-24', FRI = '2026-11-27';
beforeEach(() => fresh());
afterEach(() => teardown());

let ipCounter = 0;
const ip = () => `192.0.2.${(ipCounter++ % 250) + 1}`;
const where = (city, postalCode) => ({ city, postalCode });
const generate = (date) => call('/api/admin/deliveries', { admin: true, body: { action: 'generate', date } });
async function adminList(date) { expectStatus(await generate(date)); return expectStatus(await adminDay(date)); }
const nothingStored = () => {
  for (const table of ['orders', 'order_items', 'customers', 'subscriptions', 'outbox', 'idempotency_keys']) assert.equal(count(table), 0, table + ' must stay empty');
};
const options = (city, postalCode) => call(`/api/delivery-options?city=${encodeURIComponent(city)}&postalCode=${encodeURIComponent(postalCode)}`, { ip: ip() });
const storefront = (postalCode) => call(`/api/storefront?postalCode=${encodeURIComponent(postalCode)}`, { ip: ip() });
const quote = (city, postalCode, date = FRI) => call('/api/cart', { body: { items: oneTime(2), deliveryDate: date, city, postalCode }, ip: ip() });

// ---------------------------------------------------------------- D1 inside the zone
test('D1 an address in Beograd (Tue) and in Novi Sad (Fri) passes checkout, delivery-options, storefront and cart; city is stored canonically', async () => {
  const bg = expectStatus(await buy(oneTime(2), TUE, { email: 'bg@example.test', where: where('Beograd', '11000') }), 201);
  const ns = expectStatus(await buy(oneTime(2), FRI, { email: 'ns@example.test', where: where('Novi Sad', '21000') }), 201);
  assert.equal(bg.order.totalMinor, 105000);
  assert.equal(ns.order.totalMinor, 105000);
  assert.deepEqual(rows('SELECT email, city, postal_code FROM customers ORDER BY email').map((r) => [r.email, r.city, r.postal_code]), [['bg@example.test', 'Beograd', '11000'], ['ns@example.test', 'Novi Sad', '21000']]);
  const bgOptions = expectStatus(await options('Beograd', '11000'));
  assert.deepEqual([bgOptions.city, bgOptions.weekdays], ['Beograd', [2, 5]]);
  assert.equal(bgOptions.dates[0], TUE);
  const nsOptions = expectStatus(await options('Novi Sad', '21000'));
  assert.deepEqual([nsOptions.city, nsOptions.weekdays], ['Novi Sad', [5]]);
  assert.equal(nsOptions.dates[0], FRI);
  assert.ok(nsOptions.dates.every((d) => new Date(d + 'T12:00:00Z').getUTCDay() === 5));
  assert.deepEqual(expectStatus(await storefront('11000')).serviceability, { postalCode: '11000', available: true });
  assert.deepEqual(expectStatus(await storefront('21000')).serviceability, { postalCode: '21000', available: true });
  assert.equal(expectStatus(await quote('Beograd', '11000')).serviceable, true);
  assert.equal(expectStatus(await quote('Novi Sad', '21000')).serviceable, true);
  // the admin driver lists carry the right city
  assert.equal((await adminList(TUE)).orders[0].customer_snapshot.city, 'Beograd');
  assert.equal((await adminList(FRI)).orders[0].customer_snapshot.city, 'Novi Sad');
});

test('D2 other real postal codes inside the zone pass: Novi Beograd 11070, Zemun 11080, Palilula 11060, Petrovaradin 21131, Sremska Kamenica 21208', async () => {
  const cases = [['Beograd', '11070'], ['Beograd', '11080'], ['Beograd', '11060'], ['Novi Sad', '21131'], ['Novi Sad', '21208']];
  for (const [city, postalCode] of cases) {
    const date = city === 'Novi Sad' ? FRI : TUE;
    expectStatus(await buy(oneTime(2), date, { email: `z${postalCode}@example.test`, where: where(city, postalCode), ip: ip() }), 201);
    expectStatus(await options(city, postalCode));
  }
  assert.equal(count('orders'), cases.length);
});

// ---------------------------------------------------------------- D3 outside the zone
const OUTSIDE = [
  ['Niš', '18000'], ['Inđija', '22320'], ['Pančevo', '26000'], ['Subotica', '24000'], ['Kragujevac', '34000'], ['Novi Pazar', '36300'],
  ['Beograd', '99999'], ['Beograd', '00000'], ['Novi Sad', '21999'], ['Beograd', '11999'], ['Novi Sad', '21400'],
];
test('D3 outside the zone (Niš 18000, Inđija 22320, unknown 5-digit codes, other cities): checkout 422 DELIVERY_AREA_UNAVAILABLE for one-time AND subscription, nothing stored', async () => {
  for (const [city, postalCode] of OUTSIDE) {
    const oneTimeResult = await buy(oneTime(2), FRI, { where: where(city, postalCode), ip: ip() });
    assert.equal(oneTimeResult.status, 422, `${city} ${postalCode} one-time -> ${oneTimeResult.status} ${JSON.stringify(oneTimeResult.body)}`);
    assert.equal(oneTimeResult.code, 'DELIVERY_AREA_UNAVAILABLE', `${city} ${postalCode}`);
    const subscriptionResult = await buy(weekly(2), FRI, { where: where(city, postalCode), ip: ip() });
    assert.equal(subscriptionResult.code, 'DELIVERY_AREA_UNAVAILABLE', `${city} ${postalCode} subscription`);
    assert.equal(subscriptionResult.status, 422);
  }
  nothingStored();
});

test('D4 malformed postal codes are rejected on checkout (4 digits, 6 digits, letters, spaces inside, symbols, empty, wildcard, SQL-ish)', async () => {
  for (const postalCode of ['1100', '110000', 'ABCDE', '11 000', '11-000', '11000x', 'x11000', '*', '11*', '%', "11000' OR '1'='1", '0', '1e4', '۱۱۰۰۰', '11000\n11000']) {
    const result = await buy(oneTime(2), FRI, { where: where('Beograd', postalCode), ip: ip() });
    assert.equal(result.status, 422, `postal ${JSON.stringify(postalCode)} -> ${result.status} ${JSON.stringify(result.body).slice(0, 160)}`);
    assert.ok(['DELIVERY_AREA_UNAVAILABLE', 'VALIDATION_ERROR'].includes(result.code), `postal ${JSON.stringify(postalCode)} -> ${result.code}`);
  }
  for (const postalCode of ['', '   ', null, 11000, undefined]) {
    const result = await buy(oneTime(2), FRI, { customer: { ...cust('m@example.test'), postalCode }, ip: ip() });
    assert.equal(result.status, 422, `postal ${JSON.stringify(postalCode)}`);
  }
  for (const city of ['', '   ', null, 7, 'Atlantis', 'Beograd-Niš', 'Bograd']) {
    const result = await buy(oneTime(2), FRI, { customer: { ...cust('m@example.test'), city }, ip: ip() });
    assert.equal(result.status, 422, `city ${JSON.stringify(city)} -> ${result.status}`);
  }
  nothingStored();
});

test('D5 delivery-options rejects outside / unknown / malformed / missing parameters (422), never offers dates', async () => {
  for (const [city, postalCode] of [...OUTSIDE, ['Beograd', '1100'], ['Beograd', 'ABCDE'], ['Beograd', "11000' OR 1=1"], ['Atlantis', '11000']]) {
    const result = await options(city, postalCode);
    assert.equal(result.status, 422, `${city} ${postalCode}`);
    assert.equal(result.code, 'DELIVERY_AREA_UNAVAILABLE', `${city} ${postalCode}`);
    assert.equal(result.body.dates, undefined);
  }
  assert.equal((await call('/api/delivery-options?city=Beograd')).status, 422);
  assert.equal((await call('/api/delivery-options?postalCode=11000')).status, 422);
  assert.equal((await call('/api/delivery-options')).status, 422);
});

test('D6 storefront postal-code check: outside / unknown / malformed codes report available:false; no code -> no serviceability', async () => {
  for (const code of ['18000', '22320', '26000', '99999', '00000', '1100', '110000', 'abc', '*', '1', '11000x']) {
    const result = expectStatus(await storefront(code));
    assert.equal(result.serviceability.available, false, code);
  }
  assert.equal(expectStatus(await call('/api/storefront')).serviceability, undefined);
  // Even with an unserviceable code the storefront still returns a delivery window for the default route city (no crash)
  assert.ok(expectStatus(await storefront('18000')).delivery.deliveryDate);
});

test('D7 /api/cart is informational: outside addresses get serviceable:false (HTTP 200), inside get true; checkout is the gate [PITANJE: plan said cart "rejects"]', async () => {
  for (const [city, postalCode] of OUTSIDE) {
    const result = expectStatus(await quote(city, postalCode));
    assert.equal(result.serviceable, false, `${city} ${postalCode}`);
    assert.equal(result.totalMinor, 105000, 'still priced (informational)');
  }
  assert.equal(expectStatus(await quote('Beograd', '21000')).serviceable, false, 'postal code does not belong to the city');
  assert.equal(expectStatus(await quote('Beograd', '11000')).serviceable, true);
  assert.equal(expectStatus(await call('/api/cart', { body: { items: oneTime(2), deliveryDate: FRI } })).serviceable, undefined, 'no address: unknown');
  // The same outside addresses are refused where it counts:
  expectError(await buy(oneTime(2), FRI, { where: where('Niš', '18000') }), 422, 'DELIVERY_AREA_UNAVAILABLE');
});

// ---------------------------------------------------------------- D8 spelling variants
const BG_SPELLINGS = ['Beograd', 'beograd', 'BEOGRAD', 'Београд', 'БЕОГРАД', 'београд', '  Beograd  ', 'Belgrade', 'Novi Beograd', 'Нови Београд', 'Zemun', 'ZEMUN', 'Земун', 'Belgrad'];
const NS_SPELLINGS = ['Novi Sad', 'novi sad', 'NOVI SAD', 'Нови Сад', 'НОВИ САД', 'Novi  Sad', 'Novi-Sad', ' Novi Sad ', 'Petrovaradin', 'PETROVARADIN', 'Петроварадин', 'Sremska Kamenica', 'Сремска Каменица'];

test('D8 every Beograd spelling (Latin, Cyrillic, case, spaces, English, Zemun/Novi Beograd aliases) passes checkout and is stored as "Beograd"', async () => {
  for (const [index, city] of BG_SPELLINGS.entries()) {
    const email = `bg${index}@example.test`;
    const result = await buy(oneTime(2), TUE, { email, where: where(city, '11000'), ip: ip() });
    assert.equal(result.status, 201, `${JSON.stringify(city)} -> ${result.status} ${JSON.stringify(result.body).slice(0, 200)}`);
    assert.equal(sql('SELECT city FROM customers WHERE email=?', email).city, 'Beograd', city);
    assert.equal(JSON.parse(sql('SELECT shipping_json s FROM orders WHERE id=?', result.body.order.id).s).city, 'Beograd');
    assert.equal(expectStatus(await options(city, '11000')).city, 'Beograd', 'delivery-options: ' + city);
    assert.equal(expectStatus(await quote(city, '11000', TUE)).serviceable, true, 'cart: ' + city);
  }
});

test('D9 every Novi Sad spelling (Latin, Cyrillic, case, double space, hyphen, Petrovaradin / Sremska Kamenica aliases) passes on Friday and is stored as "Novi Sad"', async () => {
  for (const [index, city] of NS_SPELLINGS.entries()) {
    const email = `ns${index}@example.test`;
    const result = await buy(oneTime(2), FRI, { email, where: where(city, '21000'), ip: ip() });
    assert.equal(result.status, 201, `${JSON.stringify(city)} -> ${result.status} ${JSON.stringify(result.body).slice(0, 200)}`);
    assert.equal(sql('SELECT city FROM customers WHERE email=?', email).city, 'Novi Sad', city);
    const opts = expectStatus(await options(city, '21000'));
    assert.deepEqual([opts.city, opts.weekdays], ['Novi Sad', [5]], city);
  }
});

test('D10 without diacritics: Inđija / Niš / Šabac written without them are still outside; "Beograd"/"Novi Sad" need none', async () => {
  for (const city of ['Indjija', 'Indija', 'Inđija', 'INĐIJA', 'Инђија', 'Nis', 'Niš', 'Ниш', 'Sabac', 'Šabac']) {
    expectError(await buy(oneTime(2), FRI, { where: where(city, '11000'), ip: ip() }), 422, 'DELIVERY_AREA_UNAVAILABLE');
    expectError(await options(city, '22320'), 422, 'DELIVERY_AREA_UNAVAILABLE');
  }
  nothingStored();
});

test('D11 a spelling variant follows the canonical route days: "Petrovaradin" / "Нови Сад" on a TUESDAY is refused (Novi Sad has Friday only), "Zemun" on Tuesday is fine', async () => {
  expectError(await buy(oneTime(2), TUE, { where: where('Petrovaradin', '21131'), ip: ip() }), 422, 'INVALID_DELIVERY_DATE');
  expectError(await buy(weekly(2), TUE, { where: where('Нови Сад', '21000'), ip: ip() }), 422, 'INVALID_DELIVERY_DATE');
  expectStatus(await buy(oneTime(2), TUE, { where: where('Zemun', '11080'), email: 'zem@example.test', ip: ip() }), 201);
  assert.equal(count('orders'), 1);
});

test('D12 postal code not matching the city is refused everywhere: Beograd+21000, Novi Sad+11000, Zemun+21000, Petrovaradin+11000, Beograd+18000', async () => {
  for (const [city, postalCode] of [['Beograd', '21000'], ['Novi Sad', '11000'], ['Zemun', '21000'], ['Petrovaradin', '11000'], ['Београд', '21131'], ['Нови Сад', '11080'], ['Beograd', '18000']]) {
    expectError(await buy(oneTime(2), FRI, { where: where(city, postalCode), ip: ip() }), 422, 'DELIVERY_AREA_UNAVAILABLE');
    expectError(await buy(weekly(2), FRI, { where: where(city, postalCode), ip: ip() }), 422, 'DELIVERY_AREA_UNAVAILABLE');
    expectError(await options(city, postalCode), 422, 'DELIVERY_AREA_UNAVAILABLE');
    assert.equal(expectStatus(await quote(city, postalCode)).serviceable, false, `${city} ${postalCode}`);
  }
  nothingStored();
});

test('D13 postal code with surrounding spaces is trimmed and accepted (" 11000 ")', async () => {
  expectStatus(await buy(oneTime(2), TUE, { where: where('Beograd', ' 11000 '), email: 'trim@example.test' }), 201);
  assert.equal(sql('SELECT postal_code p FROM customers').p, '11000');
  expectStatus(await options('Beograd', ' 11000 '));
});

test('D14 a city the owner adds in the admin (Pančevo 26000, Tuesday only) passes on Tuesday, is refused on Friday, and Inđija stays outside', async () => {
  setSetting('serviceRegions', [{ city: 'Pančevo', postalCodes: ['26000'], weekdays: [2] }]);
  expectStatus(await buy(oneTime(2), TUE, { where: where('Pančevo', '26000'), email: 'pa@example.test' }), 201);
  expectStatus(await buy(oneTime(2), TUE, { where: where('ПАНЧЕВО', '26000'), email: 'pa2@example.test', ip: ip() }), 201);
  expectStatus(await buy(oneTime(2), TUE, { where: where('pancevo', '26000'), email: 'pa3@example.test', ip: ip() }), 201);
  expectError(await buy(oneTime(2), FRI, { where: where('Pančevo', '26000'), ip: ip() }), 422, 'INVALID_DELIVERY_DATE');
  expectError(await buy(oneTime(2), TUE, { where: where('Pančevo', '26001'), ip: ip() }), 422, 'DELIVERY_AREA_UNAVAILABLE');
  expectError(await buy(oneTime(2), TUE, { where: where('Inđija', '22320'), ip: ip() }), 422, 'DELIVERY_AREA_UNAVAILABLE');
  assert.equal(sql("SELECT city c FROM customers WHERE email='pa2@example.test'").c, 'Pančevo');
  assert.deepEqual(expectStatus(await options('Pančevo', '26000')).weekdays, [2]);
  assert.equal(expectStatus(await storefront('26000')).serviceability.available, true);
});

// ---------------------------------------------------------------- D15+ subscriber changes address
async function subscriber(email, date, where_ = where('Beograd', '11000')) {
  const created = expectStatus(await buy(weekly(2), date, { email, where: where_, ip: ip() }), 201);
  return { ...created, cookie: sessionByEmail(email).cookie };
}
const patchProfile = (cookie, body) => call('/api/account', { method: 'PATCH', cookie, body, ip: ip() });
const snapshot = () => ({
  subscriptions: rows('SELECT * FROM subscriptions ORDER BY id').map((r) => ({ ...r })),
  customers: rows('SELECT * FROM customers ORDER BY id').map((r) => ({ ...r })),
  items: rows('SELECT * FROM subscription_items ORDER BY id').map((r) => ({ ...r })),
  packages: rows('SELECT * FROM package_lines ORDER BY id').map((r) => ({ ...r })),
  audit: count('audit_log'),
  outbox: count('outbox'),
});

test('D15 subscriber moves to an address OUTSIDE the zone (Niš 18000, Inđija 22320, unknown code, wrong pair): 422 DELIVERY_AREA_UNAVAILABLE and customer + subscription rows are byte-identical', async () => {
  const { cookie, subscription } = await subscriber('mover@example.test', FRI);
  const before = snapshot();
  for (const [city, postalCode] of [['Niš', '18000'], ['Inđija', '22320'], ['Beograd', '99999'], ['Beograd', '21000'], ['Atlantis', '11000'], ['Beograd', 'ABCDE']]) {
    for (const apply of [true, false]) {
      const result = await patchProfile(cookie, { city, postalCode, addressLine1: 'Nova 1', ...(apply ? { applyToSubscriptions: true } : {}) });
      assert.equal(result.status, 422, `${city} ${postalCode} apply=${apply} -> ${result.status} ${JSON.stringify(result.body)}`);
      assert.equal(result.code, 'DELIVERY_AREA_UNAVAILABLE');
    }
  }
  assert.deepEqual(snapshot(), before, 'rejected address changes must leave every row untouched');
  const view = expectStatus(await account(cookie));
  assert.equal(view.customer.city, 'Beograd');
  assert.equal(view.customer.addressLine1, 'TP ulica 1');
  assert.equal(view.subscriptions[0].version, 1);
  assert.equal(view.subscriptions[0].nextDeliveryDate, FRI);
  assert.equal((await adminList(FRI)).orders[0].customer_snapshot.city, 'Beograd');
  assert.equal(subscription.status, 'active');
});

test('D16 Beograd TUESDAY subscriber moving to Novi Sad (apply to subscription): 422 DELIVERY_DAY_UNAVAILABLE; customer row and subscription untouched, Tuesday delivery stays', async () => {
  const { cookie } = await subscriber('tue@example.test', TUE);
  const before = snapshot();
  const result = await patchProfile(cookie, { city: 'Novi Sad', postalCode: '21000', addressLine1: 'Bulevar 1', applyToSubscriptions: true });
  expectError(result, 422, 'DELIVERY_DAY_UNAVAILABLE');
  // an alias for the same city is refused the same way
  expectError(await patchProfile(cookie, { city: 'Petrovaradin', postalCode: '21131', applyToSubscriptions: true }), 422, 'DELIVERY_DAY_UNAVAILABLE');
  assert.deepEqual(snapshot(), before, 'rejected: no customer, subscription, audit or outbox change');
  const view = expectStatus(await account(cookie));
  assert.deepEqual([view.customer.city, view.subscriptions[0].nextDeliveryDate, view.subscriptions[0].version], ['Beograd', TUE, 1]);
  const day = await adminList(TUE);
  assert.equal(day.orders.length, 1);
  assert.equal(day.orders[0].customer_snapshot.city, 'Beograd');
});

test('D17 Beograd FRIDAY subscriber moving to Novi Sad (apply to subscription): allowed; version +1, same Friday, new city on the driver list, fee still 35000, total of a new one-time order unchanged', async () => {
  const { cookie, subscription, order } = await subscriber('fri@example.test', FRI);
  const feeBefore = order.deliveryFeeMinor;
  const result = await patchProfile(cookie, { city: 'Novi Sad', postalCode: '21000', addressLine1: 'Bulevar oslobođenja 1', applyToSubscriptions: true });
  expectStatus(result, 200);
  // DB
  const sub = sql('SELECT * FROM subscriptions WHERE id=?', subscription.id);
  assert.equal(sub.version, 2);
  assert.equal(sub.next_delivery_date, FRI);
  assert.equal(sub.status, 'active');
  const shipping = JSON.parse(sub.shipping_json);
  assert.deepEqual([shipping.city, shipping.postalCode, shipping.addressLine1], ['Novi Sad', '21000', 'Bulevar oslobođenja 1']);
  assert.deepEqual(rows('SELECT city, postal_code FROM customers').map((r) => [r.city, r.postal_code]), [['Novi Sad', '21000']]);
  assert.equal(sql('SELECT total_minor t FROM orders WHERE id=?', order.id).t, 340000, 'the paid/booked package total never changes');
  // account
  const view = expectStatus(await account(cookie));
  assert.deepEqual([view.customer.city, view.subscriptions[0].nextDeliveryDate, view.subscriptions[0].version], ['Novi Sad', FRI, 2]);
  assert.equal(view.subscriptions[0].afterSkipDate, '2026-12-04', 'next Friday is also a Novi Sad route day');
  // admin list: the stop is now in Novi Sad
  const day = await adminList(FRI);
  assert.equal(day.orders.length, 1);
  assert.equal(day.orders[0].customer_snapshot.city, 'Novi Sad');
  assert.equal(day.orders[0].customer_snapshot.addressLine1, 'Bulevar oslobođenja 1');
  // fee and dates for the new city
  assert.equal(feeBefore, 140000);
  const next = await buy(oneTime(2), FRI, { email: 'fri@example.test', where: where('Novi Sad', '21000'), ip: ip() });
  assert.equal(expectStatus(next, 201).order.deliveryFeeMinor, 35000);
  assert.equal(next.body.order.totalMinor, 105000);
  const opts = expectStatus(await options('Novi Sad', '21000'));
  assert.deepEqual(opts.weekdays, [5]);
  // outbox / audit: one profile.updated audit row, no duplicated customer events
  assert.equal(count('audit_log', "action='profile.updated'"), 1);
});

test('D18 address change AFTER the cutoff of the subscription\'s next delivery with apply-to-subscription: 409 DELIVERY_LOCKED, nothing changes', async () => {
  const { cookie } = await subscriber('late@example.test', FRI);
  inst('2026-11-25T18:01:00Z');
  const before = { customers: snapshot().customers, shipping: sql('SELECT shipping_json s FROM subscriptions').s };
  expectError(await patchProfile(cookie, { city: 'Novi Sad', postalCode: '21000', applyToSubscriptions: true }), 409, 'DELIVERY_LOCKED');
  // (the lazy cutoff lock may advance the subscription's date by itself; the ADDRESS must not move)
  assert.deepEqual({ customers: snapshot().customers, shipping: sql('SELECT shipping_json s FROM subscriptions').s }, before);
  assert.equal(count('audit_log', "action='profile.updated'"), 0);
});

test('D19 address change inside Beograd (aliases Zemun, Cyrillic) is stored canonically and applied to the subscription', async () => {
  const { cookie, subscription } = await subscriber('local@example.test', TUE);
  expectStatus(await patchProfile(cookie, { city: 'Земун', postalCode: '11080', addressLine1: 'Glavna 5', applyToSubscriptions: true }));
  const sub = sql('SELECT shipping_json s, version v FROM subscriptions WHERE id=?', subscription.id);
  assert.equal(JSON.parse(sub.s).city, 'Beograd');
  assert.equal(sub.v, 2);
  assert.equal(sql('SELECT city c, postal_code p FROM customers').c, 'Beograd');
  assert.equal((await adminList(TUE)).orders[0].customer_snapshot.postalCode, '11080');
});

test('D20 [PITANJE] a Beograd TUESDAY subscriber changes the profile city to Novi Sad WITHOUT "apply to subscriptions": accepted (200), customer row says Novi Sad, but the subscription keeps delivering to the old Beograd address on Tuesday', async () => {
  const { cookie } = await subscriber('noapply@example.test', TUE);
  expectStatus(await patchProfile(cookie, { city: 'Novi Sad', postalCode: '21000', addressLine1: 'Bulevar 1' }));
  const view = expectStatus(await account(cookie));
  assert.equal(view.customer.city, 'Novi Sad');
  assert.equal(JSON.parse(sql('SELECT shipping_json s FROM subscriptions').s).city, 'Beograd');
  const day = await adminList(TUE);
  assert.equal(day.orders[0].customer_snapshot.city, 'Beograd', 'the driver still goes to the Beograd address');
  assert.equal(sql('SELECT version v FROM subscriptions').v, 1);
  // Question: should a profile address change silently leave active subscriptions at the old address, or always ask / always apply?
});

test('D21 profile address change from a signed-out visitor / foreign origin is refused (no zone probe, no write)', async () => {
  const { subscription } = await subscriber('auth@example.test', FRI);
  const before = snapshot();
  const anonymous = await call('/api/account', { method: 'PATCH', body: { city: 'Novi Sad', postalCode: '21000' }, ip: ip() });
  assert.ok([401, 403].includes(anonymous.status), String(anonymous.status));
  const foreign = await call('/api/account', { method: 'PATCH', cookie: sessionByEmail('auth@example.test').cookie, origin: 'http://evil.example', body: { city: 'Novi Sad', postalCode: '21000' }, ip: ip() });
  assert.ok([401, 403].includes(foreign.status), String(foreign.status));
  assert.deepEqual(snapshot(), before);
  assert.ok(subscription.id);
  void topicCount; void database;
});
