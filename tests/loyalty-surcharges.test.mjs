import assert from 'node:assert/strict';
import { beforeEach, afterEach, test } from 'node:test';
import { register } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { createDatabase } from './sqlite-d1.mjs';

// Final specification, sections 12 (Moj nalog) and 13 (program lojalnosti), against the real
// API routes and SQLite: add-only package changes with surcharges, weekly-only subscriptions,
// renewal after four realized deliveries, and the 12-delivery loyalty reward end to end.
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
 database.raw.exec("UPDATE products SET is_active=1, allow_subscription=1; UPDATE products SET price_minor=35000, subscription_price_minor=25000 WHERE id='prod_kravlje_1l'; UPDATE products SET price_minor=15000, subscription_price_minor=15000 WHERE id='prod_jogurt_1l';");
 database.raw.exec(`UPDATE settings SET value_json='"2026-09-01"' WHERE key='loyaltyStartDate'`);
});
afterEach(() => { database.close(); globalThis.Date = realDate; });
async function api(path, data, { method = 'POST', admin = false, cookie, key = randomUUID(), extra = {} } = {}) {
 const headers = { 'content-type': 'application/json', Origin: 'http://localhost', 'Idempotency-Key': key, ...extra };
 if (admin) headers['x-admin-secret'] = env.ADMIN_SECRET;
 if (cookie) headers.cookie = cookie;
 const res = await worker.fetch(new Request('http://localhost' + path, { method, headers, ...(method !== 'GET' ? { body: JSON.stringify(data) } : {}) }), env, { waitUntil() {}, passThroughOnException() {} });
 const text = await res.text();
 let body; try { body = JSON.parse(text); } catch { body = text; }
 return { status: res.status, body, headers: res.headers };
}
const scalar = (sql, ...args) => Object.values(database.raw.prepare(sql).get(...args) ?? { value: null })[0];
const rows = (sql, ...args) => database.raw.prepare(sql).all(...args);
function expectStatus(r, status = 200) { assert.equal(r.status, status, JSON.stringify(r.body)); return r.body; }
function expectError(r, status, code) { assert.equal(r.status, status, JSON.stringify(r.body)); assert.equal(r.body.error.code, code); return r.body; }
function line(quantity = 2, cadence = 'weekly', productId = 'prod_kravlje_1l', purchaseType = 'subscription') { return { productId, quantity, purchaseType, ...(purchaseType === 'subscription' ? { cadence } : {}) }; }
function customer(email = 'ana@example.test') { return { email, fullName: 'Ana Test', phone: '+381600000001', addressLine1: 'Test ulica 1', city: 'Beograd', postalCode: '11000' }; }
async function buy(items = [line()], extra = {}, email = 'ana@example.test') {
 return expectStatus(await api('/api/checkout', { customer: customer(email), items, paymentMethod: 'card', paymentToken: 'mock-token', deliveryDate: '2027-01-01', ...extra }), 201);
}
function session(email = 'ana@example.test') {
 const c = database.raw.prepare('SELECT id,email FROM customers WHERE email = ?').get(email);
 const token = randomUUID() + randomUUID();
 database.raw.prepare("INSERT INTO auth_tokens (id, customer_id,email,token_hash,kind,expires_at) VALUES (?,?,?,?,'session','2030-01-01T00:00:00Z')").run(randomUUID(), c.id, c.email, createHash('sha256').update(token).digest('base64url'));
 return 'mm_session=' + token;
}
async function mutate(id, action, details = {}, cookie = session()) {
 return api('/api/account/subscriptions/' + id, { action, expectedVersion: scalar('SELECT version FROM subscriptions WHERE id=?', id), ...details }, { cookie, method: 'PATCH' });
}
async function delivery(date) { return expectStatus(await api('/api/admin/deliveries', { action: 'generate', date }, { admin: true })); }
async function handover(date, status = 'delivered') {
 at(date + 'T10:00:00Z');
 const snapshot = await delivery(date);
 for (const order of snapshot.orders) expectStatus(await api('/api/admin/deliveries', { action: 'complete', id: order.id, status, ...(status === 'delivered' ? { cashCollected: false } : {}) }, { admin: true }));
 return snapshot;
}
const account = async (cookie = session()) => expectStatus(await api('/api/account', null, { method: 'GET', cookie }));
/** Earlier realized subscription visits (fixtures), so a real 12th handover can be exercised quickly. */
function pastVisits(dates, status = 'delivered', email = 'ana@example.test') {
 const c = database.raw.prepare('SELECT id FROM customers WHERE email = ?').get(email);
 const sub = database.raw.prepare('SELECT id FROM subscriptions WHERE customer_id = ?').get(c.id);
 for (const date of dates) {
  let deliveryId = scalar('SELECT id FROM deliveries WHERE delivery_date = ?', date);
  if (!deliveryId) { deliveryId = randomUUID(); database.raw.prepare("INSERT INTO deliveries (id, delivery_date, cutoff_at, status, generated_at, generation_key) VALUES (?, ?, ?, 'completed', ?, ?)").run(deliveryId, date, date + 'T00:00:00Z', date + 'T00:00:00Z', 'fixture:' + randomUUID()); }
  database.raw.prepare("INSERT INTO delivery_orders (id, delivery_id, subscription_id, customer_id, customer_snapshot_json, status) VALUES (?, ?, ?, ?, '{}', ?)").run(randomUUID(), deliveryId, sub.id, c.id, status);
 }
}
const fridays = (from, count) => Array.from({ length: count }, (_, i) => new realDate(realDate.parse(from + 'T12:00:00Z') + i * 7 * 86_400_000).toISOString().slice(0, 10));

