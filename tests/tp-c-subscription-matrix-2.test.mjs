import assert from 'node:assert/strict';
import { beforeEach, afterEach, test } from 'node:test';
import { register } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { createDatabase } from './sqlite-d1.mjs';

// TEST_PLAN §6-C, sequences: pause/skip/cancel chains driven by the fake clock and the daily
// job (GET /api/jobs/scheduled), mid-package additions, failed renewal payment and retries,
// optimistic concurrency. Calendar: Beograd, Friday deliveries from 2027-02-05 07:00 local,
// cutoff Wednesday 19:00 local (18:00Z in winter). Cow milk 2 L × 250 RSD, delivery 350 RSD.
const realDate = Date;
let database;
const env = { APP_ENV: 'local', PAYMENT_MODE: 'mock', BADI_MODE: 'mock', EMAIL_MODE: 'console', APP_ORIGIN: 'http://localhost', ADMIN_LEGACY_ACCESS: 'true', ADMIN_SECRET: 'test-admin-secret', PAYMENT_WEBHOOK_SECRET: 'test-webhook-secret', LOCAL_AUTH_EXPOSE_TOKEN: 'true', CRON_SECRET: 'test-cron-secret' };
globalThis.__mlekoTestCloudflareEnv = env;
register(new URL('./cloudflare-loader.mjs', import.meta.url));
const worker = (await import('../dist/server/index.js')).default;
function at(iso) {
 const instant = new realDate(iso).getTime();
 globalThis.Date = class extends realDate { constructor(...args) { super(...(args.length ? args : [instant])); } static now() { return instant; } };
}
const SETUP = '2027-02-01T10:00:00Z';
let cookieCache;
beforeEach(() => {
 at(SETUP); cookieCache = null;
 database = createDatabase(); env.DB = database;
 database.raw.exec("UPDATE products SET price_minor=35000, subscription_price_minor=25000, is_active=1, allow_subscription=1 WHERE id='prod_kravlje_1l'");
});
afterEach(() => { database.close(); globalThis.Date = realDate; });

async function api(path, data, { method = 'POST', admin = false, cookie, key = randomUUID(), authorization } = {}) {
 const headers = { 'content-type': 'application/json', Origin: 'http://localhost', 'Idempotency-Key': key };
 if (admin) headers['x-admin-secret'] = env.ADMIN_SECRET;
 if (cookie) headers.cookie = cookie;
 if (authorization) headers.authorization = authorization;
 const res = await worker.fetch(new Request('http://localhost' + path, { method, headers, ...(method !== 'GET' ? { body: JSON.stringify(data) } : {}) }), env, { waitUntil() {}, passThroughOnException() {} });
 const text = await res.text();
 let body; try { body = JSON.parse(text); } catch { body = text; }
 return { status: res.status, body };
}
const scalar = (sql, ...args) => Object.values(database.raw.prepare(sql).get(...args) ?? { value: null })[0];
const rows = (sql, ...args) => database.raw.prepare(sql).all(...args);
function expectStatus(r, status = 200) { assert.equal(r.status, status, JSON.stringify(r.body)); return r.body; }
function expectError(r, status, code) { assert.equal(r.status, status, JSON.stringify(r.body)); assert.equal(r.body.error?.code, code, JSON.stringify(r.body)); return r.body; }
const customer = { email: 'ana@example.test', fullName: 'Ana Test', phone: '+381600000001', addressLine1: 'Test ulica 1', city: 'Beograd', postalCode: '11000' };
async function buy(paymentMethod = 'card', deliveryDate = '2027-02-05') {
 return expectStatus(await api('/api/checkout', { customer, items: [{ productId: 'prod_kravlje_1l', quantity: 2, purchaseType: 'subscription', cadence: 'weekly' }], paymentMethod, ...(paymentMethod === 'card' ? { paymentToken: 'mock-token' } : {}), deliveryDate }), 201);
}
function session() {
 if (cookieCache) return cookieCache;
 const c = database.raw.prepare('SELECT id,email FROM customers WHERE email = ?').get(customer.email);
 const token = randomUUID() + randomUUID();
 database.raw.prepare("INSERT INTO auth_tokens (id, customer_id,email,token_hash,kind,expires_at) VALUES (?,?,?,?,'session','2030-01-01T00:00:00Z')").run(randomUUID(), c.id, c.email, createHash('sha256').update(token).digest('base64url'));
 return (cookieCache = 'mm_session=' + token);
}
const version = (id) => scalar('SELECT version FROM subscriptions WHERE id=?', id);
const sub = (id) => database.raw.prepare('SELECT * FROM subscriptions WHERE id=?').get(id);
async function mutate(id, action, details = {}, key = randomUUID()) {
 return api('/api/account/subscriptions/' + id, { action, expectedVersion: version(id), ...details }, { cookie: session(), method: 'PATCH', key });
}
const account = async () => expectStatus(await api('/api/account', null, { method: 'GET', cookie: session() }));
const accountSub = async (id) => (await account()).subscriptions.find((s) => s.id === id);
const generate = async (date) => expectStatus(await api('/api/admin/deliveries', { action: 'generate', date }, { admin: true }));
const view = async (date) => expectStatus(await api('/api/admin/deliveries?date=' + date, null, { method: 'GET', admin: true }));
async function stopOn(date, subscriptionId) {
 let payload = await view(date);
 if (!payload.delivery) payload = await generate(date);
 const order = payload.orders.find((o) => o.subscription_id === subscriptionId);
 return order ? { litres: order.items.reduce((s, i) => s + Number(i.quantity), 0), address: order.customer_snapshot.addressLine1, status: order.status, route: payload.delivery.status } : null;
}
async function handover(date, { cash = false } = {}) {
 at(date + 'T10:00:00Z');
 const snapshot = await generate(date);
 for (const order of snapshot.orders) expectStatus(await api('/api/admin/deliveries', { action: 'complete', id: order.id, status: 'delivered', cashCollected: cash }, { admin: true }));
 return snapshot;
}
const jobs = async (iso) => { at(iso); return expectStatus(await api('/api/jobs/scheduled', null, { method: 'GET', authorization: 'Bearer ' + env.CRON_SECRET })); };
/** Run the daily cron (08:00Z) every day from `from` through `to`, inclusive. */
async function dailyJobs(from, to) { for (let d = from; d <= to; d = plusDays(d, 1)) await jobs(d + 'T08:00:00Z'); }
const plusDays = (date, days) => new realDate(Date.parse(date + 'T12:00:00Z') + days * 86_400_000).toISOString().slice(0, 10);
const summary = (s) => s.packageSummary && [s.packageSummary.purchased, s.packageSummary.realized, s.packageSummary.remaining];
const skips = (id) => rows('SELECT delivery_date FROM subscription_skips WHERE subscription_id=? ORDER BY delivery_date', id).map((r) => r.delivery_date);
const topicCount = (topic) => scalar('SELECT COUNT(*) FROM outbox WHERE topic=?', topic);

