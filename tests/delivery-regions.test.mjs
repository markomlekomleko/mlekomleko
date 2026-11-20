import assert from 'node:assert/strict';
import { beforeEach, afterEach, test } from 'node:test';
import { register } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { createDatabase } from './sqlite-d1.mjs';

// Delivery cities (owner, 20 Nov 2026): Inđija is removed, and a new city is a pure admin step —
// settings.serviceRegions holds its name, postal codes and route weekdays — honoured by the zone
// check, delivery options, cart quote, checkout, the account address change, admin options and
// the top-bar countdown. Beograd (Tue+Fri) and Novi Sad (Fri) are unchanged.
// Now: Wednesday 30 Dec 2026. Fri 1 Jan 2027 and Tue 5 Jan 2027 are open route days.
const realDate = Date;
let database;
const env = { APP_ENV: 'local', PAYMENT_MODE: 'mock', BADI_MODE: 'mock', EMAIL_MODE: 'console', APP_ORIGIN: 'http://localhost', ADMIN_LEGACY_ACCESS: 'true', ADMIN_SECRET: 'test-admin-secret', PAYMENT_WEBHOOK_SECRET: 'test-webhook-secret', LOCAL_AUTH_EXPOSE_TOKEN: 'true' };
globalThis.__mlekoTestCloudflareEnv = env;
register(new URL('./cloudflare-loader.mjs', import.meta.url));
const worker = (await import('../dist/server/index.js')).default;
function at(iso) {
 const instant = new realDate(iso).getTime();
 globalThis.Date = class extends realDate { constructor(...args) { super(...(args.length ? args : [instant])); } static now() { return instant; } };
}
beforeEach(() => {
 at('2026-12-30T10:00:00Z');
 database = createDatabase(); env.DB = database;
 database.raw.exec("UPDATE products SET is_active=1, allow_subscription=1; UPDATE products SET price_minor=25000, subscription_price_minor=25000 WHERE id='prod_kravlje_1l';");
});
afterEach(() => { database.close(); globalThis.Date = realDate; });
async function api(path, data, { method = 'POST', admin = false, cookie, key = randomUUID() } = {}) {
 const headers = { 'content-type': 'application/json', Origin: 'http://localhost', 'Idempotency-Key': key };
 if (admin) headers['x-admin-secret'] = env.ADMIN_SECRET;
 if (cookie) headers.cookie = cookie;
 const res = await worker.fetch(new Request('http://localhost' + path, { method, headers, ...(method !== 'GET' ? { body: JSON.stringify(data) } : {}) }), env, { waitUntil() {}, passThroughOnException() {} });
 const text = await res.text();
 let body; try { body = JSON.parse(text); } catch { body = text; }
 return { status: res.status, body };
}
const get = (path, options = {}) => api(path, null, { ...options, method: 'GET' });
const scalar = (sql, ...args) => Object.values(database.raw.prepare(sql).get(...args) ?? { value: null })[0];
function expectStatus(r, status = 200) { assert.equal(r.status, status, JSON.stringify(r.body)); return r.body; }
function expectError(r, status, code) { assert.equal(r.status, status, JSON.stringify(r.body)); assert.equal(r.body.error.code, code); return r.body; }
const line = (purchaseType = 'one_time') => ({ productId: 'prod_kravlje_1l', quantity: 2, purchaseType, ...(purchaseType === 'subscription' ? { cadence: 'weekly' } : {}) });
const customer = (extra = {}) => ({ email: 'grad@example.test', fullName: 'Ana Grad', phone: '+381600000002', addressLine1: 'Test ulica 1', city: 'Beograd', postalCode: '11000', ...extra });
const checkout = (address, deliveryDate, items = [line()], email) => api('/api/checkout', { customer: customer({ ...address, ...(email ? { email } : {}) }), items, paymentMethod: 'cash', deliveryDate });
const quote = (address, deliveryDate) => api('/api/cart', { items: [line()], deliveryDate, ...address });
const options = (city, postalCode) => get('/api/delivery-options?' + new URLSearchParams({ city, postalCode }));
const settings = (value) => api('/api/admin/settings', value, { admin: true, method: 'PATCH' });
const PANCEVO = { city: 'Pančevo', postalCodes: ['26000', '26101'], weekdays: [5] };
const weekday = (date) => new Date(`${date}T12:00:00Z`).getUTCDay();
function session(email = 'grad@example.test') {
 const c = database.raw.prepare('SELECT id,email FROM customers WHERE email = ?').get(email);
 const token = randomUUID() + randomUUID();
 database.raw.prepare("INSERT INTO auth_tokens (id, customer_id,email,token_hash,kind,expires_at) VALUES (?,?,?,?,'session','2030-01-01T00:00:00Z')").run(randomUUID(), c.id, c.email, createHash('sha256').update(token).digest('base64url'));
 return 'mm_session=' + token;
}
const moveTo = (address, cookie) => api('/api/account', { addressLine1: 'Nova ulica 2', ...address, applyToSubscriptions: true }, { method: 'PATCH', cookie });

