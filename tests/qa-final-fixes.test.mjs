import assert from 'node:assert/strict';
import { beforeEach, afterEach, test } from 'node:test';
import { register } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { createDatabase } from './sqlite-d1.mjs';

// QA findings of 20 Nov 2026 ("Radi polovično"), against the real API routes and SQLite:
// visible loyalty delivery credit, the admin loyalty overview, handled site leads, the driver's
// Spoke export (cash to collect, products per product) and package dates that follow a skip.
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
 database.raw.exec("UPDATE products SET is_active=1, allow_subscription=1; UPDATE products SET price_minor=35000, subscription_price_minor=25000 WHERE id='prod_kravlje_1l';");
 database.raw.exec(`UPDATE settings SET value_json='"2026-09-01"' WHERE key='loyaltyStartDate'`);
});
afterEach(() => { database.close(); globalThis.Date = realDate; });
async function api(path, data, { method = 'POST', admin = false, cookie, origin = 'http://localhost', key = randomUUID() } = {}) {
 const headers = { 'content-type': 'application/json', 'Idempotency-Key': key, ...(origin ? { Origin: origin } : {}) };
 if (admin) headers['x-admin-secret'] = env.ADMIN_SECRET;
 if (cookie) headers.cookie = cookie;
 const res = await worker.fetch(new Request('http://localhost' + path, { method, headers, ...(method !== 'GET' ? { body: JSON.stringify(data) } : {}) }), env, { waitUntil() {}, passThroughOnException() {} });
 const text = await res.text();
 let body; try { body = JSON.parse(text); } catch { body = text; }
 return { status: res.status, body, headers: res.headers };
}
const scalar = (sql, ...args) => Object.values(database.raw.prepare(sql).get(...args) ?? { value: null })[0];
function expectStatus(r, status = 200) { assert.equal(r.status, status, JSON.stringify(r.body)); return r.body; }
function expectError(r, status, code) { assert.equal(r.status, status, JSON.stringify(r.body)); assert.equal(r.body.error.code, code); return r.body; }
const line = (quantity = 2, purchaseType = 'subscription') => ({ productId: 'prod_kravlje_1l', quantity, purchaseType, ...(purchaseType === 'subscription' ? { cadence: 'weekly' } : {}) });
const customer = (email = 'ana@example.test') => ({ email, fullName: 'Ana Test', phone: '+381600000001', addressLine1: 'Test ulica 1', city: 'Beograd', postalCode: '11000' });
async function buy(items = [line()], extra = {}) {
 return expectStatus(await api('/api/checkout', { customer: customer(), items, paymentMethod: 'card', paymentToken: 'mock-token', deliveryDate: '2027-01-01', ...extra }), 201);
}
function session(email = 'ana@example.test') {
 const c = database.raw.prepare('SELECT id,email FROM customers WHERE email = ?').get(email);
 const token = randomUUID() + randomUUID();
 database.raw.prepare("INSERT INTO auth_tokens (id, customer_id,email,token_hash,kind,expires_at) VALUES (?,?,?,?,'session','2030-01-01T00:00:00Z')").run(randomUUID(), c.id, c.email, createHash('sha256').update(token).digest('base64url'));
 return 'mm_session=' + token;
}
async function mutate(id, action, details = {}) {
 return api('/api/account/subscriptions/' + id, { action, expectedVersion: scalar('SELECT version FROM subscriptions WHERE id=?', id), ...details }, { cookie: session(), method: 'PATCH' });
}
async function delivery(date) { return expectStatus(await api('/api/admin/deliveries', { action: 'generate', date }, { admin: true })); }
async function handover(date) {
 at(date + 'T10:00:00Z');
 const snapshot = await delivery(date);
 for (const order of snapshot.orders) expectStatus(await api('/api/admin/deliveries', { action: 'complete', id: order.id, status: 'delivered', cashCollected: false }, { admin: true }));
 return snapshot;
}
const account = async () => expectStatus(await api('/api/account', null, { method: 'GET', cookie: session() }));
function pastVisits(dates) {
 const c = database.raw.prepare("SELECT id FROM customers WHERE email = 'ana@example.test'").get();
 const sub = database.raw.prepare('SELECT id FROM subscriptions WHERE customer_id = ?').get(c.id);
 for (const date of dates) {
  const deliveryId = randomUUID();
  database.raw.prepare("INSERT INTO deliveries (id, delivery_date, cutoff_at, status, generated_at, generation_key) VALUES (?, ?, ?, 'completed', ?, ?)").run(deliveryId, date, date + 'T00:00:00Z', date + 'T00:00:00Z', 'fixture:' + randomUUID());
  database.raw.prepare("INSERT INTO delivery_orders (id, delivery_id, subscription_id, customer_id, customer_snapshot_json, status) VALUES (?, ?, ?, ?, '{}', 'delivered')").run(randomUUID(), deliveryId, sub.id, c.id);
 }
}
const fridays = (from, count) => Array.from({ length: count }, (_, i) => new realDate(realDate.parse(from + 'T12:00:00Z') + i * 7 * 86_400_000).toISOString().slice(0, 10));
const rsd = (minor) => `${new Intl.NumberFormat('sr-Latn-RS').format(minor / 100)} RSD`;