// ------------------------------------------------------------------ pause
test('C seq: pause of one week — no stop and no charge on 2027-02-05, the daily job resumes it by itself on 2027-02-12', async () => {
 const id = (await buy()).subscription.id;
 expectStatus(await mutate(id, 'pause', { pauseUntil: '2027-02-10' }));
 assert.deepEqual([sub(id).status, sub(id).next_delivery_date, sub(id).pause_until], ['paused', '2027-02-12', '2027-02-10']);
 await dailyJobs('2027-02-01', '2027-02-11');
 const paused = await stopOn('2027-02-05', id);
 assert.equal(paused, null, 'no delivery in the paused week');
 assert.equal(scalar("SELECT status FROM deliveries WHERE delivery_date='2027-02-05'"), 'locked');
 const resumed = await stopOn('2027-02-12', id);
 assert.deepEqual([resumed?.litres, resumed?.route], [2, 'locked'], 'the job locked 2027-02-12 with the stop');
 assert.deepEqual([sub(id).status, sub(id).next_delivery_date, sub(id).pause_until], ['active', '2027-02-19', null], 'resumed by itself at the lock');
 assert.equal(scalar('SELECT COUNT(*) FROM orders'), 1, 'no charge for the pause');
 assert.equal(scalar('SELECT COUNT(*) FROM credits_ledger'), 0);
 await handover('2027-02-12');
 assert.deepEqual(summary(await accountSub(id)), [4, 1, 3]);
 assert.equal(topicCount('subscription.pause'), 1);
});

test('C seq: longer pause (until 2027-03-15) — six empty Fridays, no renewal, the job resumes it on 2027-03-19', async () => {
 const id = (await buy()).subscription.id;
 expectStatus(await mutate(id, 'pause', { pauseUntil: '2027-03-15' }));
 assert.equal(sub(id).next_delivery_date, '2027-03-19');
 await dailyJobs('2027-02-01', '2027-03-18');
 for (const date of ['2027-02-05', '2027-02-12', '2027-02-19', '2027-02-26', '2027-03-05', '2027-03-12']) assert.equal(await stopOn(date, id), null, date);
 assert.equal((await stopOn('2027-03-19', id))?.litres, 2);
 assert.equal(sub(id).status, 'active');
 assert.equal(scalar('SELECT COUNT(*) FROM orders'), 1, 'no renewal and no charge while paused');
 assert.equal(scalar('SELECT COUNT(*) FROM subscription_packages'), 1);
});