test('Inđija postal codes and names are no longer a delivery zone anywhere', async () => {
 for (const postalCode of ['22319', '22320']) {
  expectError(await checkout({ city: 'Inđija', postalCode }, '2027-01-01'), 422, 'DELIVERY_AREA_UNAVAILABLE');
  expectError(await options('Inđija', postalCode), 422, 'DELIVERY_AREA_UNAVAILABLE');
  assert.equal(expectStatus(await quote({ city: 'Inđija', postalCode }, '2027-01-01')).serviceable, false);
  assert.equal(expectStatus(await get('/api/storefront?postalCode=' + postalCode)).serviceability.available, false);
 }
 assert.equal(expectStatus(await quote({ city: 'Инђија' }, '2027-01-01')).serviceable, false);
 // The retired switch is not a setting any more, and leftover rows are neither read nor offered.
 expectError(await settings({ indjijaEnabled: true }), 422, 'VALIDATION_ERROR');
 database.raw.exec(`INSERT INTO settings (key,value_json,updated_at) VALUES ('indjijaEnabled','true','2026-11-01'),('indjijaDeliveryWeekdays','[2,5]','2026-11-01') ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json`);
 expectError(await checkout({ city: 'Inđija', postalCode: '22320' }, '2027-01-01'), 422, 'DELIVERY_AREA_UNAVAILABLE');
 const admin = expectStatus(await get('/api/admin/settings', { admin: true }));
 assert.ok(!JSON.stringify(admin).includes('indjija'), 'admin settings no longer carry the Inđija switch');
 const manual = expectStatus(await get('/api/admin/orders/quote', { admin: true }));
 assert.deepEqual(Object.keys(manual.deliveryWeekdaysByCity), ['Beograd', 'Novi Sad']);
 assert.ok(!JSON.stringify(expectStatus(await get('/api/storefront'))).includes('Inđij'));
});

test('Beograd and Novi Sad keep their route days', async () => {
 const belgrade = expectStatus(await options('beograd', '11000'));
 assert.equal(belgrade.city, 'Beograd'); assert.deepEqual(belgrade.weekdays, [2, 5]);
 assert.deepEqual(expectStatus(await options('Нови Сад', '21000')), { ...expectStatus(await options('Novi Sad', '21000')) });
 const noviSad = expectStatus(await options('Novi Sad', '21000'));
 assert.deepEqual(noviSad.weekdays, [5]); assert.ok(noviSad.dates.every((date) => weekday(date) === 5));
 expectError(await checkout({ city: 'Novi Sad', postalCode: '21000' }, '2027-01-05'), 422, 'INVALID_DELIVERY_DATE');
 expectError(await quote({ city: 'Novi Sad', postalCode: '21000' }, '2027-01-05'), 422, 'INVALID_DELIVERY_DATE');
 expectStatus(await checkout({ city: 'Beograd', postalCode: '11000' }, '2027-01-05'), 201);
 expectStatus(await checkout({ city: 'Нови Сад', postalCode: '21000' }, '2027-01-01', [line()], 'ns@example.test'), 201);
 assert.equal(scalar("SELECT city FROM customers WHERE email='ns@example.test'"), 'Novi Sad');
});