test('weekly only: new biweekly checkouts, quotes and account changes are rejected with 422', async () => {
 expectError(await api('/api/cart', { items: [line(2, 'biweekly')], deliveryDate: '2027-01-01' }), 422, 'CADENCE_UNAVAILABLE');
 expectError(await api('/api/checkout', { customer: customer(), items: [line(2, 'biweekly')], paymentMethod: 'cash', deliveryDate: '2027-01-01' }), 422, 'CADENCE_UNAVAILABLE');
 const order = await buy();
 const id = order.subscription.id, itemId = scalar('SELECT id FROM subscription_items');
 expectError(await mutate(id, 'add_item', { productId: 'prod_jogurt_1l', quantity: 1, cadence: 'biweekly' }), 422, 'CADENCE_UNAVAILABLE');
 expectError(await mutate(id, 'update_item', { itemId, cadence: 'biweekly' }), 422, 'CADENCE_UNAVAILABLE');
 expectError(await mutate(id, 'slow_down'), 422, 'CADENCE_UNAVAILABLE');
 assert.equal(scalar("SELECT COUNT(*) FROM subscription_items WHERE cadence='biweekly'"), 0);
});

test('legacy biweekly subscriptions keep running until their package ends', async () => {
 await buy();
 // An existing (pre-spec) biweekly package of two deliveries.
 database.raw.exec("UPDATE order_items SET cadence='biweekly'; UPDATE subscription_items SET cadence='biweekly'; UPDATE package_lines SET required_deliveries=2;");
 await handover('2027-01-01');
 assert.equal((await delivery('2027-01-08')).orders.length, 0);
 await handover('2027-01-15');
 assert.equal(scalar('SELECT status FROM subscription_packages'), 'completed');
});

test('paid quantity cannot be reduced; package shows purchased, realized and remaining deliveries', async () => {
 const order = await buy();
 const id = order.subscription.id, itemId = scalar('SELECT id FROM subscription_items');
 expectError(await mutate(id, 'update_item', { itemId, quantity: 1 }), 422, 'QUANTITY_DECREASE_NOT_ALLOWED');
 expectError(await mutate(id, 'remove_item', { itemId }), 422, 'QUANTITY_DECREASE_NOT_ALLOWED');
 await handover('2027-01-01');
 at('2027-01-03T10:00:00Z');
 expectStatus(await mutate(id, 'skip_next'));
 await handover('2027-01-15');
 at('2027-01-16T10:00:00Z');
 const summary = (await account()).subscriptions[0].packageSummary;
 assert.deepEqual([summary.purchased, summary.realized, summary.remaining], [4, 2, 2], 'a skipped slot does not consume the package');
 assert.equal(scalar('SELECT COUNT(*) FROM credits_ledger'), 0, 'no credit or refund for the skip itself');
 assert.equal(scalar('SELECT quantity FROM subscription_items'), 2);
});