async function unlockAndUseReward() {
 const order = await buy();
 pastVisits(fridays('2026-09-04', 11));
 await handover('2027-01-01');
 const rewardId = scalar('SELECT id FROM loyalty_rewards');
 at('2027-01-03T10:00:00Z');
 expectStatus(await api('/api/account/loyalty', { action: 'claim', rewardId }, { cookie: session() }));
 expectStatus(await api('/api/account/loyalty', { action: 'apply', rewardId }, { cookie: session() }));
 await handover('2027-01-08');
 return { order, rewardId };
}

test('the free-delivery credit of a handed-over reward is in the account payload until the next package deducts it', async () => {
 await buy();
 assert.equal((await account()).loyalty.openDeliveryCreditMinor, 0, 'no credit before any reward');
});

test('account loyalty shows 350 RSD delivery credit after the gift handover, and 0 once the renewal applied it', async () => {
 const { order, rewardId } = await unlockAndUseReward();
 assert.equal(scalar('SELECT status FROM loyalty_rewards WHERE id = ?', rewardId), 'used');
 const loyalty = (await account()).loyalty;
 assert.equal(loyalty.openDeliveryCreditMinor, 35000, 'the open credit is visible to the customer');
 assert.equal(loyalty.rewards[0].discountStatus, 'credited');
 await handover('2027-01-15'); await handover('2027-01-22');
 assert.equal(scalar('SELECT status FROM subscription_packages WHERE order_id = ?', order.order.id), 'completed');
 at('2027-01-23T10:00:00Z');
 const renewal = expectStatus(await api('/api/jobs/billing', { month: '2027-01' }, { admin: true })).results[0];
 assert.equal(renewal.creditAppliedMinor, 35000);
 assert.equal((await account()).loyalty.openDeliveryCreditMinor, 0, 'deducted from the next package: no longer shown as open');
});

test('admin loyalty overview lists realized deliveries toward 12, reward status and the read-only start date', async () => {
 expectError(await api('/api/admin/loyalty', null, { method: 'GET' }), 403, 'ADMIN_FORBIDDEN');
 await unlockAndUseReward();
 const overview = expectStatus(await api('/api/admin/loyalty', null, { method: 'GET', admin: true }));
 assert.equal(overview.startDate, '2026-09-01');
 assert.equal(overview.target, 12);
 const ana = overview.customers.find((row) => row.email === 'ana@example.test');
 assert.ok(ana, 'subscriber listed');
 assert.equal(ana.realizedSinceStart, 13, '11 earlier + 1 Jan + 8 Jan');
 assert.equal(ana.progress, 1, 'one delivery into the second round');
 assert.deepEqual(ana.rewards.map((reward) => [reward.cycle, reward.status]), [[1, 'used']]);
 assert.equal(ana.openDeliveryCreditMinor, 35000);
 assert.equal(scalar("SELECT COUNT(*) FROM loyalty_rewards"), 1, 'reading the overview unlocks nothing');
});