test('C seq: pause limit — exactly three calendar months (2027-05-01) is accepted, one day more is 422 PAUSE_TOO_LONG, also when extending later', async () => {
 const id = (await buy()).subscription.id;
 assert.equal((await accountSub(id)).maxPauseUntil, '2027-05-01');
 expectError(await mutate(id, 'pause', { pauseUntil: '2027-05-02' }), 422, 'PAUSE_TOO_LONG');
 assert.equal(sub(id).status, 'active');
 expectStatus(await mutate(id, 'pause', { pauseUntil: '2027-05-01' }));
 assert.deepEqual([sub(id).status, sub(id).next_delivery_date], ['paused', '2027-05-07']);
 at('2027-03-01T10:00:00Z');
 expectError(await mutate(id, 'pause', { pauseUntil: '2027-05-02' }), 422, 'PAUSE_TOO_LONG');
 assert.equal((await accountSub(id)).maxPauseUntil, '2027-05-01', 'the limit counts from the start of the pause, not from the extension');
});

test('C seq: pause limit at month end — from 2026-11-30 the last allowed day is 2027-02-28, 2027-03-01 is 422', async () => {
 at('2026-11-30T10:00:00Z');
 const id = (await buy('card', '2026-12-04')).subscription.id;
 expectError(await mutate(id, 'pause', { pauseUntil: '2027-03-01' }), 422, 'PAUSE_TOO_LONG');
 expectStatus(await mutate(id, 'pause', { pauseUntil: '2027-02-28' }));
 assert.equal(sub(id).next_delivery_date, '2027-03-05');
});

test('C seq: manual resume before the pause ends — next delivery is the first editable Friday (2027-02-19), the paused weeks stay empty', async () => {
 const id = (await buy()).subscription.id;
 expectStatus(await mutate(id, 'pause', { pauseUntil: '2027-03-01' }));
 at('2027-02-15T10:00:00Z');
 const before = topicCount('subscription.resume');
 expectStatus(await mutate(id, 'resume'));
 assert.deepEqual([sub(id).status, sub(id).next_delivery_date, sub(id).pause_until], ['active', '2027-02-19', null]);
 assert.equal(await stopOn('2027-02-12', id), null);
 assert.equal((await stopOn('2027-02-19', id))?.litres, 2);
 const s = await accountSub(id);
 assert.deepEqual([s.status, s.nextDeliveryDate, summary(s)], ['active', '2027-02-19', [4, 0, 4]]);
 assert.equal(topicCount('subscription.resume') - before, 1);
});

// ------------------------------------------------------------------ skip
test('C seq: skip one week — only 2027-02-05 is skipped, 2027-02-12 is normal, the package still owes 4 deliveries and ends after the 4th', async () => {
 const id = (await buy()).subscription.id;
 expectStatus(await mutate(id, 'skip_next'));
 const first = await handover('2027-02-05');
 assert.equal(first.orders.length, 0);
 await handover('2027-02-12');
 const s = await accountSub(id);
 assert.deepEqual([summary(s), s.nextDeliveryDate], [[4, 1, 3], '2027-02-19']);
 for (const date of ['2027-02-19', '2027-02-26']) await handover(date);
 assert.equal(scalar('SELECT status FROM subscription_packages'), 'open', 'three realized: still open');
 await handover('2027-03-05');
 assert.equal(scalar('SELECT status FROM subscription_packages'), 'completed');
 assert.equal(scalar("SELECT SUM(COALESCE(di.delivered_quantity, di.quantity)) FROM delivery_items di JOIN delivery_orders dor ON dor.id=di.delivery_order_id WHERE dor.status='delivered'"), 8);
 assert.equal(scalar('SELECT COUNT(*) FROM credits_ledger'), 0);
 assert.equal(topicCount('subscription.skip_next'), 1);
});

test('C seq: skip three weeks in a row — 02-05, 02-12, 02-19 skipped, deliveries 02-26..03-19, never a fifth', async () => {
 const id = (await buy()).subscription.id;
 for (const expected of ['2027-02-12', '2027-02-19', '2027-02-26']) { expectStatus(await mutate(id, 'skip_next')); assert.equal(sub(id).next_delivery_date, expected); }
 assert.deepEqual(skips(id), ['2027-02-05', '2027-02-12', '2027-02-19']);
 assert.equal((await accountSub(id)).nextDeliveryDate, '2027-02-26');
 for (const date of ['2027-02-05', '2027-02-12', '2027-02-19']) assert.equal(await stopOn(date, id), null, date);
 for (const date of ['2027-02-26', '2027-03-05', '2027-03-12', '2027-03-19']) assert.equal((await handover(date)).orders.length, 1, date);
 assert.equal(scalar('SELECT status FROM subscription_packages'), 'completed');
 assert.equal(await stopOn('2027-03-26', id), null, 'no fifth delivery without a renewal');
 assert.equal(topicCount('subscription.skip_next'), 3);
});