test('regular addition after two realized deliveries: +3 L × 250 RSD × 2 remaining = 1500 RSD, delivered on both', async () => {
 const order = await buy();
 const id = order.subscription.id, itemId = scalar('SELECT id FROM subscription_items');
 await handover('2027-01-01'); await handover('2027-01-08');
 at('2027-01-10T10:00:00Z');
 expectError(await mutate(id, 'update_item', { itemId, quantity: 5, scope: 'regular', expectedAmountMinor: 75000 }), 409, 'SURCHARGE_CHANGED');
 const result = expectStatus(await mutate(id, 'update_item', { itemId, quantity: 5, scope: 'regular', expectedAmountMinor: 150000 }));
 assert.deepEqual([result.surcharge.currentQuantity, result.surcharge.newQuantity, result.surcharge.unitPriceMinor, result.surcharge.perDeliveryMinor, result.surcharge.deliveries, result.surcharge.amountMinor], [2, 5, 25000, 75000, 2, 150000]);
 assert.equal(result.appliesTo, 'package_and_onward');
 const surchargeOrder = rows('SELECT * FROM orders WHERE id = ?', result.surcharge.orderId)[0];
 assert.equal(surchargeOrder.kind, 'adjustment');
 assert.equal(surchargeOrder.total_minor, 150000);
 assert.equal(scalar("SELECT COUNT(*) FROM audit_log WHERE action='package.surcharge_created'"), 1);
 assert.equal(scalar('SELECT quantity FROM subscription_items'), 5, 'onward: the next package uses 5 L');
 const third = await handover('2027-01-15');
 assert.equal(third.preparation.reduce((sum, item) => sum + Number(item.total_quantity), 0), 5);
 assert.ok(third.orders[0].items.some(item => item.source_type === 'surcharge' && item.quantity === 3));
 await handover('2027-01-22');
 assert.equal(scalar('SELECT status FROM subscription_packages WHERE order_id = ?', order.order.id), 'completed');
 assert.equal(scalar('SELECT status FROM package_surcharges'), 'completed');
 assert.equal(scalar("SELECT SUM(COALESCE(di.delivered_quantity, di.quantity)) FROM delivery_items di JOIN delivery_orders dor ON dor.id = di.delivery_order_id WHERE dor.status = 'delivered'"), 2 + 2 + 5 + 5);
 const orders = (await account()).orders;
 assert.deepEqual(orders.map(o => o.role).sort(), ['package', 'surcharge']);
 assert.equal(orders.find(o => o.role === 'surcharge').surcharge.amountMinor, 150000);
});

test('one-time addition: +3 L only for the next delivery = 750 RSD, and it follows a skip', async () => {
 const order = await buy();
 const id = order.subscription.id;
 const result = expectStatus(await mutate(id, 'add_quantity', { productId: 'prod_kravlje_1l', quantity: 3, scope: 'next_only', expectedAmountMinor: 75000 }));
 assert.equal(result.surcharge.amountMinor, 75000);
 assert.equal(result.surcharge.deliveries, 1);
 assert.equal(scalar('SELECT quantity FROM subscription_items'), 2, 'one-time does not change the regular quantity');
 expectStatus(await mutate(id, 'skip_next'));
 assert.equal((await delivery('2027-01-01')).orders.length, 0);
 const next = await handover('2027-01-08');
 assert.equal(next.preparation.reduce((sum, item) => sum + Number(item.total_quantity), 0), 5);
 const after = await delivery('2027-01-15');
 assert.equal(after.preparation.reduce((sum, item) => sum + Number(item.total_quantity), 0), 2);
});

