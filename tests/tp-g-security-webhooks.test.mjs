// TEST_PLAN Phase 2, section G: authorization (foreign IDs, no session, Origin, admin routes,
// staff roles, rate limits), the mock payment webhook (duplicate / late / out-of-order / cancelled /
// unknown / wrong secret, never two "paid" effects) and promo codes (one-time and package,
// amounts, usage limits, first purchase, interaction with the loyalty reward).
// Run: node --test tests/tp-g-security-webhooks.test.mjs   (uses the prebuilt dist/ bundle)
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import {
  setup, teardown, at, api, ok, fails, buy, sub, once, session, mutate, confirm, webhook, adminList,
  rows, one, scalar, env, customer, WEBHOOK, database,
} from './tp-efg-harness.mjs';

beforeEach(() => setup());
afterEach(() => teardown());

const ANA = 'tp-efg-ana@example.test';
const BORIS = 'tp-efg-boris@example.test';
const count = (sql, ...args) => Number(scalar(sql, ...args));
const snapshotDb = () => JSON.stringify({
  orders: rows('SELECT id, payment_status, fulfillment_status, customer_note, total_minor, updated_at FROM orders ORDER BY id'),
  subscriptions: rows('SELECT id, status, version, next_delivery_date, renewal_enabled, pause_until FROM subscriptions ORDER BY id'),
  items: rows('SELECT id, quantity, status FROM subscription_items ORDER BY id'),
  skips: rows('SELECT * FROM subscription_skips ORDER BY id'),
  refunds: rows('SELECT id, status FROM refund_requests ORDER BY id'),
  rewards: rows('SELECT id, status, applied_subscription_id, applied_order_id FROM loyalty_rewards ORDER BY id'),
  surcharges: rows('SELECT id, status FROM package_surcharges ORDER BY id'),
  credits: rows('SELECT id, status, amount_minor FROM credits_ledger ORDER BY id'),
  customers: rows('SELECT id, email, phone, address_line_1 FROM customers ORDER BY id'),
});

/** Ana: paid card package + surcharge + refund request + loyalty reward + a pending cash one-time order. Boris: his own package. */
async function twoCustomers() {
  at('2027-01-04T10:00:00Z');
  const anaPkg = await buy({ email: ANA, deliveryDate: '2027-01-12', paymentMethod: 'card' });
  const anaOnce = await buy({ email: ANA, items: [once(3)], deliveryDate: '2027-01-15' });
  const borisPkg = await buy({ email: BORIS, deliveryDate: '2027-01-12', paymentMethod: 'card' });
  const ana = session(ANA), boris = session(BORIS);
  const surcharge = ok(await mutate(anaPkg.subscription.id, 'add_quantity', { productId: 'prod_kravlje_1l', quantity: 1, scope: 'next_only' }, ana)).surcharge;
  const refund = ok(await api('/api/account/refunds', { orderId: anaPkg.order.id, reason: 'tp-efg test', idempotencyKey: 'tp-efg-refund-ana-0001' }, { cookie: ana }), 201);
  const anaId = scalar('SELECT id FROM customers WHERE email = ?', ANA);
  const rewardId = 'tp-efg-reward-ana';
  database.raw.prepare("INSERT INTO loyalty_rewards (id, customer_id, cycle_number, gift_product_id) VALUES (?, ?, 1, 'prod_kravlje_1l')").run(rewardId, anaId);
  return { anaPkg, anaOnce, borisPkg, ana, boris, surcharge, refund, rewardId, anaId };
}

// ─────────────────────────────────────────────────────────────────────────────────────────────
// G1 — foreign IDs on every customer route that takes an ID
// ─────────────────────────────────────────────────────────────────────────────────────────────
test('G1 route inventory: every /api/account/** and /api/orders/** route that takes an ID is covered by G2', () => {
  const routes = [];
  const walk = (dir) => { for (const name of readdirSync(dir)) { const path = join(dir, name); if (statSync(path).isDirectory()) walk(path); else if (name === 'route.ts') routes.push(path.replace(/\\/g, '/').replace(/^.*app\/api/, '/api').replace(/\/route\.ts$/, '')); } };
  walk(fileURLToPath(new URL('../app/api/account', import.meta.url)));
  walk(fileURLToPath(new URL('../app/api/orders', import.meta.url)));
  assert.deepEqual(routes.sort(), ['/api/account', '/api/account/login-settings', '/api/account/loyalty', '/api/account/orders/[id]', '/api/account/refunds', '/api/account/subscriptions/[id]', '/api/account/whatsapp', '/api/orders/convert-to-subscription'].sort(),
    'a new customer route appeared: add it to G2 (IDs in the path: orders/[id], subscriptions/[id]; IDs in the body: refunds.orderId, loyalty.rewardId/subscriptionId, convert-to-subscription.token)');
});