test('C seq: skipping the same week twice — a replay (same Idempotency-Key) skips once, a second click with the old version is 409 SUBSCRIPTION_VERSION_CONFLICT', async () => {
 const id = (await buy()).subscription.id;
 const v = version(id), key = randomUUID();
 const body = { action: 'skip_next', expectedVersion: v };
 const first = expectStatus(await api('/api/account/subscriptions/' + id, body, { cookie: session(), method: 'PATCH', key }));
 const replay = expectStatus(await api('/api/account/subscriptions/' + id, body, { cookie: session(), method: 'PATCH', key }));
 assert.equal(replay.version, first.version);
 assert.deepEqual([sub(id).next_delivery_date, version(id), skips(id)], ['2027-02-12', v + 1, ['2027-02-05']]);
 const second = expectError(await api('/api/account/subscriptions/' + id, body, { cookie: session(), method: 'PATCH' }), 409, 'SUBSCRIPTION_VERSION_CONFLICT');
 assert.deepEqual([second.error.details.expectedVersion, second.error.details.currentVersion], [v, v + 1]);
 assert.deepEqual(skips(id), ['2027-02-05'], 'still exactly one skip');
 assert.equal(topicCount('subscription.skip_next'), 1);
});

test('C seq: [PITANJE] undo skip — there is no customer action to undo a skip (unknown action 422, resume 409)', async () => {
 const id = (await buy()).subscription.id;
 expectStatus(await mutate(id, 'skip_next'));
 expectError(await mutate(id, 'unskip'), 422, 'VALIDATION_ERROR');
 expectError(await mutate(id, 'undo_skip'), 422, 'VALIDATION_ERROR');
 expectError(await mutate(id, 'resume'), 409, 'INVALID_SUBSCRIPTION_STATE');
 assert.deepEqual([sub(id).next_delivery_date, skips(id)], ['2027-02-12', ['2027-02-05']], 'the skip stays');
});

test('C seq: skip then pause — the skipped week and the paused week stay empty, delivery resumes on 2027-02-19', async () => {
 const id = (await buy()).subscription.id;
 expectStatus(await mutate(id, 'skip_next'));
 expectStatus(await mutate(id, 'pause', { pauseUntil: '2027-02-17' }));
 assert.deepEqual([sub(id).status, sub(id).next_delivery_date, skips(id)], ['paused', '2027-02-19', ['2027-02-05']]);
 assert.equal(await stopOn('2027-02-05', id), null);
 assert.equal(await stopOn('2027-02-12', id), null);
 assert.equal((await stopOn('2027-02-19', id))?.litres, 2);
 assert.deepEqual(summary(await accountSub(id)), [4, 0, 4]);
});

test('C seq: pause overlapping skipped weeks — skip 02-05 and 02-12, pause, resume at once: the skipped dates are honoured, next 2027-02-19', async () => {
 const id = (await buy()).subscription.id;
 expectStatus(await mutate(id, 'skip_next'));
 expectStatus(await mutate(id, 'skip_next'));
 expectStatus(await mutate(id, 'pause', { pauseUntil: '2027-02-24' }));
 assert.equal(sub(id).next_delivery_date, '2027-02-26');
 expectStatus(await mutate(id, 'resume'));
 assert.deepEqual([sub(id).status, sub(id).next_delivery_date], ['active', '2027-02-19']);
 assert.equal(await stopOn('2027-02-05', id), null);
 assert.equal(await stopOn('2027-02-12', id), null);
 assert.equal((await stopOn('2027-02-19', id))?.litres, 2);
});

// ------------------------------------------------------------------ cancel
test('C seq: pause then cancel (paid) — renewal off, the 4 paid deliveries follow the pause, the subscription ends after the 4th', async () => {
 const id = (await buy()).subscription.id;
 expectStatus(await mutate(id, 'pause', { pauseUntil: '2027-02-24' }));
 const cancel = expectStatus(await mutate(id, 'cancel'));
 assert.equal(cancel.cancelAfterPackage, true);
 assert.deepEqual([sub(id).status, sub(id).renewal_enabled, sub(id).next_delivery_date], ['paused', 0, '2027-02-26']);
 for (const date of ['2027-02-05', '2027-02-12', '2027-02-19']) assert.equal(await stopOn(date, id), null, date);
 for (const date of ['2027-02-26', '2027-03-05', '2027-03-12']) await handover(date);
 assert.equal(sub(id).status, 'active', 'still running after three');
 await handover('2027-03-19');
 assert.equal(sub(id).status, 'cancelled', 'ends after the 4th paid delivery');
 await jobs('2027-03-20T08:00:00Z');
 assert.equal(scalar('SELECT COUNT(*) FROM orders'), 1, 'no renewal charge');
 assert.equal(await stopOn('2027-03-26', id), null);
});

test('C seq: pause then cancel (unpaid cash) — cancelled at once, package order cancelled, nothing after the pause', async () => {
 const order = await buy('cash');
 const id = order.subscription.id;
 expectStatus(await mutate(id, 'pause', { pauseUntil: '2027-02-10' }));
 expectStatus(await mutate(id, 'cancel'));
 assert.equal(sub(id).status, 'cancelled');
 assert.equal(scalar('SELECT fulfillment_status FROM orders WHERE id=?', order.order.id), 'cancelled');
 assert.equal(await stopOn('2027-02-12', id), null);
 await dailyJobs('2027-02-11', '2027-02-13');
 assert.equal(scalar('SELECT COUNT(*) FROM orders'), 1);
});