test('renewal starts only after all four deliveries are realized, never on a calendar date', async () => {
 const order = await buy();
 const id = order.subscription.id;
 await handover('2027-01-01');
 at('2027-01-03T10:00:00Z');
 expectStatus(await mutate(id, 'pause', { pauseUntil: '2027-02-01' }));
 for (const month of ['2027-01', '2027-02']) {
  const run = expectStatus(await api('/api/jobs/billing', { month }, { admin: true }));
  assert.equal(run.results[0].skipped, 'unfinished_package');
 }
 assert.equal(scalar('SELECT COUNT(*) FROM subscription_packages'), 1);
 await handover('2027-02-05'); await handover('2027-02-12');
 at('2027-02-13T10:00:00Z');
 assert.equal(expectStatus(await api('/api/jobs/billing', { month: '2027-02' }, { admin: true })).results[0].skipped, 'unfinished_package', 'three of four realized: still no renewal');
 await handover('2027-02-19');
 assert.equal(scalar('SELECT status FROM subscription_packages WHERE order_id = ?', order.order.id), 'completed');
 at('2027-02-20T10:00:00Z');
 const renewal = expectStatus(await api('/api/jobs/billing', { month: '2027-02' }, { admin: true }));
 assert.ok(renewal.results[0].orderId, JSON.stringify(renewal));
 assert.equal(scalar('SELECT COUNT(*) FROM subscription_packages'), 2);
});

test('loyalty counts only realized subscription deliveries since the start date; skip, pause and failure do not count', async () => {
 const order = await buy();
 pastVisits(fridays('2026-08-07', 3)); // before loyaltyStartDate (2026-09-01): never counted
 pastVisits(fridays('2026-09-04', 5));
 pastVisits(['2026-10-09'], 'failed');
 pastVisits(['2026-10-16'], 'locked');
 let loyalty = (await account()).loyalty;
 assert.deepEqual([loyalty.progress, loyalty.remaining, loyalty.target], [5, 7, 12]);
 expectStatus(await mutate(order.subscription.id, 'skip_next'));
 at('2027-01-02T10:00:00Z');
 expectStatus(await mutate(order.subscription.id, 'pause', { pauseUntil: '2027-01-20' }));
 loyalty = (await account()).loyalty;
 assert.equal(loyalty.progress, 5, 'skipped and paused slots are not counted');
 await handover('2027-01-22', 'failed');
 await handover('2027-01-29');
 loyalty = (await account()).loyalty;
 assert.equal(loyalty.progress, 6);
 assert.equal(loyalty.rewards.length, 0);
});

test('12th realized delivery unlocks 2 L + free delivery once and enqueues the email in the same transaction', async () => {
 await buy();
 pastVisits(fridays('2026-09-04', 11));
 assert.equal((await account()).loyalty.progress, 11);
 const snapshot = await handover('2027-01-01');
 assert.equal(scalar('SELECT COUNT(*) FROM loyalty_rewards'), 1);
 const reward = rows('SELECT * FROM loyalty_rewards')[0];
 assert.deepEqual([reward.status, reward.cycle_number, reward.gift_quantity, reward.delivery_discount_minor, reward.gift_product_id], ['unlocked', 1, 2, 35000, 'prod_kravlje_1l']);
 const outbox = rows("SELECT * FROM outbox WHERE topic='email.loyalty_reward_unlocked.requested'");
 assert.equal(outbox.length, 1);
 assert.equal(JSON.parse(outbox[0].payload_json).email, 'ana@example.test');
 assert.equal(scalar("SELECT COUNT(*) FROM audit_log WHERE action='loyalty.reward_unlocked'"), 1);
 // Repeated confirmation and account loads never unlock or email twice.
 expectStatus(await api('/api/admin/deliveries', { action: 'complete', id: snapshot.orders[0].id, status: 'delivered' }, { admin: true }));
 const loyalty = (await account()).loyalty;
 assert.equal(loyalty.progress, 0, 'a new cycle starts after the 12th delivery');
 assert.equal(loyalty.available.status, 'unlocked');
 assert.equal(scalar("SELECT COUNT(*) FROM outbox WHERE topic='email.loyalty_reward_unlocked.requested'"), 1);
 // The email text renders through the existing adapter (console in dev).
 expectStatus(await api('/api/admin/integrations', { action: 'process' }, { admin: true }));
 assert.equal(scalar("SELECT subject FROM message_deliveries WHERE outbox_id = ?", outbox[0].id), 'Tvoj poklon je spreman!');
});