test('G2 a customer cannot read or change another customer\'s order, package, surcharge, subscription, refund request or loyalty reward by swapping the ID', async () => {
  const { anaPkg, anaOnce, ana, boris, surcharge, refund, rewardId } = await twoCustomers();
  const before = snapshotDb();
  const anaOrderIds = [anaPkg.order.id, anaOnce.order.id, surcharge.orderId];
  for (const id of anaOrderIds) {
    fails(await api('/api/account/orders/' + id, null, { method: 'GET', cookie: boris }), 404, 'ORDER_NOT_FOUND');
    fails(await api('/api/account/orders/' + id, { action: 'cancel' }, { method: 'PATCH', cookie: boris }), 404, 'ORDER_NOT_FOUND');
    fails(await api('/api/account/orders/' + id, { customerNote: 'tp-efg hijack' }, { method: 'PATCH', cookie: boris }), 404, 'ORDER_NOT_FOUND');
    fails(await api('/api/account/orders/' + id, { items: [{ productId: 'prod_kravlje_1l', quantity: 9 }] }, { method: 'PATCH', cookie: boris }), 404, 'ORDER_NOT_FOUND');
    fails(await api('/api/account/refunds?orderId=' + encodeURIComponent(id), null, { method: 'GET', cookie: boris }), 404, 'ORDER_NOT_FOUND');
    fails(await api('/api/account/refunds', { orderId: id, reason: 'tp-efg', idempotencyKey: randomUUID() }, { cookie: boris }), 404, 'ORDER_NOT_FOUND');
  }
  // Re-using Ana's refund idempotency key does not return her refund request.
  const replay = await api('/api/account/refunds', { orderId: anaPkg.order.id, reason: 'tp-efg', idempotencyKey: 'tp-efg-refund-ana-0001' }, { cookie: boris });
  assert.ok(replay.status >= 400 && replay.status < 500, JSON.stringify(replay.body));
  assert.ok(!JSON.stringify(replay.body).includes(refund.id), 'the foreign refund request is not echoed');
  const subId = anaPkg.subscription.id;
  const version = scalar('SELECT version FROM subscriptions WHERE id = ?', subId);
  for (const [action, details] of [['skip_next', {}], ['pause', { pauseUntil: '2027-02-01' }], ['resume', {}], ['cancel', {}], ['add_quantity', { productId: 'prod_kravlje_1l', quantity: 2, scope: 'regular' }], ['add_next_only', { productId: 'prod_kravlje_1l', quantity: 1 }], ['update_item', { itemId: scalar('SELECT id FROM subscription_items WHERE subscription_id = ?', subId), quantity: 5 }], ['add_item', { productId: 'prod_kravlje_1l', quantity: 1, cadence: 'weekly' }]]) {
    fails(await api('/api/account/subscriptions/' + subId, { action, expectedVersion: version, ...details }, { method: 'PATCH', cookie: boris }), 404, 'SUBSCRIPTION_NOT_FOUND');
  }
  for (const action of ['claim', 'apply']) fails(await api('/api/account/loyalty', { action, rewardId }, { cookie: boris }), 404, 'LOYALTY_REWARD_NOT_FOUND');
  // Boris's own (inserted) reward cannot be attached to Ana's subscription.
  const borisId = scalar('SELECT id FROM customers WHERE email = ?', BORIS);
  database.raw.prepare("INSERT INTO loyalty_rewards (id, customer_id, cycle_number, gift_product_id) VALUES ('tp-efg-reward-boris', ?, 1, 'prod_kravlje_1l')").run(borisId);
  const foreignSub = await api('/api/account/loyalty', { action: 'apply', rewardId: 'tp-efg-reward-boris', subscriptionId: subId }, { cookie: boris });
  assert.equal(foreignSub.status, 409, JSON.stringify(foreignSub.body));
  assert.equal(foreignSub.code, 'LOYALTY_NO_DELIVERY');
  database.raw.exec("DELETE FROM loyalty_rewards WHERE id = 'tp-efg-reward-boris'");
  fails(await api('/api/cart', { items: [once(2)], deliveryDate: '2027-01-15', loyaltyRewardId: rewardId }, { cookie: boris }), 404, 'LOYALTY_REWARD_NOT_FOUND');
  fails(await api('/api/checkout', { customer: customer(BORIS), items: [once(2)], paymentMethod: 'cash', deliveryDate: '2027-01-15', loyaltyRewardId: rewardId }, { cookie: boris }), 404, 'LOYALTY_REWARD_NOT_FOUND');
  fails(await api('/api/orders/convert-to-subscription', { token: 'x'.repeat(43), cadence: 'weekly' }), 401, 'INVALID_TOKEN');
  assert.equal(snapshotDb(), before, 'nothing of Ana changed');
  // Boris's own account shows none of Ana's identifiers.
  const borisAccount = JSON.stringify(ok(await api('/api/account', null, { method: 'GET', cookie: boris })));
  for (const id of [...anaOrderIds, subId, refund.id, rewardId, ANA, surcharge.id]) assert.ok(!borisAccount.includes(id), `Boris's account leaks ${id}`);
  // Ana still sees all of it.
  const anaAccount = JSON.stringify(ok(await api('/api/account', null, { method: 'GET', cookie: ana })));
  for (const id of [anaPkg.order.id, anaOnce.order.id, surcharge.orderId, subId, rewardId]) assert.ok(anaAccount.includes(id), `Ana's account shows ${id}`);
});

test('G3 no session: every customer route answers 401 and changes nothing; an expired or garbage cookie is the same', async () => {
  const { anaPkg, anaOnce, rewardId } = await twoCustomers();
  const before = snapshotDb();
  const calls = [
    ['/api/account', 'GET'], ['/api/account', 'PATCH', { phone: '+381611111111' }],
    ['/api/account/orders/' + anaOnce.order.id, 'GET'], ['/api/account/orders/' + anaOnce.order.id, 'PATCH', { action: 'cancel' }],
    ['/api/account/subscriptions/' + anaPkg.subscription.id, 'PATCH', { action: 'skip_next', expectedVersion: 1 }],
    ['/api/account/refunds?orderId=' + anaPkg.order.id, 'GET'], ['/api/account/refunds', 'POST', { orderId: anaPkg.order.id, reason: 'x', idempotencyKey: randomUUID() }],
    ['/api/account/loyalty', 'GET'], ['/api/account/loyalty', 'POST', { action: 'claim', rewardId }],
    ['/api/account/login-settings', 'GET'], ['/api/account/login-settings', 'PATCH', { action: 'disconnect' }],
    ['/api/account/whatsapp', 'POST', { phone: '+381601234567', consent: true }],
  ];
  const expired = (() => { const c = session(ANA); database.raw.exec("UPDATE auth_tokens SET expires_at = '2026-01-01T00:00:00Z' WHERE kind = 'session' AND customer_id = (SELECT id FROM customers WHERE email = '" + ANA + "') AND rowid = (SELECT MAX(rowid) FROM auth_tokens)"); return c; })();
  for (const cookie of [undefined, 'mm_session=' + 'A'.repeat(43), expired]) {
    for (const [path, method, body] of calls) {
      const result = await api(path, body ?? null, { method, cookie });
      assert.equal(result.status, 401, `${method} ${path} cookie=${cookie ? cookie.slice(0, 20) : 'none'} → ${result.status} ${JSON.stringify(result.body)}`);
      assert.ok(['AUTH_REQUIRED', 'INVALID_SESSION'].includes(result.code), `${method} ${path}: ${result.code}`);
    }
  }
  assert.equal(snapshotDb(), before);
});

