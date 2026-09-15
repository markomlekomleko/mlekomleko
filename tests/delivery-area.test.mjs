import assert from 'node:assert/strict';
import { beforeEach, afterEach, test } from 'node:test';
import { register } from 'node:module';
import { randomUUID } from 'node:crypto';
import { createDatabase } from './sqlite-d1.mjs';

const RealDate = Date;
const env = { APP_ENV: 'local', PAYMENT_MODE: 'mock', APP_ORIGIN: 'http://localhost', ADMIN_LEGACY_ACCESS: 'true', ADMIN_SECRET: 'test-admin-secret' };
globalThis.__mlekoTestCloudflareEnv = env;
register(new URL('./cloudflare-loader.mjs', import.meta.url));
const worker = (await import('../dist/server/index.js')).default;
let database;
beforeEach(() => {
  const now = new RealDate('2026-12-30T10:00:00Z').getTime();
  globalThis.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } };
  database = createDatabase();
  env.DB = database;
  database.raw.exec('UPDATE products SET is_active=1, allow_subscription=1');
});
afterEach(() => { database.close(); globalThis.Date = RealDate; });
const items = [{ productId: 'prod_kravlje_1l', quantity: 2, purchaseType: 'one_time' }];
function payload(city, postalCode) {
  return { items, deliveryDate: '2027-01-01', paymentMethod: 'cash', customer: {
    email: 'delivery-test@example.test', fullName: 'Test Kupac', phone: '+381600000000', addressLine1: 'Test ulica 1', city, postalCode,
  } };
}
async function request(path, body, admin = false) {
  const response = await worker.fetch(new Request(`http://localhost${path}`, {
    method: admin ? 'PATCH' : 'POST', headers: { 'Content-Type': 'application/json', Origin: 'http://localhost', 'Idempotency-Key': randomUUID(), ...(admin ? { 'x-admin-secret': env.ADMIN_SECRET } : {}) }, body: JSON.stringify(body),
  }), env, { waitUntil() {}, passThroughOnException() {} });
  return { status: response.status, body: await response.json() };
}
function configure(codes) {
  database.raw.prepare("UPDATE settings SET value_json=? WHERE key='servicePostalCodes'").run(JSON.stringify(codes));
}
const count = (table) => database.raw.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;

for (const [city, code] of [['Beograd', '11000'], ['Novi Sad', '21000'], ['Novi Beograd', '11070'], ['Zemun', '11080'], ['Petrovaradin', '21132'], ['Београд', '11000'], ['  НОВИ   САД  ', '21101']]) {
  test(`checkout accepts a matching supported address: ${city} / ${code}`, async () => {
    const result = await request('/api/checkout', payload(city, code));
    assert.equal(result.status, 201, JSON.stringify(result.body));
    const expectedCity = ['11000', '11070', '11080'].includes(code) ? 'Beograd' : 'Novi Sad';
    assert.equal(database.raw.prepare('SELECT city FROM customers').get().city, expectedCity);
  });
}
for (const [city, code] of [['Niš', '18000'], ['Niš', '11000'], ['Smederevo', '11300'], ['Beograd', '11300'], ['Novi Sad', '21400'], ['Novi Sad', '21205'], ['Beograd', '21000'], ['Novi Sad', '11000'], ['Beograd', '11999'], ['Novi Sad', '2100'], ['Beograd', '11000x']]) {
  test(`quote and checkout reject an unsupported or mismatched address: ${city} / ${code}`, async () => {
    const quote = await request('/api/cart', { items, deliveryDate: '2027-01-01', city, postalCode: code });
    assert.equal(quote.status, 200);
    assert.equal(quote.body.serviceable, false);
    const result = await request('/api/checkout', payload(city, code));
    assert.equal(result.status, 422, JSON.stringify(result.body));
    assert.equal(result.body.error.code, 'DELIVERY_AREA_UNAVAILABLE');
    for (const table of ['orders', 'customers', 'subscriptions', 'idempotency_keys']) assert.equal(count(table), 0, `${table} must remain untouched`);
  });
}
for (const codes of [[], ['11', '21'], ['1*', '2*'], ['18000', '21400']]) {
  test(`settings cannot expand delivery beyond the two cities: ${JSON.stringify(codes)}`, async () => {
    configure(codes);
    for (const code of ['18000', '11300', '21400']) {
      const quote = await request('/api/cart', { items, deliveryDate: '2027-01-01', postalCode: code });
      assert.equal(quote.body.serviceable, false);
    }
    assert.equal((await request('/api/checkout', payload('Niš', '18000'))).status, 422);
    assert.equal(count('orders'), 0);
  });
}
test('an empty setting still accepts the supported cities; an explicit narrower setting remains respected', async () => {
  configure([]);
  assert.equal((await request('/api/checkout', payload('Novi Sad', '21000'))).status, 201);
  configure(['11000']);
  assert.equal((await request('/api/cart', { items, deliveryDate: '2027-01-01', city: 'Novi Sad', postalCode: '21000' })).body.serviceable, false);
  assert.equal((await request('/api/checkout', payload('Novi Sad', '21000'))).status, 422);
});
test('admin address edits cannot bypass the city and postcode match', async () => {
  const created = await request('/api/checkout', payload('Beograd', '11000'));
  assert.equal(created.status, 201);
  const result = await request('/api/admin/orders', { id: created.body.order.id, customer: { city: 'Niš', postalCode: '11000' } }, true);
  assert.equal(result.status, 422, JSON.stringify(result.body));
  assert.equal(database.raw.prepare('SELECT city FROM customers').get().city, 'Beograd');
});