test('site leads: new first, "Obrađeno" toggles handled with an audit entry, and is admin + same-origin only', async () => {
 const lead = (name, phone) => api('/api/leads', { kind: 'mlekomat_rent', name, phone, city: 'Beograd' });
 at('2026-12-30T10:00:00Z'); expectStatus(await lead('Prva Prijava', '+381601111111'), 201);
 at('2026-12-30T11:00:00Z'); expectStatus(await lead('Druga Prijava', '+381602222222'), 201);
 database.raw.exec("UPDATE site_leads SET created_at = '2026-12-30 10:00:00' WHERE name = 'Prva Prijava'; UPDATE site_leads SET created_at = '2026-12-30 11:00:00' WHERE name = 'Druga Prijava';");
 const before = expectStatus(await api('/api/admin/leads', null, { method: 'GET', admin: true })).leads;
 assert.deepEqual(before.map((row) => [row.name, row.status]), [['Druga Prijava', 'new'], ['Prva Prijava', 'new']]);
 const newest = before[0].id;
 expectError(await api('/api/admin/leads', { id: newest, status: 'handled' }, { method: 'PATCH' }), 403, 'ADMIN_FORBIDDEN');
 expectError(await api('/api/admin/leads', { id: newest, status: 'handled' }, { method: 'PATCH', admin: true, origin: 'https://evil.example' }), 403, 'CSRF_REJECTED');
 expectError(await api('/api/admin/leads', { id: newest, status: 'done' }, { method: 'PATCH', admin: true }), 422, 'VALIDATION_ERROR');
 expectError(await api('/api/admin/leads', { id: 'lead_missing', status: 'handled' }, { method: 'PATCH', admin: true }), 404, 'LEAD_NOT_FOUND');
 assert.deepEqual(expectStatus(await api('/api/admin/leads', { id: newest, status: 'handled' }, { method: 'PATCH', admin: true })).lead, { id: newest, status: 'handled' });
 const after = expectStatus(await api('/api/admin/leads', null, { method: 'GET', admin: true })).leads;
 assert.deepEqual(after.map((row) => [row.name, row.status]), [['Prva Prijava', 'new'], ['Druga Prijava', 'handled']], 'new leads stay on top');
 assert.equal(scalar("SELECT COUNT(*) FROM audit_log WHERE action = 'lead.handled' AND entity_id = ?", newest), 1);
 expectStatus(await api('/api/admin/leads', { id: newest, status: 'handled' }, { method: 'PATCH', admin: true }));
 assert.equal(scalar("SELECT COUNT(*) FROM audit_log WHERE entity_id = ?", newest), 1, 'a repeated toggle to the same status writes nothing');
 expectStatus(await api('/api/admin/leads', { id: newest, status: 'new' }, { method: 'PATCH', admin: true }));
 assert.equal(scalar('SELECT status FROM site_leads WHERE id = ?', newest), 'new');
});

test('Spoke CSV: one line per product across sources, the loyalty gift on its own, and the cash to collect per stop', async () => {
 // Cash package (2 L × 4) plus a next-delivery-only addition of 3 L of the same milk.
 const order = await buy([line(2)], { paymentMethod: 'cash', paymentToken: undefined });
 expectStatus(await mutate(order.subscription.id, 'add_quantity', { productId: 'prod_kravlje_1l', quantity: 3, scope: 'next_only', expectedAmountMinor: 75000 }));
 const name = scalar("SELECT name FROM products WHERE id = 'prod_kravlje_1l'");
 at('2027-01-01T10:00:00Z');
 const snapshot = await delivery('2027-01-01');
 assert.ok(snapshot.orders[0].items.length >= 2, 'two sources behind the same product');
 const csv = String((await api('/api/admin/deliveries/export?date=2027-01-01', null, { admin: true, method: 'GET' })).body);
 const [header, row] = csv.replace(/^\uFEFF/, '').trim().split('\r\n');
 assert.equal(header, '"Address Line 1","Address Line 2","City","Postal Code","Customer name","Phone","Email","Notes","Order ID","Products","Cash to collect"', 'existing columns keep their order; cash is appended');
 const cells = row.slice(1, -1).split('","');
 assert.equal(cells[9], `5 x ${name} (1 L)`, 'aggregated per product instead of "2 x …; 3 x …"');
 const pending = scalar("SELECT SUM(total_minor) FROM orders WHERE payment_method = 'cash' AND payment_status = 'pending'");
 assert.ok(pending > 0);
 assert.equal(cells[10], rsd(pending), 'the whole pending cash (package + addition) is collected at this stop');
 const xlsx = new TextDecoder().decode(new Uint8Array(await (await worker.fetch(new Request('http://localhost/api/admin/deliveries/export?date=2027-01-01&format=xlsx', { headers: { 'x-admin-secret': env.ADMIN_SECRET } }), env, { waitUntil() {}, passThroughOnException() {} })).arrayBuffer()));
 assert.match(xlsx, /Cash to collect/);
});