test('C seq: cancel of a PAID package mid-way — no new charge, remaining paid deliveries are delivered, it ends after the 4th, the job bills nothing', async () => {
 const id = (await buy()).subscription.id;
 await handover('2027-02-05');
 at('2027-02-06T10:00:00Z');
 expectStatus(await mutate(id, 'cancel'));
 let s = await accountSub(id);
 assert.deepEqual([s.status, s.renewalEnabled, summary(s), s.nextDeliveryDate], ['active', false, [4, 1, 3], '2027-02-12']);
 for (const date of ['2027-02-12', '2027-02-19']) assert.equal((await handover(date)).orders.length, 1);
 assert.equal(sub(id).status, 'active');
 await handover('2027-02-26');
 assert.equal(sub(id).status, 'cancelled');
 await dailyJobs('2027-02-27', '2027-03-04');
 assert.equal(scalar('SELECT COUNT(*) FROM orders'), 1);
 assert.equal(scalar('SELECT COUNT(*) FROM credits_ledger'), 0);
 assert.equal(topicCount('billing.invoice_created'), 0);
 assert.equal(await stopOn('2027-03-05', id), null);
 assert.equal(scalar("SELECT SUM(COALESCE(di.delivered_quantity, di.quantity)) FROM delivery_items di JOIN delivery_orders dor ON dor.id=di.delivery_order_id WHERE dor.status='delivered'"), 8, 'all 4 × 2 L paid litres delivered');
 assert.equal(topicCount('subscription.cancel'), 1);
});

test('C seq: cancel of an UNPAID cash package — cancelled at once, order cancelled, no stop and nothing billed later', async () => {
 const order = await buy('cash');
 const id = order.subscription.id;
 await generate('2027-02-05');
 expectStatus(await mutate(id, 'cancel'));
 assert.equal(sub(id).status, 'cancelled');
 assert.deepEqual([scalar('SELECT payment_status FROM orders WHERE id=?', order.order.id), scalar('SELECT fulfillment_status FROM orders WHERE id=?', order.order.id)], ['pending', 'cancelled']);
 assert.equal(await stopOn('2027-02-05', id), null);
 assert.equal((await view('2027-02-05')).orders.length, 0, 'driver collects nothing');
 await dailyJobs('2027-02-04', '2027-02-13');
 assert.equal(scalar('SELECT COUNT(*) FROM orders'), 1);
 assert.equal((await accountSub(id)).packageSummary, null);
});

test('C seq: cancel (unpaid) then buy again — a fresh active subscription, exactly one stop with 2 L', async () => {
 const first = (await buy('cash')).subscription.id;
 expectStatus(await mutate(first, 'cancel'));
 const second = (await buy('cash')).subscription.id;
 assert.notEqual(second, first);
 assert.deepEqual([sub(first).status, sub(second).status], ['cancelled', 'active']);
 const list = await generate('2027-02-05');
 assert.equal(list.orders.length, 1);
 assert.equal(list.orders[0].subscription_id, second);
 assert.equal(list.preparation.reduce((s, p) => s + Number(p.total_quantity), 0), 2);
 const acc = await account();
 assert.deepEqual(acc.subscriptions.map((s) => s.status).sort(), ['active', 'cancelled']);
});

test('C seq: [PITANJE] cancel a PAID package then buy again — documents current behaviour: two subscriptions, both delivered on the same Friday', async () => {
 const first = (await buy()).subscription.id;
 expectStatus(await mutate(first, 'cancel'));
 const second = (await buy()).subscription.id;
 assert.deepEqual([sub(first).status, sub(first).renewal_enabled, sub(second).status], ['active', 0, 'active']);
 const list = await generate('2027-02-05');
 assert.equal(list.orders.length, 2, 'two separate stops for the same customer and address');
 assert.equal(list.preparation.reduce((s, p) => s + Number(p.total_quantity), 0), 4);
 assert.equal(scalar("SELECT COUNT(*) FROM orders WHERE kind='subscription_invoice' AND payment_status='paid'"), 2, 'two prepaid packages');
});