test('an admin-added city is accepted on its own weekday only, in either script', async () => {
 expectStatus(await settings({ serviceRegions: [PANCEVO] }));
 for (const typed of ['Pančevo', 'pancevo', 'ПАНЧЕВО', ' Панчево ']) {
  const result = expectStatus(await options(typed, '26000'));
  assert.equal(result.city, 'Pančevo'); assert.deepEqual(result.weekdays, [5]);
  assert.ok(result.dates.length && result.dates.every((date) => weekday(date) === 5));
 }
 expectError(await options('Pančevo', '11000'), 422, 'DELIVERY_AREA_UNAVAILABLE');
 expectError(await options('Beograd', '26000'), 422, 'DELIVERY_AREA_UNAVAILABLE');
 assert.equal(expectStatus(await get('/api/storefront?postalCode=26101')).serviceability.available, true);
 assert.equal(expectStatus(await get('/api/storefront?postalCode=26101')).delivery.deliveryDate, '2027-01-01');
 // Cart quote: Friday is fine, Tuesday is not a Pančevo route day.
 assert.equal(expectStatus(await quote({ city: 'pančevo', postalCode: '26000' }, '2027-01-01')).serviceable, true);
 assert.equal(expectStatus(await quote({ city: 'Pančevo' })).deliveryDate, '2027-01-01');
 expectError(await quote({ city: 'Pančevo', postalCode: '26000' }, '2027-01-05'), 422, 'INVALID_DELIVERY_DATE');
 expectError(await quote({ postalCode: '26000' }, '2027-01-05'), 422, 'INVALID_DELIVERY_DATE');
 // Checkout: same rules; the city is stored under its admin name.
 expectError(await checkout({ city: 'Pančevo', postalCode: '26000' }, '2027-01-05'), 422, 'INVALID_DELIVERY_DATE');
 const order = expectStatus(await checkout({ city: 'панчево', postalCode: '26000' }, '2027-01-01'), 201);
 assert.equal(JSON.parse(scalar('SELECT shipping_json FROM orders WHERE id=?', order.order.id)).city, 'Pančevo');
 assert.equal(scalar("SELECT city FROM customers WHERE email='grad@example.test'"), 'Pančevo');
 // Admin: manual-order options and the generated route carry the city.
 const manual = expectStatus(await get('/api/admin/orders/quote', { admin: true }));
 assert.deepEqual(manual.deliveryWeekdaysByCity, { Beograd: [2, 5], 'Novi Sad': [5], 'Pančevo': [5] });
 const route = expectStatus(await api('/api/admin/deliveries', { action: 'generate', date: '2027-01-01' }, { admin: true }));
 assert.equal(route.orders[0].customer_snapshot.city, 'Pančevo');
 // Removing the city in the admin closes it again; the planned order stays.
 expectStatus(await settings({ serviceRegions: [] }));
 expectError(await checkout({ city: 'Pančevo', postalCode: '26000' }, '2027-01-08', [line()], 'drugi@example.test'), 422, 'DELIVERY_AREA_UNAVAILABLE');
 assert.equal(scalar('SELECT delivery_date FROM orders WHERE id=?', order.order.id), '2027-01-01');
});

test('the admin city list is validated with clear rules', async () => {
 const refused = async (regions, text) => { const body = expectError(await settings({ serviceRegions: regions }), 422, 'VALIDATION_ERROR'); if (text) assert.match(body.error.message, text); };
 await refused([{ ...PANCEVO, weekdays: [] }], /bar jedan dan/);
 await refused([{ ...PANCEVO, weekdays: [3] }], /danima ture/);
 await refused([{ city: 'Beograd', postalCodes: ['11999'], weekdays: [2] }], /već u zoni dostave/);
 await refused([{ city: 'Zemun', postalCodes: ['11999'], weekdays: [2] }], /već u zoni dostave/);
 await refused([{ ...PANCEVO, postalCodes: ['11000'] }], /već pripada gradu Beograd/);
 await refused([{ ...PANCEVO, postalCodes: ['2600'] }], /pet cifara/);
 await refused([PANCEVO, { ...PANCEVO, city: 'ПАНЧЕВО', postalCodes: ['26102'] }], /dva puta/);
 await refused([PANCEVO, { city: 'Zrenjanin', postalCodes: ['26000'], weekdays: [2] }], /kod dva grada/);
 await refused([{ postalCodes: ['26000'], weekdays: [5] }]);
 // Route days cannot drop the only day of an added city.
 expectStatus(await settings({ serviceRegions: [PANCEVO] }));
 expectError(await settings({ deliveryWeekdays: [2] }), 422, 'VALIDATION_ERROR');
 // A city stored before it had its own days keeps the route days it used to get.
 database.raw.exec(`UPDATE settings SET value_json='[{"city":"Niš","postalCodes":["18000"]}]' WHERE key='serviceRegions'`);
 assert.deepEqual(expectStatus(await options('Niš', '18000')).weekdays, [2, 5]);
 assert.deepEqual(expectStatus(await get('/api/admin/settings', { admin: true })).settings.serviceRegions, [{ city: 'Niš', postalCodes: ['18000'], weekdays: [2, 5] }]);
});