test('claim → apply → gift of 2 L at 0 RSD in preparation and Spoke export → used once, free delivery credited at renewal', async () => {
 const order = await buy();
 pastVisits(fridays('2026-09-04', 11));
 await handover('2027-01-01');
 const rewardId = scalar('SELECT id FROM loyalty_rewards');
 at('2027-01-03T10:00:00Z');
 const cookie = session();
 const claimed = expectStatus(await api('/api/account/loyalty', { action: 'claim', rewardId }, { cookie }));
 assert.equal(claimed.loyalty.available.status, 'claimed');
 assert.match(scalar('SELECT code FROM loyalty_rewards'), /^VERNOST-/);
 const applied = expectStatus(await api('/api/account/loyalty', { action: 'apply', rewardId }, { cookie }));
 assert.equal(applied.loyalty.rewards[0].status, 'applied');
 expectError(await api('/api/account/loyalty', { action: 'apply', rewardId }, { cookie }), 409, 'LOYALTY_REWARD_UNAVAILABLE');
 at('2027-01-08T10:00:00Z');
 const snapshot = await delivery('2027-01-08');
 const gift = snapshot.orders[0].items.find(item => item.source_type === 'loyalty_gift');
 assert.ok(gift, 'gift line attached to the next delivery');
 assert.deepEqual([gift.quantity, gift.unit_price_minor, gift.product_id], [2, 0, 'prod_kravlje_1l']);
 assert.ok(snapshot.preparation.some(item => /poklon za vernost/.test(item.product_name) && Number(item.total_quantity) === 2));
 const csv = (await api('/api/admin/deliveries/export?date=2027-01-08', null, { admin: true, method: 'GET' })).body;
 assert.match(String(csv), /2 x Kravlje mleko \(poklon za vernost\)|poklon za vernost/);
 expectStatus(await api('/api/admin/deliveries', { action: 'complete', id: snapshot.orders[0].id, status: 'delivered' }, { admin: true }));
 const used = rows('SELECT * FROM loyalty_rewards')[0];
 assert.equal(used.status, 'used');
 assert.equal(used.used_delivery_order_id, snapshot.orders[0].id);
 assert.equal(scalar("SELECT amount_minor FROM credits_ledger WHERE reason = ?", 'loyalty_reward:' + rewardId), 35000);
 // Delivered package milk stays as paid: still 4 × 2 L of the package plus the 2 L gift.
 await handover('2027-01-15'); await handover('2027-01-22');
 assert.equal(scalar('SELECT status FROM subscription_packages WHERE order_id = ?', order.order.id), 'completed');
 assert.equal((await delivery('2027-01-29')).orders.length, 0, 'the gift is never delivered twice');
 at('2027-01-23T10:00:00Z');
 const renewal = expectStatus(await api('/api/jobs/billing', { month: '2027-01' }, { admin: true })).results[0];
 assert.equal(renewal.creditAppliedMinor, 35000, 'the 350 RSD free delivery is deducted at the next charge');
 assert.equal(scalar("SELECT COUNT(*) FROM credits_ledger WHERE reason LIKE 'loyalty_reward:%'"), 1);
 assert.equal(scalar("SELECT status FROM credits_ledger WHERE reason LIKE 'loyalty_reward:%'"), 'applied');
});

test('skip or failed handover after apply carries the reward to the next realized delivery; no double use', async () => {
 const order = await buy();
 pastVisits(fridays('2026-09-04', 11));
 await handover('2027-01-01');
 const rewardId = scalar('SELECT id FROM loyalty_rewards');
 at('2027-01-03T10:00:00Z');
 const cookie = session();
 expectStatus(await api('/api/account/loyalty', { action: 'claim', rewardId }, { cookie }));
 expectStatus(await api('/api/account/loyalty', { action: 'apply', rewardId }, { cookie }));
 expectStatus(await mutate(order.subscription.id, 'skip_next', {}, cookie));
 assert.equal((await delivery('2027-01-08')).orders.length, 0);
 assert.equal(scalar('SELECT status FROM loyalty_rewards'), 'applied');
 const failed = await handover('2027-01-15', 'failed');
 assert.ok(failed.orders[0].items.some(item => item.source_type === 'loyalty_gift'));
 assert.equal(scalar('SELECT status FROM loyalty_rewards'), 'applied', 'a failed handover does not consume it');
 const realized = await handover('2027-01-22');
 assert.ok(realized.orders[0].items.some(item => item.source_type === 'loyalty_gift'));
 assert.equal(scalar('SELECT status FROM loyalty_rewards'), 'used');
 const later = await delivery('2027-01-29');
 assert.ok(!later.orders.flatMap(o => o.items).some(item => item.source_type === 'loyalty_gift'));
 assert.equal(scalar("SELECT COUNT(*) FROM delivery_items di JOIN delivery_orders dor ON dor.id = di.delivery_order_id WHERE di.loyalty_reward_id IS NOT NULL AND dor.status = 'delivered'"), 1);
});