// ------------------------------------------------------------------ quantity
test('C seq: regular +1 L after two realized deliveries = 1 × 250 × 2 = 500 RSD, applies from the 3rd delivery; wrong expected amount is 409 SURCHARGE_CHANGED', async () => {
 const id = (await buy()).subscription.id;
 await handover('2027-02-05'); await handover('2027-02-12');
 at('2027-02-13T10:00:00Z');
 const stale = expectError(await mutate(id, 'add_quantity', { productId: 'prod_kravlje_1l', quantity: 1, scope: 'regular', expectedAmountMinor: 100000 }), 409, 'SURCHARGE_CHANGED');
 assert.equal(stale.error.details.quote.amountMinor, 50000);
 const result = expectStatus(await mutate(id, 'add_quantity', { productId: 'prod_kravlje_1l', quantity: 1, scope: 'regular', expectedAmountMinor: 50000 }));
 assert.deepEqual([result.surcharge.amountMinor, result.surcharge.deliveries, result.surcharge.unitPriceMinor, result.appliesTo], [50000, 2, 25000, 'package_and_onward']);
 assert.equal(scalar("SELECT total_minor FROM orders WHERE kind='adjustment'"), 50000);
 assert.equal((await stopOn('2027-02-19', id))?.litres, 3);
 assert.equal((await stopOn('2027-02-26', id))?.litres, 3);
 await handover('2027-02-19'); await handover('2027-02-26');
 assert.equal(scalar("SELECT SUM(COALESCE(di.delivered_quantity, di.quantity)) FROM delivery_items di JOIN delivery_orders dor ON dor.id=di.delivery_order_id WHERE dor.status='delivered'"), 10);
 assert.equal(scalar('SELECT quantity FROM subscription_items'), 3, 'the next package uses 3 L');
 assert.equal(topicCount('subscription.add_quantity'), 1);
});

test('C seq: next-only +2 L mid-package = 2 × 250 × 1 = 500 RSD, only on the next delivery', async () => {
 const id = (await buy()).subscription.id;
 await handover('2027-02-05');
 at('2027-02-06T10:00:00Z');
 const result = expectStatus(await mutate(id, 'add_quantity', { productId: 'prod_kravlje_1l', quantity: 2, scope: 'next_only', expectedAmountMinor: 50000 }));
 assert.deepEqual([result.surcharge.amountMinor, result.surcharge.deliveries, result.appliesTo], [50000, 1, 'next_delivery']);
 assert.equal((await stopOn('2027-02-12', id))?.litres, 4);
 assert.equal((await stopOn('2027-02-19', id))?.litres, 2);
 assert.equal(scalar('SELECT quantity FROM subscription_items'), 2);
});

test('C seq: regular +1 L when the 3rd visit is already packed (locked) — only the 4th visit is left: 250 RSD, the locked list keeps 2 L', async () => {
 const id = (await buy()).subscription.id;
 await handover('2027-02-05'); await handover('2027-02-12');
 at('2027-02-17T18:01:00Z');
 assert.equal((await stopOn('2027-02-19', id))?.route, 'locked');
 assert.equal(sub(id).next_delivery_date, '2027-02-26');
 const result = expectStatus(await mutate(id, 'add_quantity', { productId: 'prod_kravlje_1l', quantity: 1, scope: 'regular', expectedAmountMinor: 25000 }));
 assert.deepEqual([result.surcharge.amountMinor, result.surcharge.deliveries], [25000, 1]);
 assert.equal((await stopOn('2027-02-19', id))?.litres, 2, 'locked list unchanged');
 assert.equal((await stopOn('2027-02-26', id))?.litres, 3);
});

// ------------------------------------------------------------------ not offered
test('C seq: [PITANJE] change of delivery day and of the saved card are not customer actions (422 VALIDATION_ERROR) — not testable', async () => {
 const id = (await buy()).subscription.id;
 for (const action of ['change_delivery_day', 'update_payment_method']) expectError(await mutate(id, action, { weekday: 2 }), 422, 'VALIDATION_ERROR');
 assert.equal(version(id), 1);
});

// ------------------------------------------------------------------ renewal payment
test('C seq: [PITANJE] failed card renewal — new package is unpaid and never prepared; no retry is queued automatically', async () => {
 const id = (await buy()).subscription.id;
 for (const date of ['2027-02-05', '2027-02-12', '2027-02-19', '2027-02-26']) await handover(date);
 database.raw.prepare("UPDATE subscriptions SET payment_provider_ref='mock-decline' WHERE id=?").run(id); // fixture: the stored card now declines
 await jobs('2027-02-27T08:00:00Z');
 const renewal = database.raw.prepare("SELECT * FROM orders WHERE kind='subscription_invoice' ORDER BY created_at DESC LIMIT 1").get();
 assert.equal(scalar("SELECT COUNT(*) FROM orders WHERE kind='subscription_invoice'"), 2);
 assert.deepEqual([renewal.payment_status, renewal.total_minor, renewal.delivery_date], ['failed', 4 * 2 * 25000 + 4 * 35000, '2027-03-05']);
 assert.equal(topicCount('payment.method_required'), 1);
 assert.equal(scalar('SELECT COUNT(*) FROM payment_attempts'), 0, 'current behaviour: the daily job does not queue a retry by itself');
 assert.equal(await stopOn('2027-03-05', id), null, 'an unpaid card package is not prepared');
 const s = await accountSub(id);
 assert.deepEqual([s.status, s.packageSummary?.paymentStatus], ['active', 'failed']);
 await dailyJobs('2027-02-28', '2027-03-08');
 assert.equal(scalar("SELECT COUNT(*) FROM orders WHERE kind='subscription_invoice'"), 2, 'no second renewal while the unpaid package is open');
});