test('G4 cookie writes without an exact Origin are refused (403 CSRF_REJECTED) on the subscription, loyalty and order routes and on checkout with a reward', async () => {
  const { anaPkg, anaOnce, ana, rewardId } = await twoCustomers();
  const before = snapshotDb();
  const writes = [
    ['/api/account/subscriptions/' + anaPkg.subscription.id, 'PATCH', { action: 'skip_next', expectedVersion: scalar('SELECT version FROM subscriptions WHERE id = ?', anaPkg.subscription.id) }],
    ['/api/account/loyalty', 'POST', { action: 'claim', rewardId }],
    ['/api/account/orders/' + anaOnce.order.id, 'PATCH', { action: 'cancel' }],
    ['/api/account/refunds', 'POST', { orderId: anaPkg.order.id, reason: 'x', idempotencyKey: randomUUID() }],
    ['/api/checkout', 'POST', { customer: customer(ANA), items: [once(2)], paymentMethod: 'cash', deliveryDate: '2027-01-15', loyaltyRewardId: rewardId }],
  ];
  for (const origin of [null, 'https://evil.example', 'http://localhost:3000', 'http://localhost.evil.example']) {
    for (const [path, method, body] of writes) {
      const result = await api(path, body, { method, cookie: ana, origin });
      assert.equal(result.status, 403, `${method} ${path} origin=${origin} → ${result.status} ${JSON.stringify(result.body)}`);
      assert.equal(result.code, 'CSRF_REJECTED');
    }
  }
  assert.equal(snapshotDb(), before);
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// G5 — admin routes without an admin session, with a customer session, and staff roles
// ─────────────────────────────────────────────────────────────────────────────────────────────
const OWNER = { email: 'tp-efg-owner@example.test', password: 'tp-efg-owner-password-2027' };
function realAdmin() {
  Object.assign(env, { ADMIN_EMAIL: OWNER.email, ADMIN_PASSWORD: OWNER.password });
  delete env.ADMIN_LEGACY_ACCESS; delete env.ADMIN_SECRET;
}
function adminRoutes() {
  const found = [];
  const walk = (dir) => { for (const name of readdirSync(dir)) { const path = join(dir, name); if (statSync(path).isDirectory()) walk(path); else if (name === 'route.ts') {
    const source = readFileSync(path, 'utf8');
    const methods = [...source.matchAll(/export\s+(?:async\s+)?function\s+(GET|POST|PATCH|PUT|DELETE)\b/g)].map((m) => m[1]);
    const url = path.replace(/\\/g, '/').replace(/^.*app\/api/, '/api').replace(/\/route\.ts$/, '').replace(/\[[^\]]+\]/g, 'tp-efg-x');
    for (const method of methods) found.push([url, method]);
  } } };
  walk(fileURLToPath(new URL('../app/api/admin', import.meta.url)));
  for (const job of ['billing', 'deliveries']) for (const method of ['POST']) found.push([`/api/jobs/${job}`, method]);
  return found.filter(([url]) => url !== '/api/admin/access');
}

test('G5a every admin route (and the admin job routes) refuses a caller without an admin session, with a customer cookie, or with a customer session token as Bearer', async () => {
  realAdmin();
  const { ana } = await twoCustomers();
  const customerToken = decodeURIComponent(ana.slice('mm_session='.length));
  const before = JSON.stringify([snapshotDb(), rows('SELECT key, value_json FROM settings ORDER BY key'), rows('SELECT * FROM promo_codes'), count('SELECT COUNT(*) FROM deliveries'), count('SELECT COUNT(*) FROM admin_users')]);
  const routes = adminRoutes();
  assert.ok(routes.length >= 50, `found ${routes.length} admin route handlers`);
  const leaks = [];
  for (const [url, method] of routes) {
    for (const [label, options] of [['none', {}], ['customer cookie', { cookie: ana }], ['customer bearer', { bearer: customerToken.slice(0, 43) }], ['customer bearer full', { headers: { authorization: 'Bearer ' + customerToken } }]]) {
      const body = method === 'GET' || method === 'DELETE' ? null : { action: 'generate', date: '2027-01-12', id: 'tp-efg-x', paymentStatus: 'paid', code: 'TPEFG', discountType: 'percent', discountValue: 50, holidays: ['2027-01-12'] };
      const result = await api(url, body, { method, ...options });
      if (!(result.status === 403 && ['ADMIN_FORBIDDEN', 'CSRF_REJECTED'].includes(result.code))) leaks.push(`${method} ${url} [${label}] → ${result.status} ${result.code ?? ''}`);
    }
  }
  assert.deepEqual(leaks, [], 'admin handlers that did not answer 403');
  const after = JSON.stringify([snapshotDb(), rows('SELECT key, value_json FROM settings ORDER BY key'), rows('SELECT * FROM promo_codes'), count('SELECT COUNT(*) FROM deliveries'), count('SELECT COUNT(*) FROM admin_users')]);
  assert.equal(after, before, 'no refused admin call changed data');
});

async function ownerToken() { return ok(await api('/api/admin/access', OWNER)).sessionToken; }
async function staff(owner, role) {
  const email = `tp-efg-${role}@example.test`, password = `tp-efg-${role}-password-1`;
  ok(await api('/api/admin/staff', { email, fullName: `TP EFG ${role}`, role, password }, { bearer: owner }));
  return ok(await api('/api/admin/access', { email, password })).sessionToken;
}
/** Sessions last 8 hours: log in again after moving the clock. */
async function staffLogin(role) { return ok(await api('/api/admin/access', { email: `tp-efg-${role}@example.test`, password: `tp-efg-${role}-password-1` })).sessionToken; }

test('G5b staff roles on delivery handover and cash: a driver confirms a handover but cannot record cash; finance can neither confirm nor record cash; only the owner changes route days', async () => {
  realAdmin();
  at('2027-01-08T10:00:00Z');
  const cash = await buy({ email: ANA, deliveryDate: '2027-01-12' });
  const card = await buy({ email: BORIS, deliveryDate: '2027-01-12', paymentMethod: 'card' });
  const owner = await ownerToken();
  for (const role of ['driver', 'finance', 'manager']) await staff(owner, role);
  at('2027-01-12T09:00:00Z');
  const driver = await staffLogin('driver'), finance = await staffLogin('finance'), manager = await staffLogin('manager');
  const list = ok(await api('/api/admin/deliveries?date=2027-01-12', null, { method: 'GET', bearer: driver }));
  const anaStop = list.orders.find((o) => o.subscription_id === cash.subscription.id);
  const borisStop = list.orders.find((o) => o.subscription_id === card.subscription.id);
  fails(await api('/api/admin/deliveries', { action: 'complete', id: anaStop.id, status: 'delivered', cashCollected: true }, { bearer: driver }), 403, 'ROLE_FORBIDDEN');
  assert.equal(scalar('SELECT payment_status FROM orders WHERE id = ?', cash.order.id), 'pending');
  fails(await api('/api/admin/deliveries', { action: 'complete', id: borisStop.id, status: 'delivered' }, { bearer: finance }), 403, 'ROLE_FORBIDDEN');
  ok(await api('/api/admin/deliveries', { action: 'complete', id: borisStop.id, status: 'delivered' }, { bearer: driver }));
  fails(await api('/api/admin/orders', { id: cash.order.id, paymentStatus: 'paid' }, { method: 'PATCH', bearer: driver }), 403, 'ROLE_FORBIDDEN');
  fails(await api('/api/admin/orders', { id: cash.order.id, paymentStatus: 'paid' }, { method: 'PATCH', bearer: finance }), 403, 'ROLE_FORBIDDEN');
  fails(await api('/api/admin/settings', { holidays: ['2027-01-19'] }, { method: 'PATCH', bearer: driver }), 403, 'ROLE_FORBIDDEN');
  fails(await api('/api/admin/settings', { holidays: ['2027-01-19'] }, { method: 'PATCH', bearer: finance }), 403, 'ROLE_FORBIDDEN');
  fails(await api('/api/admin/settings', { deliveryWeekdays: [5] }, { method: 'PATCH', bearer: manager }), 403, 'ROLE_FORBIDDEN');
  fails(await api('/api/admin/promos', { code: 'TPEFGROLE', discountType: 'percent', discountValue: 50 }, { bearer: driver }), 403, 'ROLE_FORBIDDEN');
  fails(await api('/api/admin/promos', { code: 'TPEFGROLE', discountType: 'percent', discountValue: 50 }, { bearer: finance }), 403, 'ROLE_FORBIDDEN');
  fails(await api('/api/admin/customers/' + scalar('SELECT id FROM customers WHERE email = ?', ANA), null, { method: 'GET', bearer: driver }), 403, 'ROLE_FORBIDDEN');
  assert.equal(count('SELECT COUNT(*) FROM promo_codes WHERE code = ?', 'TPEFGROLE'), 0);
  assert.deepEqual(JSON.parse(scalar("SELECT value_json FROM settings WHERE key = 'deliveryWeekdays'")), [2, 5]);
  // The manager records the cash with the handover; it is recorded once.
  ok(await api('/api/admin/deliveries', { action: 'complete', id: anaStop.id, status: 'delivered', cashCollected: true }, { bearer: manager }));
  assert.equal(scalar('SELECT payment_status FROM orders WHERE id = ?', cash.order.id), 'paid');
  assert.equal(count("SELECT COUNT(*) FROM outbox WHERE topic = 'fiscal.receipt.requested' AND aggregate_id = ?", cash.order.id), 1);
});

test('G5c [PITANJE] a driver may lock a route early (force) and regenerate lists: documented current behaviour', async () => {
  realAdmin();
  at('2027-01-08T10:00:00Z');
  await buy({ email: ANA, deliveryDate: '2027-01-12' });
  const owner = await ownerToken();
  const driver = await staff(owner, 'driver');
  ok(await api('/api/admin/deliveries', { action: 'generate', date: '2027-01-12' }, { bearer: driver }));
  const locked = await api('/api/admin/deliveries', { action: 'lock', date: '2027-01-12', force: true }, { bearer: driver });
  assert.equal(locked.status, 200, JSON.stringify(locked.body));
  assert.equal(scalar("SELECT status FROM deliveries WHERE delivery_date = '2027-01-12'"), 'locked', 'a driver closed customer changes 2 days before the cutoff');
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// G6 — rate limits exist on login and checkout
// ─────────────────────────────────────────────────────────────────────────────────────────────
test('G6a checkout is limited to 20 requests per IP per 10 minutes; another IP and the next window pass', async () => {
  at('2027-01-08T10:00:00Z');
  for (let i = 0; i < 20; i += 1) assert.notEqual((await api('/api/checkout', { items: [] }, { ip: '203.0.113.50' })).status, 429, `request ${i + 1}`);
  const limited = await api('/api/checkout', { customer: customer(), items: [once(2)], paymentMethod: 'cash', deliveryDate: '2027-01-12' }, { ip: '203.0.113.50' });
  fails(limited, 429, 'RATE_LIMITED');
  assert.ok(limited.body.error.details.retryAfter > 0 && limited.body.error.details.retryAfter <= 600);
  assert.equal(count('SELECT COUNT(*) FROM orders'), 0, 'the throttled checkout created nothing');
  ok(await api('/api/checkout', { customer: customer(), items: [once(2)], paymentMethod: 'cash', deliveryDate: '2027-01-12' }, { ip: '203.0.113.51' }), 201);
  at('2027-01-08T10:10:01Z');
  ok(await api('/api/checkout', { customer: customer('tp-efg-later@example.test'), items: [once(2)], paymentMethod: 'cash', deliveryDate: '2027-01-12' }, { ip: '203.0.113.50' }), 201);
});

test('G6b login limits exist: customer code verification (30 per IP / 15 min), code requests (12 per IP / 15 min) and admin login (10 per IP / 15 min)', async () => {
  at('2027-01-08T10:00:00Z');
  for (let i = 0; i < 30; i += 1) assert.notEqual((await api('/api/auth/code/verify', { challengeId: 'a'.repeat(43), code: '123456' }, { ip: '203.0.113.60' })).status, 429, `verify ${i + 1}`);
  fails(await api('/api/auth/code/verify', { challengeId: 'a'.repeat(43), code: '123456' }, { ip: '203.0.113.60' }), 429, 'RATE_LIMITED');
  for (let i = 0; i < 12; i += 1) assert.notEqual((await api('/api/auth/code', { email: `tp-efg-rl-${i}@example.test`, channel: 'email' }, { ip: '203.0.113.61' })).status, 429, `code ${i + 1}`);
  fails(await api('/api/auth/code', { email: 'tp-efg-rl-x@example.test', channel: 'email' }, { ip: '203.0.113.61' }), 429, 'RATE_LIMITED');
  realAdmin();
  for (let i = 0; i < 10; i += 1) fails(await api('/api/admin/access', { email: OWNER.email, password: 'wrong-password-' + i }, { ip: '203.0.113.62' }), 403, 'ADMIN_FORBIDDEN');
  fails(await api('/api/admin/access', OWNER, { ip: '203.0.113.62' }), 429, 'RATE_LIMITED');
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// G7 — payment webhook
// ─────────────────────────────────────────────────────────────────────────────────────────────
const effects = (orderId) => ({
  payment: scalar('SELECT payment_status FROM orders WHERE id = ?', orderId),
  fiscal: count("SELECT COUNT(*) FROM outbox WHERE topic = 'fiscal.receipt.requested' AND aggregate_id = ?", orderId),
  receiptEmail: count("SELECT COUNT(*) FROM outbox WHERE topic = 'email.receipt.requested' AND aggregate_id = ?", orderId),
  purchase: count("SELECT COUNT(*) FROM outbox WHERE topic = 'analytics.purchase' AND aggregate_id = ?", orderId),
  events: count('SELECT COUNT(*) FROM webhook_events'),
});

test('G7a webhook secret: missing, wrong or empty secret → 401 and nothing stored; not configured → 503; outside mock mode → 503', async () => {
  at('2027-01-08T10:00:00Z');
  const order = await buy({ items: [once(2)], deliveryDate: '2027-01-12' });
  const body = { eventId: 'tp-efg-evt-secret', orderId: order.order.id, status: 'paid' };
  fails(await api('/api/webhooks/payments', body), 401, 'INVALID_WEBHOOK_SIGNATURE');
  fails(await webhook(body, 'wrong-secret'), 401, 'INVALID_WEBHOOK_SIGNATURE');
  fails(await webhook(body, ''), 401, 'INVALID_WEBHOOK_SIGNATURE');
  fails(await webhook(body, WEBHOOK + 'x'), 401, 'INVALID_WEBHOOK_SIGNATURE');
  assert.deepEqual(effects(order.order.id), { payment: 'pending', fiscal: 0, receiptEmail: 0, purchase: 0, events: 0 });
  env.PAYMENT_MODE = 'live';
  fails(await webhook(body), 503, 'PAYMENT_ADAPTER_NOT_CONNECTED');
  env.PAYMENT_MODE = 'mock'; delete env.PAYMENT_WEBHOOK_SECRET;
  fails(await webhook(body, ''), 503, 'WEBHOOK_NOT_CONFIGURED');
  assert.equal(effects(order.order.id).payment, 'pending');
});

test('G7b duplicate event (same eventId, also in parallel) and a second "paid" event: one fiscal request, one receipt email, one purchase event, one package activation', async () => {
  at('2027-01-08T10:00:00Z');
  const pkg = await buy({ deliveryDate: '2027-01-12' }); // cash package, pending
  const version = scalar('SELECT version FROM subscriptions WHERE id = ?', pkg.subscription.id);
  const first = ok(await webhook({ eventId: 'tp-efg-evt-1', orderId: pkg.order.id, status: 'paid' }));
  assert.equal(first.duplicate, false);
  assert.equal(ok(await webhook({ eventId: 'tp-efg-evt-1', orderId: pkg.order.id, status: 'paid' })).duplicate, true);
  const parallel = await Promise.all([webhook({ eventId: 'tp-efg-evt-1', orderId: pkg.order.id, status: 'paid' }), webhook({ eventId: 'tp-efg-evt-1', orderId: pkg.order.id, status: 'paid' })]);
  assert.deepEqual(parallel.map((r) => r.status), [200, 200]);
  ok(await webhook({ eventId: 'tp-efg-evt-2', orderId: pkg.order.id, status: 'paid' }));
  assert.deepEqual(effects(pkg.order.id), { payment: 'paid', fiscal: 1, receiptEmail: 1, purchase: 1, events: 2 });
  assert.equal(scalar('SELECT version FROM subscriptions WHERE id = ?', pkg.subscription.id), version + 1, 'the package was activated once');
  assert.equal(count('SELECT COUNT(*) FROM subscription_packages WHERE subscription_id = ?', pkg.subscription.id), 1);
});

test('G7c two different "paid" events in parallel for the same pending order: exactly one paid effect', async () => {
  at('2027-01-08T10:00:00Z');
  const pkg = await buy({ deliveryDate: '2027-01-12' });
  const results = await Promise.all([webhook({ eventId: 'tp-efg-par-a', orderId: pkg.order.id, status: 'paid' }), webhook({ eventId: 'tp-efg-par-b', orderId: pkg.order.id, status: 'paid' })]);
  assert.ok(results.some((r) => r.status === 200), JSON.stringify(results.map((r) => r.body)));
  const e = effects(pkg.order.id);
  assert.deepEqual([e.payment, e.fiscal, e.receiptEmail, e.purchase], ['paid', 1, 1, 1]);
});

test('G7d late "paid" event after the driver already collected the cash: no second receipt, no second activation', async () => {
  at('2027-01-08T10:00:00Z');
  const pkg = await buy({ deliveryDate: '2027-01-12' });
  at('2027-01-12T09:00:00Z');
  const stop = (await adminList('2027-01-12')).orders.find((o) => o.subscription_id === pkg.subscription.id);
  ok(await confirm(stop.id, { cashCollected: true }));
  const before = effects(pkg.order.id);
  assert.deepEqual([before.payment, before.fiscal], ['paid', 1]);
  const version = scalar('SELECT version FROM subscriptions WHERE id = ?', pkg.subscription.id);
  ok(await webhook({ eventId: 'tp-efg-late-paid', orderId: pkg.order.id, status: 'paid' }));
  const after = effects(pkg.order.id);
  assert.deepEqual([after.payment, after.fiscal, after.receiptEmail, after.purchase], ['paid', 1, 1, 1]);
  assert.equal(scalar('SELECT version FROM subscriptions WHERE id = ?', pkg.subscription.id), version);
  assert.equal(scalar('SELECT next_delivery_date FROM subscriptions WHERE id = ?', pkg.subscription.id), '2027-01-19', 'a late payment never moves an already handed-over package');
});

test('G7e out of order on a package: "failed" or "refunded" after "paid" is refused (409 PACKAGE_PAYMENT_IMMUTABLE) and the package stays paid', async () => {
  at('2027-01-08T10:00:00Z');
  const pkg = await buy({ deliveryDate: '2027-01-12', paymentMethod: 'card' });
  fails(await webhook({ eventId: 'tp-efg-pkg-failed', orderId: pkg.order.id, status: 'failed' }), 409, 'PACKAGE_PAYMENT_IMMUTABLE');
  fails(await webhook({ eventId: 'tp-efg-pkg-refunded', orderId: pkg.order.id, status: 'refunded' }), 409, 'PACKAGE_PAYMENT_IMMUTABLE');
  assert.equal(scalar('SELECT payment_status FROM orders WHERE id = ?', pkg.order.id), 'paid');
  assert.equal(count('SELECT COUNT(*) FROM webhook_events'), 0);
});

test('G7f BUG: a late "failed" webhook turns an already paid one-time order into "failed" (Fiscomm on; the admin path refuses the same change with FISCAL_PAYMENT_IMMUTABLE)', async () => {
  teardown(); setup({ FISCAL_PROVIDER: 'fiscomm', FISCOMM_MODE: 'mock' });
  at('2027-01-08T10:00:00Z');
  const order = await buy({ items: [once(2)], deliveryDate: '2027-01-12' });
  ok(await webhook({ eventId: 'tp-efg-once-paid', orderId: order.order.id, status: 'paid' }));
  assert.equal(effects(order.order.id).fiscal, 1);
  // The admin cannot un-pay it …
  fails(await api('/api/admin/orders', { id: order.order.id, paymentStatus: 'failed' }, { method: 'PATCH', admin: true }), 409, 'FISCAL_PAYMENT_IMMUTABLE');
  // … but a stale "failed" event from the provider can.
  const late = await webhook({ eventId: 'tp-efg-once-failed-late', orderId: order.order.id, status: 'failed' });
  assert.equal(scalar('SELECT payment_status FROM orders WHERE id = ?', order.order.id), 'paid', `paid order must stay paid; webhook answered ${late.status} ${JSON.stringify(late.body)}`);
});

test('G7g "paid" after "failed" on a one-time order: becomes paid once, with one receipt request', async () => {
  at('2027-01-08T10:00:00Z');
  const order = await buy({ items: [once(2)], deliveryDate: '2027-01-12' });
  ok(await webhook({ eventId: 'tp-efg-f1', orderId: order.order.id, status: 'failed' }));
  assert.equal(effects(order.order.id).payment, 'failed');
  assert.equal(effects(order.order.id).fiscal, 0);
  ok(await webhook({ eventId: 'tp-efg-p1', orderId: order.order.id, status: 'paid' }));
  ok(await webhook({ eventId: 'tp-efg-p2', orderId: order.order.id, status: 'paid' }));
  const e = effects(order.order.id);
  assert.deepEqual([e.payment, e.fiscal, e.receiptEmail, e.purchase], ['paid', 1, 1, 1]);
});

test('G7h [PITANJE] "refunded" arriving before "paid" on a one-time order: current result is refunded → paid with a receipt request (no event ordering)', async () => {
  at('2027-01-08T10:00:00Z');
  const order = await buy({ items: [once(2)], deliveryDate: '2027-01-12' });
  ok(await webhook({ eventId: 'tp-efg-r-first', orderId: order.order.id, status: 'refunded' }));
  assert.equal(effects(order.order.id).payment, 'refunded', 'a refund is recorded for an order that was never paid');
  ok(await webhook({ eventId: 'tp-efg-p-after', orderId: order.order.id, status: 'paid' }));
  const e = effects(order.order.id);
  assert.deepEqual([e.payment, e.fiscal], ['paid', 1], 'documented: the later-arriving "paid" wins and requests a receipt');
});

test('G7i event for a cancelled package is refused (409 PACKAGE_CANCELLED, nothing stored); event for an unknown order is 404 and stores nothing', async () => {
  at('2027-01-08T10:00:00Z');
  const pkg = await buy({ deliveryDate: '2027-01-12' });
  ok(await mutate(pkg.subscription.id, 'cancel', {}, session()));
  assert.equal(scalar('SELECT fulfillment_status FROM orders WHERE id = ?', pkg.order.id), 'cancelled');
  fails(await webhook({ eventId: 'tp-efg-cancelled-pkg', orderId: pkg.order.id, status: 'paid' }), 409, 'PACKAGE_CANCELLED');
  assert.deepEqual(effects(pkg.order.id), { payment: 'pending', fiscal: 0, receiptEmail: 0, purchase: 0, events: 0 });
  assert.equal(scalar('SELECT status FROM subscriptions WHERE id = ?', pkg.subscription.id), 'cancelled', 'a late payment does not revive the cancelled subscription');
  fails(await webhook({ eventId: 'tp-efg-unknown', orderId: 'ord_does_not_exist', status: 'paid' }), 404, 'ORDER_NOT_FOUND');
  assert.equal(count('SELECT COUNT(*) FROM webhook_events'), 0);
  fails(await webhook({ eventId: 'tp-efg-bad', orderId: pkg.order.id, status: 'chargeback' }), 422);
});

test('G7j [PITANJE] "paid" event for a one-time order the customer cancelled: current result is paid + receipt request on a cancelled order', async () => {
  at('2027-01-08T10:00:00Z');
  const order = await buy({ items: [once(2)], deliveryDate: '2027-01-12' });
  const cookie = session();
  ok(await api('/api/account/orders/' + order.order.id, { action: 'cancel' }, { method: 'PATCH', cookie }));
  assert.equal(scalar('SELECT fulfillment_status FROM orders WHERE id = ?', order.order.id), 'cancelled');
  const result = await webhook({ eventId: 'tp-efg-cancelled-once', orderId: order.order.id, status: 'paid' });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  const e = effects(order.order.id);
  assert.deepEqual([e.payment, e.fiscal, scalar('SELECT fulfillment_status FROM orders WHERE id = ?', order.order.id)], ['paid', 1, 'cancelled']);
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// G8 — promo codes, created through the admin API
// ─────────────────────────────────────────────────────────────────────────────────────────────
async function promo(fields) { return ok(await api('/api/admin/promos', { description: 'tp-efg', ...fields }, { admin: true }), 201).promo; }
async function checkout(fields, options = {}) { return api('/api/checkout', { paymentMethod: 'cash', deliveryDate: '2027-01-12', ...fields }, options); }

test('G8a one-time order: percent and fixed codes discount products only (delivery stays 350 RSD), quote = charge, code is case-insensitive and recorded', async () => {
  at('2027-01-08T10:00:00Z');
  await promo({ code: 'TPEFG10', discountType: 'percent', discountValue: 10 });
  await promo({ code: 'TPEFG200', discountType: 'fixed', discountValue: 20000 });
  await promo({ code: 'TPEFGHUGE', discountType: 'fixed', discountValue: 5000000 });
  const items = [once(3)]; // 3 × 350 = 1 050 RSD
  const quote = ok(await api('/api/cart', { items, deliveryDate: '2027-01-12', promoCode: 'tpefg10' }));
  assert.deepEqual([quote.subtotalMinor, quote.discountMinor, quote.deliveryFeeMinor, quote.totalMinor], [105000, 10500, 35000, 129500]);
  const a = ok(await checkout({ customer: customer('tp-efg-p1@example.test'), items, promoCode: 'tpefg10' }), 201);
  assert.deepEqual([a.order.discountMinor, a.order.totalMinor, a.order.promoCode], [10500, quote.totalMinor, 'TPEFG10']);
  const b = ok(await checkout({ customer: customer('tp-efg-p2@example.test'), items, promoCode: 'TPEFG200' }), 201);
  assert.deepEqual([b.order.discountMinor, b.order.deliveryFeeMinor, b.order.totalMinor], [20000, 35000, 105000 - 20000 + 35000]);
  const c = ok(await checkout({ customer: customer('tp-efg-p3@example.test'), items, promoCode: 'TPEFGHUGE' }), 201);
  assert.deepEqual([c.order.discountMinor, c.order.totalMinor], [105000, 35000], 'a fixed code never makes the total negative and never discounts delivery');
  assert.equal(count('SELECT COUNT(*) FROM order_promotions'), 3);
  assert.deepEqual(rows("SELECT code, times_used FROM promo_codes WHERE code LIKE 'TPEFG%' ORDER BY code").map((r) => [r.code, r.times_used]), [['TPEFG10', 1], ['TPEFG200', 1], ['TPEFGHUGE', 1]]);
  assert.equal(scalar('SELECT total_minor FROM orders WHERE id = ?', a.order.id), 129500);
});

test('G8b subscription package: 10 % off the four-delivery product value (2 L × 250 × 4 = 2 000 → 200 RSD), delivery 4 × 350 untouched; [PITANJE] the renewal is charged in full', async () => {
  at('2027-01-08T10:00:00Z');
  await promo({ code: 'TPEFGSUB', discountType: 'percent', discountValue: 10 });
  const quote = ok(await api('/api/cart', { items: [sub()], deliveryDate: '2027-01-12', promoCode: 'TPEFGSUB' }));
  assert.deepEqual([quote.subtotalMinor, quote.discountMinor, quote.deliveryFeeMinor, quote.totalMinor], [200000, 20000, 140000, 320000]);
  const bought = ok(await checkout({ customer: customer(), items: [sub()], paymentMethod: 'card', paymentToken: 'tp-efg-token', promoCode: 'TPEFGSUB' }), 201);
  assert.equal(bought.order.totalMinor, 320000);
  // Run the package to its end so the renewal is billed.
  const id = bought.subscription.id;
  for (const date of ['2027-01-12', '2027-01-19', '2027-01-26', '2027-02-02']) {
    at(date + 'T09:00:00Z');
    const stop = (await adminList(date)).orders.find((o) => o.subscription_id === id);
    ok(await confirm(stop.id));
  }
  at('2027-02-03T08:00:00Z');
  ok(await api('/api/jobs/scheduled', null, { method: 'GET', headers: { authorization: `Bearer ${env.CRON_SECRET}` } }));
  const renewal = one("SELECT total_minor, discount_minor, promo_code FROM orders WHERE subscription_id = ? AND kind = 'subscription_invoice' AND delivery_date = '2027-02-09'", id);
  assert.deepEqual([renewal.total_minor, renewal.discount_minor, renewal.promo_code], [340000, 0, null], 'documented: the code applies to the first package only');
});

test('G8c usage limit: a code limited to one use is accepted once, then refused; two parallel checkouts consume it exactly once', async () => {
  at('2027-01-08T10:00:00Z');
  await promo({ code: 'TPEFGONE', discountType: 'percent', discountValue: 20, usageLimit: 1 });
  ok(await checkout({ customer: customer('tp-efg-u1@example.test'), items: [once(2)], promoCode: 'TPEFGONE' }), 201);
  fails(await checkout({ customer: customer('tp-efg-u2@example.test'), items: [once(2)], promoCode: 'TPEFGONE' }), 422, 'PROMO_INVALID');
  fails(await api('/api/cart', { items: [once(2)], deliveryDate: '2027-01-12', promoCode: 'TPEFGONE' }), 422, 'PROMO_INVALID');
  await promo({ code: 'TPEFGRACE', discountType: 'percent', discountValue: 20, usageLimit: 1 });
  const results = await Promise.all(['tp-efg-r1@example.test', 'tp-efg-r2@example.test'].map((email) => checkout({ customer: customer(email), items: [once(2)], promoCode: 'TPEFGRACE' })));
  assert.deepEqual(results.map((r) => r.status).sort(), [201, 422], JSON.stringify(results.map((r) => r.body)));
  assert.equal(scalar("SELECT times_used FROM promo_codes WHERE code = 'TPEFGRACE'"), 1);
  assert.equal(count("SELECT COUNT(*) FROM order_promotions op JOIN promo_codes p ON p.id = op.promo_id WHERE p.code = 'TPEFGRACE'"), 1);
  assert.equal(count("SELECT COUNT(*) FROM orders WHERE promo_code = 'TPEFGRACE'"), 1, 'the refused parallel checkout left no order behind');
});

test('G8d first-purchase-only and per-customer limit: a returning customer is refused, a new one is accepted; inactive, expired, below-minimum and non-stackable codes are refused', async () => {
  at('2027-01-08T10:00:00Z');
  await promo({ code: 'TPEFGFIRST', discountType: 'percent', discountValue: 15, firstPurchaseOnly: true });
  await promo({ code: 'TPEFGPER', discountType: 'fixed', discountValue: 5000, perCustomerLimit: 1 });
  await promo({ code: 'TPEFGOFF', discountType: 'percent', discountValue: 15, isActive: false });
  await promo({ code: 'TPEFGOLD', discountType: 'percent', discountValue: 15, endsAt: '2027-01-01T00:00:00Z' });
  await promo({ code: 'TPEFGMIN', discountType: 'percent', discountValue: 15, minimumOrderMinor: 200000 });
  await promo({ code: 'TPEFGSTACK', discountType: 'percent', discountValue: 10, stackable: true });
  ok(await checkout({ customer: customer('tp-efg-ret@example.test'), items: [once(2)] }), 201);
  fails(await checkout({ customer: customer('tp-efg-ret@example.test'), items: [once(2)], promoCode: 'TPEFGFIRST' }), 422, 'PROMO_FIRST_PURCHASE');
  const fresh = ok(await checkout({ customer: customer('tp-efg-new@example.test'), items: [once(2)], promoCode: 'TPEFGFIRST' }), 201);
  assert.equal(fresh.order.discountMinor, Math.floor(70000 * 15 / 100));
  ok(await checkout({ customer: customer('tp-efg-per@example.test'), items: [once(2)], promoCode: 'TPEFGPER' }), 201);
  fails(await checkout({ customer: customer('tp-efg-per@example.test'), items: [once(2)], promoCode: 'TPEFGPER' }), 422, 'PROMO_CUSTOMER_LIMIT');
  for (const code of ['TPEFGOFF', 'TPEFGOLD', 'TPEFGMIN', 'NOSUCHCODE']) fails(await checkout({ customer: customer('tp-efg-x@example.test'), items: [once(2)], promoCode: code }), 422, 'PROMO_INVALID');
  fails(await checkout({ customer: customer('tp-efg-x@example.test'), items: [once(2)], promoCodes: ['TPEFGSTACK', 'TPEFGPER'] }), 422, 'PROMO_NOT_STACKABLE');
  assert.equal(count("SELECT COUNT(*) FROM orders o JOIN customers c ON c.id = o.customer_id WHERE c.email = 'tp-efg-x@example.test'"), 0);
});

test('G8e [PITANJE] first-purchase-only after a cancelled first order: the code is accepted again (cancelled orders do not count)', async () => {
  at('2027-01-08T10:00:00Z');
  await promo({ code: 'TPEFGFIRST2', discountType: 'percent', discountValue: 15, firstPurchaseOnly: true });
  const firstOrder = ok(await checkout({ customer: customer('tp-efg-cx@example.test'), items: [once(2)], promoCode: 'TPEFGFIRST2' }), 201);
  ok(await api('/api/account/orders/' + firstOrder.order.id, { action: 'cancel' }, { method: 'PATCH', cookie: session('tp-efg-cx@example.test') }));
  const again = await checkout({ customer: customer('tp-efg-cx@example.test'), items: [once(2)], promoCode: 'TPEFGFIRST2' });
  assert.equal(again.status, 201, JSON.stringify(again.body));
  assert.equal(scalar("SELECT times_used FROM promo_codes WHERE code = 'TPEFGFIRST2'"), 2, 'the cancelled order keeps its use; the code is used twice by one customer');
});

test('G8f promo code together with the loyalty reward: the code discounts products, the reward removes the 350 RSD delivery; both shown in the quote and charged exactly', async () => {
  at('2027-01-08T10:00:00Z');
  ok(await checkout({ customer: customer(ANA), items: [once(2)] }), 201); // creates Ana's account
  const anaId = scalar('SELECT id FROM customers WHERE email = ?', ANA);
  database.raw.prepare("INSERT INTO loyalty_rewards (id, customer_id, cycle_number, gift_product_id) VALUES ('tp-efg-reward-promo', ?, 1, 'prod_kravlje_1l')").run(anaId);
  await promo({ code: 'TPEFGLOYAL', discountType: 'percent', discountValue: 10 });
  const cookie = session(ANA);
  const items = [once(3)];
  const quote = ok(await api('/api/cart', { items, deliveryDate: '2027-01-15', promoCode: 'TPEFGLOYAL', loyaltyRewardId: 'tp-efg-reward-promo', email: ANA }, { cookie }));
  assert.deepEqual([quote.subtotalMinor, quote.discountMinor, quote.deliveryFeeMinor, quote.loyalty.deductedNowMinor, quote.totalMinor], [105000, 10500, 35000, 35000, 105000 - 10500]);
  const order = ok(await checkout({ customer: customer(ANA), items, deliveryDate: '2027-01-15', promoCode: 'TPEFGLOYAL', loyaltyRewardId: 'tp-efg-reward-promo' }, { cookie }), 201);
  assert.deepEqual([order.order.discountMinor, order.order.deliveryFeeMinor, order.order.totalMinor], [10500, 0, quote.totalMinor]);
  assert.equal(scalar("SELECT status FROM loyalty_rewards WHERE id = 'tp-efg-reward-promo'"), 'applied');
  assert.equal(scalar("SELECT times_used FROM promo_codes WHERE code = 'TPEFGLOYAL'"), 1);
  assert.equal(count("SELECT COUNT(*) FROM credits_ledger WHERE customer_id = ?", anaId), 0, 'the reward was deducted in the order, no extra credit');
});

test('G8g admin promo API: code is normalized, invalid values are refused, PATCH updates the limit and DELETE deactivates', async () => {
  at('2027-01-08T10:00:00Z');
  const created = await promo({ code: ' tp efg  norm ', discountType: 'percent', discountValue: 25 });
  assert.equal(created.code, 'TPEFGNORM');
  fails(await api('/api/admin/promos', { code: 'TPEFGBAD', discountType: 'percent', discountValue: 101 }, { admin: true }), 422);
  fails(await api('/api/admin/promos', { code: 'TPEFGZERO', discountType: 'fixed', discountValue: 0 }, { admin: true }), 422);
  fails(await api('/api/admin/promos', { code: 'TP EFG!', discountType: 'fixed', discountValue: 100 }, { admin: true }), 422);
  ok(await api('/api/admin/promos/' + created.id, { usageLimit: 0 }, { method: 'PATCH', admin: true }));
  fails(await checkout({ customer: customer(), items: [once(2)], promoCode: 'TPEFGNORM' }), 422, 'PROMO_INVALID');
  ok(await api('/api/admin/promos/' + created.id, { usageLimit: null }, { method: 'PATCH', admin: true }));
  ok(await checkout({ customer: customer(), items: [once(2)], promoCode: 'TPEFGNORM' }), 201);
  ok(await api('/api/admin/promos/' + created.id, null, { method: 'DELETE', admin: true }));
  fails(await checkout({ customer: customer('tp-efg-del@example.test'), items: [once(2)], promoCode: 'TPEFGNORM' }), 422, 'PROMO_INVALID');
});