test('concurrent applies and a second reward on the same delivery are rejected; reward is bound to its account', async () => {
 await buy();
 await buy([line()], {}, 'boris@example.test');
 database.raw.exec(`UPDATE settings SET value_json='"2026-01-01"' WHERE key='loyaltyStartDate'`);
 pastVisits(fridays('2026-01-02', 23));
 await handover('2027-01-01');
 assert.equal(scalar("SELECT COUNT(*) FROM loyalty_rewards WHERE customer_id = (SELECT id FROM customers WHERE email='ana@example.test')"), 1);
 await account(); // catch-up sync: 24 realized → second cycle reward
 const [first, second] = rows("SELECT id FROM loyalty_rewards ORDER BY cycle_number").map(r => r.id);
 assert.ok(second, 'a new cycle never deletes the earlier unused reward');
 at('2027-01-03T10:00:00Z');
 const ana = session(), boris = session('boris@example.test');
 // Another account can neither see, claim, apply nor spend the reward (or its code).
 expectError(await api('/api/account/loyalty', { action: 'claim', rewardId: first }, { cookie: boris }), 404, 'LOYALTY_REWARD_NOT_FOUND');
 expectError(await api('/api/account/loyalty', { action: 'apply', rewardId: first }, { cookie: boris }), 404, 'LOYALTY_REWARD_NOT_FOUND');
 expectError(await api('/api/cart', { items: [line()], loyaltyRewardId: first }, { cookie: boris }), 404, 'LOYALTY_REWARD_NOT_FOUND');
 expectError(await api('/api/cart', { items: [line()], loyaltyRewardId: first }), 401, 'AUTH_REQUIRED');
 const outcomes = await Promise.all([first, first].map(rewardId => api('/api/account/loyalty', { action: 'apply', rewardId }, { cookie: ana })));
 assert.deepEqual(outcomes.map(r => r.status).sort(), [200, 409]);
 expectError(await api('/api/account/loyalty', { action: 'apply', rewardId: second }, { cookie: ana }), 409, 'LOYALTY_ALREADY_APPLIED');
 assert.equal(scalar("SELECT COUNT(*) FROM loyalty_rewards WHERE status='applied'"), 1);
 assert.equal(scalar("SELECT status FROM loyalty_rewards WHERE id = ?", second), 'unlocked');
});