test('C seq: card renewal retries — admin-queued retry runs at most 3 times, then a retry with a working card pays and schedules the package on an editable date', async () => {
 const id = (await buy()).subscription.id;
 for (const date of ['2027-02-05', '2027-02-12', '2027-02-19', '2027-02-26']) await handover(date);
 database.raw.prepare("UPDATE subscriptions SET payment_provider_ref='mock-decline' WHERE id=?").run(id);
 await jobs('2027-02-27T08:00:00Z');
 const orderId = scalar("SELECT id FROM orders WHERE kind='subscription_invoice' AND payment_status='failed'");
 expectStatus(await api('/api/admin/payments', { orderId }, { admin: true }));
 at('2027-02-27T08:30:00Z');
 expectStatus(await api('/api/admin/payments', { action: 'process' }, { admin: true }));
 assert.deepEqual([scalar('SELECT attempts FROM payment_attempts'), scalar('SELECT status FROM payment_attempts')], [1, 'pending']);
 await jobs('2027-02-28T09:00:00Z');
 assert.deepEqual([scalar('SELECT attempts FROM payment_attempts'), scalar('SELECT status FROM payment_attempts')], [2, 'pending']);
 await jobs('2027-03-02T10:00:00Z');
 assert.deepEqual([scalar('SELECT attempts FROM payment_attempts'), scalar('SELECT status FROM payment_attempts')], [3, 'failed'], 'three attempts, then terminal');
 await jobs('2027-03-06T10:00:00Z');
 assert.equal(scalar('SELECT attempts FROM payment_attempts'), 3, 'no fourth attempt');
 assert.equal(scalar('SELECT payment_status FROM orders WHERE id=?', orderId), 'failed');
 // The customer fixes the card (fixture); admin queues a new retry on Monday 2027-03-08.
 database.raw.prepare("UPDATE subscriptions SET payment_provider_ref='mock-token' WHERE id=?").run(id);
 at('2027-03-08T10:00:00Z');
 expectStatus(await api('/api/admin/payments', { orderId }, { admin: true }));
 expectStatus(await api('/api/admin/payments', { action: 'process' }, { admin: true }));
 assert.equal(scalar('SELECT payment_status FROM orders WHERE id=?', orderId), 'paid');
 assert.equal(sub(id).next_delivery_date, '2027-03-12', 'moved past the locked 2027-03-05 to the next editable Friday');
 assert.equal((await stopOn('2027-03-12', id))?.litres, 2);
 assert.equal(await stopOn('2027-03-05', id), null);
 assert.deepEqual(summary(await accountSub(id)), [4, 0, 4], 'the whole new package is still owed');
});

// ------------------------------------------------------------------ concurrency
test('C seq: stale expectedVersion → 409 SUBSCRIPTION_VERSION_CONFLICT with expected/current, nothing changes', async () => {
 const id = (await buy()).subscription.id;
 expectStatus(await mutate(id, 'skip_next'));
 const v = version(id);
 for (const action of ['skip_next', 'pause', 'cancel']) {
  const r = expectError(await api('/api/account/subscriptions/' + id, { action, expectedVersion: v - 1, pauseUntil: '2027-02-20' }, { cookie: session(), method: 'PATCH' }), 409, 'SUBSCRIPTION_VERSION_CONFLICT');
  assert.deepEqual([r.error.details.expectedVersion, r.error.details.currentVersion], [v - 1, v]);
 }
 assert.deepEqual([version(id), sub(id).status, sub(id).renewal_enabled, sub(id).next_delivery_date, skips(id)], [v, 'active', 1, '2027-02-12', ['2027-02-05']]);
});

test('C seq: two concurrent mutations with the same version (skip_next + pause) — exactly one wins, the other is 409', async () => {
 const id = (await buy()).subscription.id;
 const v = version(id);
 const send = (body) => api('/api/account/subscriptions/' + id, { expectedVersion: v, ...body }, { cookie: session(), method: 'PATCH' });
 const [skip, pause] = await Promise.all([send({ action: 'skip_next' }), send({ action: 'pause', pauseUntil: '2027-02-20' })]);
 assert.deepEqual([skip.status, pause.status].sort(), [200, 409], JSON.stringify([skip.body, pause.body]));
 const loser = skip.status === 409 ? skip : pause;
 assert.equal(loser.body.error.code, 'SUBSCRIPTION_VERSION_CONFLICT');
 assert.equal(version(id), v + 1);
 if (skip.status === 200) assert.deepEqual([sub(id).status, skips(id)], ['active', ['2027-02-05']]);
 else assert.deepEqual([sub(id).status, skips(id)], ['paused', []]);
 assert.equal(scalar("SELECT COUNT(*) FROM outbox WHERE topic IN ('subscription.skip_next','subscription.pause')"), 1);
});

