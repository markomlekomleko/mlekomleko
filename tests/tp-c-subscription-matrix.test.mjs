import assert from 'node:assert/strict';
import { beforeEach, afterEach, test } from 'node:test';
import { register } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { createDatabase } from './sqlite-d1.mjs';

// TEST_PLAN §6-C: every customer action from every subscription state, well before the
// change deadline of the next delivery, one minute before it and one minute after it.
// Real API routes over in-memory SQLite, fake clock. After every accepted action the four
// checks of §F: database rows, /api/account, the admin delivery list, outbox.
//
// "After cutoff" cells send the version of a page loaded before the deadline (the account GET
// itself materializes the lock, so a reloaded page already shows the following delivery; see
// tp-c-subscription-matrix-2 for that path).
//
// Calendar used (Europe/Belgrade, CET = UTC+1): first delivery Friday 2027-02-05 at 07:00,
// cutoff 36 h earlier = Wednesday 2027-02-03 19:00 local = 18:00Z. The next Friday 2027-02-12
// has its cutoff on Wednesday 2027-02-10 18:00Z. Product: cow milk 1 L, 2 L per delivery,
// subscription price 250 RSD/L, delivery 350 RSD.
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
beforeEach(() => {
 at(SETUP);
 database = createDatabase(); env.DB = database;
 database.raw.exec("UPDATE products SET price_minor=35000, subscription_price_minor=25000, is_active=1, allow_subscription=1 WHERE id='prod_kravlje_1l'");
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
const scalar = (sql, ...args) => Object.values(database.raw.prepare(sql).get(...args) ?? { value: null })[0];
const rows = (sql, ...args) => database.raw.prepare(sql).all(...args);
function expectStatus(r, status = 200) { assert.equal(r.status, status, JSON.stringify(r.body)); return r.body; }
const customer = { email: 'ana@example.test', fullName: 'Ana Test', phone: '+381600000001', addressLine1: 'Test ulica 1', city: 'Beograd', postalCode: '11000' };
async function buy(paymentMethod) {
 return expectStatus(await api('/api/checkout', { customer, items: [{ productId: 'prod_kravlje_1l', quantity: 2, purchaseType: 'subscription', cadence: 'weekly' }], paymentMethod, ...(paymentMethod === 'card' ? { paymentToken: 'mock-token' } : {}), deliveryDate: '2027-02-05' }), 201);
}
let cookieCache = null;
function session() {
 if (cookieCache) return cookieCache;
 const c = database.raw.prepare('SELECT id,email FROM customers WHERE email = ?').get(customer.email);
 const token = randomUUID() + randomUUID();
 database.raw.prepare("INSERT INTO auth_tokens (id, customer_id,email,token_hash,kind,expires_at) VALUES (?,?,?,?,'session','2030-01-01T00:00:00Z')").run(randomUUID(), c.id, c.email, createHash('sha256').update(token).digest('base64url'));
 return (cookieCache = 'mm_session=' + token);
}
beforeEach(() => { cookieCache = null; });
const version = (id) => scalar('SELECT version FROM subscriptions WHERE id=?', id);
async function mutate(id, action, details = {}) {
 return api('/api/account/subscriptions/' + id, { action, expectedVersion: version(id), ...details }, { cookie: session(), method: 'PATCH' });
}
const account = async () => expectStatus(await api('/api/account', null, { method: 'GET', cookie: session() }));
const generate = async (date) => expectStatus(await api('/api/admin/deliveries', { action: 'generate', date }, { admin: true }));
const view = async (date) => expectStatus(await api('/api/admin/deliveries?date=' + date, null, { method: 'GET', admin: true }));
/** The stop of this subscription on a date as the admin sees it (null when absent). */
async function stop(date, subscriptionId) {
 let payload = await view(date);
 if (!payload.delivery) payload = await generate(date); // never generated yet: build the projection
 const order = payload.orders.find((o) => o.subscription_id === subscriptionId);
 if (!order) return null;
 return { litres: order.items.filter((i) => i.product_id === 'prod_kravlje_1l').reduce((s, i) => s + Number(i.quantity), 0), address: order.customer_snapshot.addressLine1, status: order.status, routeStatus: payload.delivery?.status };
}
const outboxCount = (topic, since) => scalar('SELECT COUNT(*) FROM outbox WHERE topic = ? AND rowid > ?', topic, since);
const outboxMark = () => scalar('SELECT COALESCE(MAX(rowid),0) FROM outbox');
const skips = (id) => rows('SELECT delivery_date FROM subscription_skips WHERE subscription_id=? ORDER BY delivery_date', id).map((r) => r.delivery_date);

// ---------------------------------------------------------------- states
const STATES = {
 unpaid_cash: { label: 'active, UNPAID cash package', next: '2027-02-05', async build() { return (await buy('cash')).subscription.id; } },
 paid: { label: 'active, PAID package', next: '2027-02-05', async build() { return (await buy('card')).subscription.id; } },
 skipped: { label: 'active after one skipped week', next: '2027-02-12', async build() { const id = (await buy('card')).subscription.id; expectStatus(await mutate(id, 'skip_next')); return id; } },
 paused: { label: 'paused (until 2027-02-10)', next: '2027-02-12', async build() { const id = (await buy('card')).subscription.id; expectStatus(await mutate(id, 'pause', { pauseUntil: '2027-02-10' })); return id; } },
 renewal_off: { label: 'renewal cancelled, paid package running', next: '2027-02-05', async build() { const id = (await buy('card')).subscription.id; expectStatus(await mutate(id, 'cancel')); return id; } },
 cancelled: { label: 'cancelled', next: '2027-02-05', async build() { const id = (await buy('cash')).subscription.id; expectStatus(await mutate(id, 'cancel')); return id; } },
};
const cutoffOf = (date) => ({ '2027-02-05': '2027-02-03T18:00:00Z', '2027-02-12': '2027-02-10T18:00:00Z' })[date];
const shift = (iso, seconds) => new realDate(Date.parse(iso) + seconds * 1000).toISOString();
const plusDays = (date, days) => new realDate(Date.parse(date + 'T12:00:00Z') + days * 86_400_000).toISOString().slice(0, 10);

const ACTIONS = {
 skip_next: { boundary: true, body: () => ({}) },
 pause: { boundary: true, body: (s) => ({ pauseUntil: plusDays(s.next, 12) }) },
 resume: { body: () => ({}) },
 cancel: { boundary: true, body: () => ({}) },
 add_quantity_next_only: { action: 'add_quantity', body: () => ({ productId: 'prod_kravlje_1l', quantity: 1, scope: 'next_only', expectedAmountMinor: 25000 }) },
 add_quantity_regular: { action: 'add_quantity', body: () => ({ productId: 'prod_kravlje_1l', quantity: 1, scope: 'regular', expectedAmountMinor: 100000 }) },
 decrease: { action: 'update_item', body: (s, itemId) => ({ itemId, quantity: 1 }) },
 remove_item: { body: (s, itemId) => ({ itemId }) },
 address: { body: () => ({ addressLine1: 'Nova adresa 5', city: 'Beograd', postalCode: '11070', applyToSubscriptions: true }) },
};

/**
 * Expected outcome derived from TEST_PLAN §3/§4 and the prepaid-package rules:
 * - cancelled is terminal (409 SUBSCRIPTION_CANCELLED) for every subscription action;
 * - only a paused subscription resumes (409 INVALID_SUBSCRIPTION_STATE otherwise);
 * - skip/additions/quantity changes need an active subscription (paused → 409 INVALID_SUBSCRIPTION_STATE);
 * - a quantity can only grow (422 QUANTITY_DECREASE_NOT_ALLOWED);
 * - after the cutoff of the next delivery no change of that delivery is allowed (409 DELIVERY_LOCKED);
 * - resume never edits a locked delivery, it lands on the next editable date.
 */
function expected(stateKey, actionKey, when) {
 const s = STATES[stateKey];
 const after = when === 'plus1';
 const reject = (status, code) => ({ reject: [status, code] });
 if (actionKey === 'address') {
  if (stateKey === 'cancelled') return { ok: { addressOnly: true, subscriptionUntouched: true } };
  return after ? reject(409, 'DELIVERY_LOCKED') : { ok: { addressOnly: true } };
 }
 if (stateKey === 'cancelled') return reject(409, 'SUBSCRIPTION_CANCELLED');
 if (actionKey === 'resume' && stateKey !== 'paused') return reject(409, 'INVALID_SUBSCRIPTION_STATE');
 if (stateKey === 'paused' && ['skip_next', 'add_quantity_next_only', 'add_quantity_regular', 'decrease', 'remove_item'].includes(actionKey)) return reject(409, 'INVALID_SUBSCRIPTION_STATE');
 if (actionKey === 'resume') {
  // Paused until 2027-02-10. Well before the cutoff of 2027-02-05 the first editable Friday is 2027-02-05;
  // one minute before the 2027-02-12 cutoff it is 2027-02-12; after that cutoff the 2027-02-12 visit is
  // already due by the pause end and locked, so it must stay on the list and the next one is 2027-02-19.
  return { ok: { status: 'active', next: when === 'plus1' ? '2027-02-19' : when === 'minus1' ? '2027-02-12' : '2027-02-05', present: { [when === 'before' ? '2027-02-05' : '2027-02-12']: 2 }, topic: 'subscription.resume', renewal: true } };
 }
 if (after) return reject(409, 'DELIVERY_LOCKED');
 if (actionKey === 'decrease' || actionKey === 'remove_item') return reject(422, 'QUANTITY_DECREASE_NOT_ALLOWED');
 const renewal = stateKey !== 'renewal_off';
 const status = stateKey === 'paused' ? 'paused' : 'active';
 const baseSkips = stateKey === 'skipped' ? ['2027-02-05'] : [];
 const summary = [4, 0, 4];
 if (actionKey === 'skip_next') return { ok: { status, next: plusDays(s.next, 7), skips: [...baseSkips, s.next], absent: [s.next], present: { [plusDays(s.next, 7)]: 2 }, topic: 'subscription.skip_next', renewal, summary } };
 if (actionKey === 'pause') {
  const resume = plusDays(s.next, 14); // pauseUntil = next + 12 days → first Friday on/after it
  return { ok: { status: 'paused', next: resume, skips: baseSkips, absent: [s.next], present: { [resume]: 2 }, topic: 'subscription.pause', renewal, summary } };
 }
 if (actionKey === 'cancel') {
  if (stateKey === 'unpaid_cash') return { ok: { status: 'cancelled', next: s.next, skips: [], absent: [s.next], topic: 'subscription.cancel', renewal: true, summary: null, packageStatus: 'completed' } };
  // Paid package: renewal off, the remaining paid deliveries still go out.
  return { ok: { status, next: s.next, skips: baseSkips, present: { [s.next]: 2 }, topic: 'subscription.cancel', renewal: false, summary, packageStatus: 'open' } };
 }
 if (actionKey === 'add_quantity_next_only') return { ok: { status, next: s.next, skips: baseSkips, present: { [s.next]: 3, ...(stateKey === 'unpaid_cash' ? {} : { [plusDays(s.next, 7)]: 2 }) }, ...(stateKey === 'unpaid_cash' ? { absent: [plusDays(s.next, 7)] } : {}), topic: 'subscription.add_quantity', renewal, summary, surcharge: { amount: 25000, deliveries: 1, scope: 'next_only', paymentStatus: stateKey === 'unpaid_cash' ? 'pending' : 'paid' }, itemQuantity: 2 } };
 if (actionKey === 'add_quantity_regular') return { ok: { status, next: s.next, skips: baseSkips, present: { [s.next]: 3, ...(stateKey === 'unpaid_cash' ? {} : { [plusDays(s.next, 7)]: 3 }) }, ...(stateKey === 'unpaid_cash' ? { absent: [plusDays(s.next, 7)] } : {}), topic: 'subscription.add_quantity', renewal, summary, surcharge: { amount: 100000, deliveries: 4, scope: 'regular', paymentStatus: stateKey === 'unpaid_cash' ? 'pending' : 'paid' }, itemQuantity: 3 } };
 throw new Error('no expectation for ' + stateKey + ' × ' + actionKey);
}

function snapshot(id) {
 return {
  version: version(id), next: scalar('SELECT next_delivery_date FROM subscriptions WHERE id=?', id), status: scalar('SELECT status FROM subscriptions WHERE id=?', id),
  renewal: scalar('SELECT renewal_enabled FROM subscriptions WHERE id=?', id), orders: scalar('SELECT COUNT(*) FROM orders'), skips: skips(id),
  credits: scalar('SELECT COUNT(*) FROM credits_ledger'), quantity: scalar("SELECT quantity FROM subscription_items WHERE subscription_id=? AND status='active'", id),
  address: scalar('SELECT address_line_1 FROM customers'), shipping: scalar('SELECT shipping_json FROM subscriptions WHERE id=?', id),
 };
}

async function runCell(stateKey, actionKey, when) {
 const s = STATES[stateKey], a = ACTIONS[actionKey];
 const id = await s.build();
 const itemId = scalar('SELECT id FROM subscription_items WHERE subscription_id=?', id);
 // The open admin lists exist before the action, so the check also proves they are refreshed.
 for (const date of ['2027-02-05', '2027-02-12', '2027-02-19']) await generate(date);
 const instant = when === 'before' ? SETUP : when === 'minus1' ? shift(cutoffOf(s.next), -60) : shift(cutoffOf(s.next), 60);
 at(instant);
 const before = snapshot(id), mark = outboxMark();
 const exp = expected(stateKey, actionKey, when);
 const response = actionKey === 'address'
  ? await api('/api/account', a.body(s, itemId), { method: 'PATCH', cookie: session() })
  : await api('/api/account/subscriptions/' + id, { action: a.action ?? actionKey, expectedVersion: before.version, ...a.body(s, itemId) }, { cookie: session(), method: 'PATCH' });
 const after = snapshot(id);

 if (exp.reject) {
  const [status, code] = exp.reject;
  assert.equal(response.status, status, JSON.stringify(response.body));
  assert.equal(response.body.error?.code, code, JSON.stringify(response.body));
  assert.deepEqual(after.skips, before.skips, 'a rejected action adds no skip');
  assert.equal(after.orders, before.orders, 'a rejected action creates no order/charge');
  assert.equal(after.credits, before.credits, 'a rejected action creates no credit');
  assert.equal(after.quantity, before.quantity, 'a rejected action keeps the quantity');
  // Reaching a passed deadline materializes the lock (a pause that has ended turns active there).
  if (code !== 'DELIVERY_LOCKED' || stateKey !== 'paused') assert.equal(after.status, before.status, 'a rejected action keeps the status');
  assert.equal(after.renewal, before.renewal, 'a rejected action keeps renewal');
  assert.equal(after.address, before.address, 'a rejected address change is not half-applied');
  assert.equal(scalar("SELECT COUNT(*) FROM outbox WHERE topic LIKE 'subscription.%' AND rowid > ?", mark), 0, 'no customer notification for a rejected action');
  if (code === 'DELIVERY_LOCKED') {
   // The locked list of the delivery whose deadline passed keeps this stop exactly as it was.
   const locked = await stop(s.next, id);
   assert.ok(locked, 'the stop stays on the locked list of ' + s.next);
   assert.equal(locked.litres, 2);
   assert.equal(locked.address, 'Test ulica 1');
   assert.equal(locked.routeStatus, 'locked');
  } else {
   assert.equal(after.version, before.version, 'a rejected action does not bump the version');
   assert.equal(after.next, before.next, 'a rejected action keeps the next delivery date');
  }
  return;
 }

 const ok = exp.ok;
 expectStatus(response);
 if (ok.addressOnly) {
  assert.equal(after.address, 'Nova adresa 5');
  if (ok.subscriptionUntouched) {
   assert.equal(after.version, before.version);
   assert.equal(await stop(s.next, id), null);
  } else {
   assert.equal(after.version, before.version + 1, 'the address change bumps the subscription version');
   assert.equal(JSON.parse(after.shipping).addressLine1, 'Nova adresa 5');
   const target = stateKey === 'skipped' || stateKey === 'paused' ? '2027-02-12' : '2027-02-05';
   at(shift(cutoffOf(target), 60));
   const locked = await stop(target, id);
   assert.equal(locked?.address, 'Nova adresa 5', 'the driver list at the deadline carries the new address');
  }
  assert.equal(scalar("SELECT COUNT(*) FROM outbox WHERE topic LIKE 'subscription.%' AND rowid > ?", mark), 0);
  assert.equal(scalar("SELECT COUNT(*) FROM audit_log WHERE action='profile.updated'"), 1);
  return;
 }
 // (1) database
 assert.equal(response.body.version, before.version + 1);
 assert.equal(after.version, before.version + 1);
 assert.equal(after.status, ok.status);
 assert.equal(after.next, ok.next);
 assert.equal(Boolean(after.renewal), ok.renewal);
 if (ok.skips) assert.deepEqual(after.skips, ok.skips);
 assert.equal(after.credits, 0, 'no credit: a prepaid package keeps its deliveries');
 if (ok.packageStatus) assert.equal(scalar('SELECT status FROM subscription_packages WHERE subscription_id=?', id), ok.packageStatus);
 if (ok.surcharge) {
  assert.equal(after.orders, before.orders + 1, 'one surcharge order');
  const sc = rows('SELECT ps.*, o.total_minor, o.payment_status, o.kind FROM package_surcharges ps JOIN orders o ON o.id=ps.order_id WHERE ps.subscription_id=?', id);
  assert.equal(sc.length, 1);
  assert.deepEqual([sc[0].scope, sc[0].deliveries, sc[0].amount_minor, sc[0].total_minor, sc[0].kind, sc[0].payment_status], [ok.surcharge.scope, ok.surcharge.deliveries, ok.surcharge.amount, ok.surcharge.amount, 'adjustment', ok.surcharge.paymentStatus]);
  assert.equal(after.quantity, ok.itemQuantity);
  assert.equal(outboxCount('order.created', mark), 1);
 } else assert.equal(after.orders, before.orders, 'no new order or charge');
 // (2) what the customer sees
 const acc = (await account()).subscriptions.find((x) => x.id === id);
 assert.equal(acc.status, ok.status);
 assert.equal(acc.nextDeliveryDate, ok.next);
 assert.equal(acc.renewalEnabled, ok.renewal);
 assert.equal(acc.version, after.version);
 if (ok.summary === null) assert.equal(acc.packageSummary, null);
 else if (ok.summary) assert.deepEqual([acc.packageSummary.purchased, acc.packageSummary.realized, acc.packageSummary.remaining], ok.summary);
 // (3) admin delivery list (open projection, refreshed by the mutation)
 for (const date of ok.absent ?? []) assert.equal(await stop(date, id), null, 'no stop on ' + date);
 for (const [date, litres] of Object.entries(ok.present ?? {})) {
  const st = await stop(date, id);
  assert.ok(st, 'stop present on ' + date);
  assert.equal(st.litres, litres, 'litres on ' + date);
 }
 // (4) outbox: exactly one notification of the right topic
 assert.equal(outboxCount(ok.topic, mark), 1, ok.topic);
 assert.equal(scalar("SELECT COUNT(*) FROM outbox WHERE topic LIKE 'subscription.%' AND rowid > ?", mark), 1, 'exactly one subscription event');
}

// Cells that fail because the application misbehaves (kept failing on purpose, see the report).
const KNOWN_BUGS = {
 'paused|resume|plus1': 'manual resume after the cutoff drops the already-due 2027-02-12 delivery from the route that is about to lock',
};
for (const [stateKey, state] of Object.entries(STATES)) {
 for (const [actionKey, action] of Object.entries(ACTIONS)) {
  const moments = action.boundary ? ['before', 'minus1', 'plus1'] : ['before', 'plus1'];
  for (const when of moments) {
   const label = { before: 'well before cutoff', minus1: '1 min before cutoff', plus1: '1 min after cutoff (page loaded before it)' }[when];
   const exp = expected(stateKey, actionKey, when);
   const outcomeLabel = exp.reject ? `→ ${exp.reject[0]} ${exp.reject[1]}` : '→ allowed';
   const bug = KNOWN_BUGS[`${stateKey}|${actionKey}|${when}`];
   test(`C matrix: [${state.label}] × ${actionKey} — ${label} ${outcomeLabel}${bug ? ' — BUG: ' + bug : ''}`, () => runCell(stateKey, actionKey, when));
  }
 }
}