test('account address change honours added cities and the subscription weekday', async () => {
 expectStatus(await settings({ serviceRegions: [PANCEVO, { city: 'Zrenjanin', postalCodes: ['23000'], weekdays: [2, 5] }] }));
 // A Tuesday subscriber in Beograd cannot move to Friday-only Pančevo, but can move to Zrenjanin.
 expectStatus(await checkout({}, '2027-01-05', [line('subscription')]), 201);
 const cookie = session();
 const account = expectStatus(await get('/api/account', { cookie }));
 assert.deepEqual(account.deliveryCities, ['Beograd', 'Novi Sad', 'Pančevo', 'Zrenjanin']);
 assert.equal(account.indjijaEnabled, undefined);
 expectError(await moveTo({ city: 'Pančevo', postalCode: '26000' }, cookie), 422, 'DELIVERY_DAY_UNAVAILABLE');
 expectError(await moveTo({ city: 'Novi Sad', postalCode: '21000' }, cookie), 422, 'DELIVERY_DAY_UNAVAILABLE');
 expectError(await moveTo({ city: 'Inđija', postalCode: '22320' }, cookie), 422, 'DELIVERY_AREA_UNAVAILABLE');
 expectError(await moveTo({ city: 'Zrenjanin', postalCode: '26000' }, cookie), 422, 'DELIVERY_AREA_UNAVAILABLE');
 expectStatus(await moveTo({ city: 'зрењанин', postalCode: '23000' }, cookie));
 assert.equal(scalar("SELECT city FROM customers WHERE email='grad@example.test'"), 'Zrenjanin');
 assert.equal(JSON.parse(scalar('SELECT shipping_json FROM subscriptions')).city, 'Zrenjanin');
 // A Friday subscriber can move to Pančevo.
 expectStatus(await checkout({}, '2027-01-01', [line('subscription')], 'petak@example.test'), 201);
 expectStatus(await moveTo({ city: 'Pančevo', postalCode: '26101' }, session('petak@example.test')));
 assert.equal(scalar("SELECT city FROM customers WHERE email='petak@example.test'"), 'Pančevo');
 // Admin edit of a customer uses the same zone rules.
 const id = scalar("SELECT id FROM customers WHERE email='petak@example.test'");
 const edit = (city, postalCode) => api('/api/admin/customers/' + id, { fullName: 'Ana Grad', phone: '+381600000002', addressLine1: 'Test ulica 1', city, postalCode }, { admin: true, method: 'PATCH' });
 expectStatus(await edit('ПАНЧЕВО', '26000'));
 assert.equal(scalar('SELECT city FROM customers WHERE id=?', id), 'Pančevo');
 expectError(await edit('Inđija', '22320'), 422, 'DELIVERY_AREA_UNAVAILABLE');
});

test('an existing Inđija address still renders in the account and the admin', async () => {
 expectStatus(await checkout({}, '2027-01-01', [line('subscription')]), 201);
 database.raw.exec(`UPDATE customers SET city='Inđija', postal_code='22320'; UPDATE subscriptions SET shipping_json=json_set(shipping_json,'$.city','Inđija','$.postalCode','22320')`);
 const cookie = session();
 const account = expectStatus(await get('/api/account', { cookie }));
 assert.equal(account.customer.city, 'Inđija');
 assert.ok(!account.deliveryCities.includes('Inđija'), 'Inđija is not offered as a new choice');
 const id = scalar('SELECT id FROM customers');
 assert.equal(expectStatus(await get('/api/admin/customers/' + id, { admin: true })).customer.city, 'Inđija');
 const route = expectStatus(await api('/api/admin/deliveries', { action: 'generate', date: '2027-01-01' }, { admin: true }));
 assert.equal(route.orders.length, 1);
});

test('the top-bar countdown lists added cities and shows at most three', async () => {
 expectStatus(await settings({ serviceRegions: [PANCEVO] }));
 const cities = (html) => [...html.matchAll(/class="delivery-countdown-city">([^<]+)</g)].map((match) => match[1]);
 // The default storefront language is Serbian Cyrillic, so city names render in Cyrillic.
 const page = await get('/');
 assert.equal(page.status, 200);
 assert.deepEqual(cities(page.body), ['Београд', 'Нови Сад', 'Панчево']);
 assert.ok(!page.body.includes('Inđij') && !page.body.includes('Инђиј'));
 // Five cities: the three nearest change deadlines (Friday 1 Jan) stay, Tuesday-only Zrenjanin waits.
 expectStatus(await settings({ serviceRegions: [PANCEVO, { city: 'Zrenjanin', postalCodes: ['23000'], weekdays: [2] }, { city: 'Subotica', postalCodes: ['24000'], weekdays: [5] }] }));
 const tidy = cities((await get('/')).body);
 assert.equal(tidy.length, 3);
 assert.ok(!tidy.includes('Зрењанин'));
 // After the Friday deadline (Wed 30 Dec 19:00 Belgrade time), Tuesday's cities come first.
 at('2026-12-30T19:30:00Z');
 assert.ok(cities((await get('/')).body).includes('Зрењанин'));
});