test('C seq: two concurrent skip_next clicks (different keys) — one skip, next delivery 2027-02-12, not 2027-02-19', async () => {
 const id = (await buy()).subscription.id;
 const v = version(id);
 const results = await Promise.all([1, 2].map(() => api('/api/account/subscriptions/' + id, { action: 'skip_next', expectedVersion: v }, { cookie: session(), method: 'PATCH' })));
 assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
 assert.deepEqual([sub(id).next_delivery_date, skips(id), version(id)], ['2027-02-12', ['2027-02-05'], v + 1]);
});

test('C seq: two concurrent regular additions — exactly one surcharge order is charged', async () => {
 const id = (await buy()).subscription.id;
 const v = version(id);
 const body = { action: 'add_quantity', expectedVersion: v, productId: 'prod_kravlje_1l', quantity: 1, scope: 'regular', expectedAmountMinor: 100000 };
 const results = await Promise.all([1, 2].map(() => api('/api/account/subscriptions/' + id, body, { cookie: session(), method: 'PATCH' })));
 assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
 assert.equal(scalar("SELECT COUNT(*) FROM orders WHERE kind='adjustment'"), 1);
 assert.equal(scalar('SELECT COUNT(*) FROM package_surcharges'), 1);
 assert.equal(scalar('SELECT quantity FROM subscription_items'), 3);
});

// ------------------------------------------------------------------ address
test('C seq: [PITANJE] address change in zone before the cutoff — what the already generated open admin list shows before the deadline', async () => {
 const id = (await buy()).subscription.id;
 await generate('2027-02-05');
 expectStatus(await api('/api/account', { addressLine1: 'Nova adresa 5', city: 'Beograd', postalCode: '11070', applyToSubscriptions: true }, { method: 'PATCH', cookie: session() }));
 const open = await stopOn('2027-02-05', id);
 assert.equal(open.route, 'open');
 assert.equal(open.address, 'Test ulica 1', 'current behaviour: the open projection is not rebuilt by a profile change (only at the deadline)');
 at('2027-02-03T18:01:00Z');
 assert.equal((await stopOn('2027-02-05', id)).address, 'Nova adresa 5', 'the locked list at the deadline has the new address');
});

test('C seq: address change to Novi Sad for a Beograd Tuesday subscription is 422 DELIVERY_DAY_UNAVAILABLE, nothing changes', async () => {
 const id = (await buy('card', '2027-02-09')).subscription.id;
 expectError(await api('/api/account', { addressLine1: 'Bulevar 1', city: 'Novi Sad', postalCode: '21000', applyToSubscriptions: true }, { method: 'PATCH', cookie: session() }), 422, 'DELIVERY_DAY_UNAVAILABLE');
 assert.equal(scalar('SELECT city FROM customers'), 'Beograd');
 assert.equal(JSON.parse(sub(id).shipping_json).city, 'Beograd');
});

test('C seq: after the cutoff — a page loaded before it gets 409 DELIVERY_LOCKED on skip (2027-02-05 stays locked with the stop); a reloaded account already shows 2027-02-12 and the skip applies there', async () => {
 const id = (await buy()).subscription.id;
 const stalePageVersion = version(id);
 at('2027-02-03T18:01:00Z');
 expectError(await api('/api/account/subscriptions/' + id, { action: 'skip_next', expectedVersion: stalePageVersion }, { cookie: session(), method: 'PATCH' }), 409, 'DELIVERY_LOCKED');
 assert.equal((await stopOn('2027-02-05', id))?.route, 'locked');
 const reloaded = await accountSub(id);
 assert.deepEqual([reloaded.nextDeliveryDate, reloaded.locked], ['2027-02-12', false]);
 expectStatus(await mutate(id, 'skip_next'));
 assert.deepEqual([sub(id).next_delivery_date, skips(id)], ['2027-02-19', ['2027-02-12']]);
 assert.equal((await stopOn('2027-02-05', id))?.litres, 2, 'the locked delivery is still delivered');
 assert.equal(await stopOn('2027-02-12', id), null);
});

test('C seq: paused until 2027-02-10, account reloaded after the 2027-02-12 cutoff — the lock resumes it with 2027-02-12 on the list; a manual resume is then 409 INVALID_SUBSCRIPTION_STATE', async () => {
 const id = (await buy()).subscription.id;
 expectStatus(await mutate(id, 'pause', { pauseUntil: '2027-02-10' }));
 at('2027-02-10T18:01:00Z');
 const reloaded = await accountSub(id);
 assert.deepEqual([reloaded.status, reloaded.nextDeliveryDate], ['active', '2027-02-19']);
 expectError(await mutate(id, 'resume'), 409, 'INVALID_SUBSCRIPTION_STATE');
 assert.equal((await stopOn('2027-02-12', id))?.litres, 2);
});