test('checkout with the reward: delivery −350 RSD and 2 L gift on that order, owner only, quote equals charge', async () => {
 await buy();
 pastVisits(fridays('2026-09-04', 11));
 await handover('2027-01-01');
 const rewardId = scalar('SELECT id FROM loyalty_rewards');
 at('2027-01-03T10:00:00Z');
 const cookie = session();
 const oneTime = [line(3, null, 'prod_jogurt_1l', 'one_time')];
 const quote = expectStatus(await api('/api/cart', { items: oneTime, deliveryDate: '2027-01-08', loyaltyRewardId: rewardId }, { cookie }));
 assert.deepEqual([quote.loyalty.deductedNowMinor, quote.loyalty.giftQuantity], [35000, 2]);
 assert.equal(quote.totalMinor, 3 * 15000 + 35000 - 35000);
 const body = { customer: customer(), items: oneTime, paymentMethod: 'cash', deliveryDate: '2027-01-08', loyaltyRewardId: rewardId };
 expectError(await api('/api/checkout', { ...body, customer: customer('other@example.test') }, { cookie }), 403, 'LOYALTY_ACCOUNT_MISMATCH');
 expectError(await api('/api/checkout', body), 401, 'AUTH_REQUIRED');
 const result = expectStatus(await api('/api/checkout', body, { cookie }), 201);
 assert.equal(result.order.totalMinor, quote.totalMinor);
 assert.equal(result.order.deliveryFeeMinor, 0);
 const reward = rows('SELECT * FROM loyalty_rewards')[0];
 assert.deepEqual([reward.status, reward.applied_order_id, reward.discount_status], ['applied', result.order.id, 'deducted']);
 expectError(await api('/api/checkout', { ...body }, { cookie }), 409, 'LOYALTY_REWARD_UNAVAILABLE');
 const snapshot = await handover('2027-01-08');
 const oneTimeOrder = snapshot.orders.find(o => o.source_order_id === result.order.id);
 assert.ok(oneTimeOrder.items.some(item => item.source_type === 'loyalty_gift' && item.quantity === 2 && item.unit_price_minor === 0));
 assert.equal(scalar('SELECT status FROM loyalty_rewards'), 'used');
 assert.equal(scalar("SELECT COUNT(*) FROM credits_ledger WHERE reason LIKE 'loyalty_reward:%'"), 0, 'already deducted in the order: no second deduction');
});

test('the 2-litre minimum is a shop setting: cart and checkout reject 1 L, accept 2 L', async () => {
 database.raw.exec(`INSERT INTO settings (key, value_json) VALUES ('minimumLitres', '2') ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json`);
 const one = [line(1, null, 'prod_kravlje_1l', 'one_time')];
 expectError(await api('/api/cart', { items: one, deliveryDate: '2027-01-01' }), 422, 'MINIMUM_QUANTITY');
 expectError(await api('/api/checkout', { customer: customer(), items: one, paymentMethod: 'cash', deliveryDate: '2027-01-01' }), 422, 'MINIMUM_QUANTITY');
 expectError(await api('/api/checkout', { customer: customer(), items: [line(1)], paymentMethod: 'cash', deliveryDate: '2027-01-01' }), 422, 'MINIMUM_QUANTITY');
 assert.equal(scalar('SELECT count(*) FROM orders'), 0);
 expectStatus(await api('/api/cart', { items: [line(2, null, 'prod_kravlje_1l', 'one_time')], deliveryDate: '2027-01-01' }));
 await buy([line(2)]);
 assert.equal(scalar('SELECT count(*) FROM orders'), 1);
});

test('a finished package renews at once on the same weekday, even when the next delivery falls in the next month', async () => {
 const bought = await buy([line(2)], { deliveryDate: '2027-01-08' });
 for (const date of ['2027-01-08', '2027-01-15', '2027-01-22', '2027-01-29']) await handover(date);
 const renewal = expectStatus(await api('/api/jobs/billing', { month: '2027-01' }, { admin: true })).results[0];
 assert.equal(renewal.skipped, undefined, JSON.stringify(renewal));
 assert.equal(scalar('SELECT next_delivery_date FROM subscriptions WHERE id=?', bought.subscription.id), '2027-02-05');
 assert.equal(scalar("SELECT delivery_date FROM orders WHERE subscription_id=? AND kind='subscription_invoice' ORDER BY created_at DESC LIMIT 1", bought.subscription.id), '2027-02-05');
});

test('a next-delivery-only addition is closed by the handover it rode on', async () => {
 const bought = await buy([line(2)], { deliveryDate: '2027-01-08' });
 expectStatus(await mutate(bought.subscription.id, 'add_quantity', { productId: 'prod_kravlje_1l', quantity: 2, scope: 'next_only' }));
 assert.equal(scalar("SELECT status FROM package_surcharges WHERE scope='next_only'"), 'active');
 await handover('2027-01-08');
 assert.equal(scalar("SELECT status FROM package_surcharges WHERE scope='next_only'"), 'completed');
 assert.equal(scalar("SELECT o.fulfillment_status FROM orders o JOIN package_surcharges ps ON ps.order_id=o.id WHERE ps.scope='next_only'"), 'delivered');
});