test('Spoke CSV keeps the loyalty gift as its own entry next to the same product', async () => {
 await buy();
 pastVisits(fridays('2026-09-04', 11));
 await handover('2027-01-01');
 const rewardId = scalar('SELECT id FROM loyalty_rewards');
 at('2027-01-03T10:00:00Z');
 expectStatus(await api('/api/account/loyalty', { action: 'claim', rewardId }, { cookie: session() }));
 expectStatus(await api('/api/account/loyalty', { action: 'apply', rewardId }, { cookie: session() }));
 at('2027-01-08T10:00:00Z');
 const gift = (await delivery('2027-01-08')).orders[0].items.find((item) => item.source_type === 'loyalty_gift');
 const csv = String((await api('/api/admin/deliveries/export?date=2027-01-08', null, { admin: true, method: 'GET' })).body);
 const products = csv.trim().split('\r\n')[1].slice(1, -1).split('","')[9].split('; ');
 assert.equal(products.length, 2, JSON.stringify(products));
 assert.ok(products.includes(`2 x ${gift.product_name} (${gift.unit_label})`), 'gift line stays separate');
 assert.match(csv, /"0 RSD"\r\n$/, 'a paid package has nothing to collect');
});

test('after a skip the package and its regular surcharge show the next real delivery; booked and fiscal dates stay', async () => {
 const order = await buy();
 const orderId = order.order.id, subscriptionId = order.subscription.id;
 expectStatus(await mutate(subscriptionId, 'skip_next'));
 assert.equal(scalar('SELECT next_delivery_date FROM subscriptions WHERE id = ?', subscriptionId), '2027-01-08');
 const packageOrder = (await account()).orders.find((row) => row.role === 'package');
 assert.equal(packageOrder.delivery_date, '2027-01-01', 'the booked date is not rewritten');
 assert.equal(packageOrder.scheduled_delivery_date, '2027-01-08', 'the account shows the package\'s real first delivery');
 assert.equal(scalar('SELECT delivery_date FROM orders WHERE id = ?', orderId), '2027-01-01');
 const listed = expectStatus(await api('/api/admin/orders', null, { method: 'GET', admin: true })).orders.find((row) => row.id === orderId);
 assert.equal(listed.scheduled_delivery_date, '2027-01-08', 'admin order list');
 const detail = expectStatus(await api('/api/admin/orders/' + orderId, null, { method: 'GET', admin: true }));
 assert.equal(detail.order.scheduled_delivery_date, '2027-01-08', 'admin order detail');
 const exported = String((await api(`/api/admin/orders/${orderId}/export?format=csv`, null, { method: 'GET', admin: true })).body);
 assert.match(exported, /"8\. 1\. 2027\."/, 'order export: local Serbian date of the first delivery');
 assert.doesNotMatch(exported, /"2027-01-0[18]"/, 'no ISO dates in the export');
 // Once the first visit is handed over, the shown date stays that first delivery.
 await handover('2027-01-08');
 at('2027-01-10T10:00:00Z');
 assert.equal((await account()).orders.find((row) => row.role === 'package').scheduled_delivery_date, '2027-01-08');
 // A regular surcharge booked for 15 Jan follows a skip of that delivery as well.
 const surcharge = expectStatus(await mutate(subscriptionId, 'update_item', { itemId: scalar('SELECT id FROM subscription_items'), quantity: 3, scope: 'regular', expectedAmountMinor: 25000 * 3 }));
 const surchargeOrderId = surcharge.surcharge.orderId;
 assert.equal(scalar('SELECT delivery_date FROM orders WHERE id = ?', surchargeOrderId), '2027-01-15');
 expectStatus(await mutate(subscriptionId, 'skip_next'));
 const surchargeOrder = (await account()).orders.find((row) => row.id === surchargeOrderId);
 assert.equal(surchargeOrder.delivery_date, '2027-01-15');
 assert.equal(surchargeOrder.scheduled_delivery_date, '2027-01-22');
});
