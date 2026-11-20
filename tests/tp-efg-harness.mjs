// Shared harness for TEST_PLAN Phase 2, sections E (time), F (four checks) and G (security,
// webhooks, promo codes). Real API routes through dist/server/index.js, an in-memory SQLite per
// test (tests/sqlite-d1.mjs), a fake clock that replaces globalThis.Date, and no network.
// Test data prefix: "tp-efg".
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { createDatabase } from './sqlite-d1.mjs';

export const RealDate = Date;
const realFetch = globalThis.fetch;
export const env = {};
globalThis.__mlekoTestCloudflareEnv = env;
register(new URL('./cloudflare-loader.mjs', import.meta.url));
export const worker = (await import('../dist/server/index.js')).default;

export let database;
export let instant = RealDate.parse('2027-01-08T10:00:00Z');
export const networkCalls = [];
export const CRON = 'tp-efg-cron-secret-0123456789';
export const WEBHOOK = 'tp-efg-webhook-secret-0123456789';
export const baseEnv = {
  APP_ENV: 'local', AUTH_MODE: 'local', APP_ORIGIN: 'http://localhost', PAYMENT_MODE: 'mock', EMAIL_MODE: 'console', WHATSAPP_MODE: 'disabled',
  BADI_MODE: 'mock', ADMIN_LEGACY_ACCESS: 'true', ADMIN_SECRET: 'tp-efg-admin-secret', CRON_SECRET: CRON,
  PAYMENT_WEBHOOK_SECRET: WEBHOOK, LOCAL_AUTH_EXPOSE_TOKEN: 'true',
};

export function setClock(iso) {
  instant = RealDate.parse(iso);
  assert.ok(Number.isFinite(instant), `bad clock ${iso}`);
  globalThis.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [instant])); }
    static now() { return instant; }
  };
}
export const at = setClock;

/** Fresh env + DB + frozen clock. Prices from the brief: 350 RSD one-time, 250 RSD subscription, 350 RSD per delivery. */
export function setup(overrides = {}, clock = '2027-01-08T10:00:00Z') {
  for (const key of Object.keys(env)) delete env[key];
  Object.assign(env, baseEnv, overrides);
  for (const [key, value] of Object.entries(overrides)) if (value === undefined) delete env[key];
  networkCalls.length = 0;
  globalThis.fetch = async (url) => { networkCalls.push(String(url)); throw new Error(`tp-efg network guard: ${url}`); };
  setClock(clock);
  database = createDatabase();
  env.DB = database;
  database.raw.exec("UPDATE products SET price_minor=35000, subscription_price_minor=25000, is_active=1, allow_subscription=1 WHERE id='prod_kravlje_1l'");
  database.raw.exec("UPDATE settings SET value_json='35000' WHERE key='deliveryFeeMinor'");
  return database;
}
export function teardown() {
  database?.close();
  globalThis.Date = RealDate;
  globalThis.fetch = realFetch;
}

export const one = (query, ...args) => database.raw.prepare(query).get(...args);
export const rows = (query, ...args) => database.raw.prepare(query).all(...args);
export const scalar = (query, ...args) => { const row = one(query, ...args); return row ? Object.values(row)[0] : null; };
export const hash = (value) => createHash('sha256').update(value).digest('base64url');

export async function api(path, data, { method, cookie, admin = false, bearer, key = randomUUID(), origin = 'http://localhost', ip = '198.51.100.70', headers = {} } = {}) {
  const verb = method ?? (data === undefined || data === null ? 'GET' : 'POST');
  const h = { 'content-type': 'application/json', 'x-real-ip': ip, 'Idempotency-Key': key, ...headers };
  if (origin) h.Origin = origin;
  if (cookie) h.cookie = cookie;
  if (admin) h['x-admin-secret'] = env.ADMIN_SECRET;
  if (bearer) h.Authorization = `Bearer ${bearer}`;
  const response = await worker.fetch(new Request('http://localhost' + path, { method: verb, headers: h, ...(verb !== 'GET' && verb !== 'HEAD' && data !== undefined ? { body: typeof data === 'string' ? data : JSON.stringify(data ?? {}) } : {}) }), env, { waitUntil() {}, passThroughOnException() {} });
  const text = await response.text();
  let body; try { body = JSON.parse(text); } catch { body = text; }
  return { status: response.status, body, headers: response.headers, code: body?.error?.code };
}
export function ok(result, status = 200) { assert.equal(result.status, status, JSON.stringify(result.body)); return result.body; }
export function fails(result, status, code) {
  assert.equal(result.status, status, JSON.stringify(result.body));
  if (code) assert.equal(result.code, code, JSON.stringify(result.body));
  return result.body;
}

export const customer = (email = 'tp-efg-ana@example.test', city = 'Beograd', postalCode = '11000') => ({ email, fullName: 'TP EFG Ana', phone: '+381600000001', addressLine1: 'Test ulica 1', city, postalCode });
export const sub = (quantity = 2) => ({ productId: 'prod_kravlje_1l', quantity, purchaseType: 'subscription', cadence: 'weekly' });
export const once = (quantity = 2) => ({ productId: 'prod_kravlje_1l', quantity, purchaseType: 'one_time' });

export async function buy({ items = [sub()], email, deliveryDate, paymentMethod = 'cash', city, postalCode, key, extra = {} } = {}) {
  const body = { customer: customer(email, city, postalCode), items, paymentMethod, ...(paymentMethod === 'card' ? { paymentToken: 'tp-efg-token' } : {}), deliveryDate, ...extra };
  return ok(await api('/api/checkout', body, { key }), 201);
}

export function session(email = 'tp-efg-ana@example.test') {
  const c = one('SELECT id, email FROM customers WHERE email = ?', email);
  assert.ok(c, `no customer ${email}`);
  const token = randomUUID() + randomUUID();
  database.raw.prepare("INSERT INTO auth_tokens (id, customer_id, email, token_hash, kind, expires_at) VALUES (?,?,?,?,'session','2030-01-01T00:00:00Z')").run(randomUUID(), c.id, c.email, hash(token));
  return 'mm_session=' + token;
}
export async function mutate(id, action, details = {}, cookie = session()) {
  return api('/api/account/subscriptions/' + id, { action, expectedVersion: scalar('SELECT version FROM subscriptions WHERE id = ?', id), ...details }, { method: 'PATCH', cookie });
}
export const job = () => api('/api/jobs/scheduled', null, { method: 'GET', headers: { authorization: `Bearer ${CRON}` } });
/** Admin delivery view for a date: the stored list when generated, otherwise the live preview (no write before the deadline). */
export async function adminDelivery(date) { return ok(await api('/api/admin/delivery-preview?date=' + date, null, { method: 'GET', admin: true })); }
export async function adminList(date) { return ok(await api('/api/admin/deliveries?date=' + date, null, { method: 'GET', admin: true })); }
export async function confirm(deliveryOrderId, extra = {}) { return api('/api/admin/deliveries', { action: 'complete', id: deliveryOrderId, status: 'delivered', ...extra }, { admin: true }); }
export async function recordPayment(orderId) { return api('/api/admin/orders', { id: orderId, paymentStatus: 'paid' }, { method: 'PATCH', admin: true }); }
export async function webhook(body, secret = WEBHOOK) { return api('/api/webhooks/payments', body, { headers: { 'x-webhook-secret': secret } }); }

/** Topic counts of outbox rows created after `since` (row count marker). */
export function outboxSince(marker) {
  return rows('SELECT rowid, topic, aggregate_type, aggregate_id, payload_json FROM outbox WHERE rowid > ? ORDER BY rowid', marker);
}
export const outboxMarker = () => Number(scalar('SELECT COALESCE(MAX(rowid), 0) FROM outbox'));
export function topicCounts(list) { const counts = {}; for (const row of list) counts[row.topic] = (counts[row.topic] ?? 0) + 1; return counts; }

/**
 * Plan §F — the four checks after every step, for one subscription:
 *  (1) DB: subscription, packages + lines delivered counts, orders and totals, credits;
 *  (2) customer view (/api/account): next delivery, package summary, status;
 *  (3) admin view: delivery list/preparation for a date;
 *  (4) outbox topics of this step (each exactly once) and global "never twice" invariants.
 * Returns the gathered state so a caller can add its own assertions.
 */
export async function fourChecks(label, { subscriptionId, email = 'tp-efg-ana@example.test', cookie, expect = {}, adminDate, adminExpect, marker, topics = {}, forbiddenTopics = [] }) {
  const where = `[${label}]`;
  // (1) database
  const subscription = one('SELECT * FROM subscriptions WHERE id = ?', subscriptionId);
  assert.ok(subscription, `${where} subscription exists`);
  const packages = rows(`SELECT sp.id, sp.status, o.payment_status, o.total_minor, o.delivery_date, o.idempotency_key,
    (SELECT COUNT(DISTINCT dor.id) FROM delivery_orders dor JOIN delivery_items di ON di.delivery_order_id = dor.id JOIN package_lines pl ON pl.id = di.package_line_id WHERE pl.package_id = sp.id AND dor.status = 'delivered') AS delivered_visits,
    (SELECT SUM(COALESCE(di.delivered_quantity, di.quantity)) FROM delivery_orders dor JOIN delivery_items di ON di.delivery_order_id = dor.id JOIN package_lines pl ON pl.id = di.package_line_id WHERE pl.package_id = sp.id AND dor.status = 'delivered') AS delivered_units
    FROM subscription_packages sp JOIN orders o ON o.id = sp.order_id WHERE sp.subscription_id = ? ORDER BY o.delivery_date`, subscriptionId);
  const orders = rows("SELECT id, kind, payment_status, fulfillment_status, total_minor, subtotal_minor, delivery_fee_minor, delivery_date, idempotency_key FROM orders WHERE subscription_id = ? ORDER BY delivery_date, created_at", subscriptionId);
  const credits = rows('SELECT amount_minor, reason, status FROM credits_ledger WHERE subscription_id = ?', subscriptionId);
  if (expect.status !== undefined) assert.equal(subscription.status, expect.status, `${where} subscription.status`);
  if (expect.renewalEnabled !== undefined) assert.equal(subscription.renewal_enabled, expect.renewalEnabled ? 1 : 0, `${where} renewal_enabled`);
  if (expect.nextDeliveryDate !== undefined) assert.equal(subscription.next_delivery_date, expect.nextDeliveryDate, `${where} next_delivery_date`);
  if (expect.packages !== undefined) assert.deepEqual(packages.map((p) => [p.status, p.payment_status, Number(p.delivered_visits)]), expect.packages, `${where} packages [status, payment, delivered visits]`);
  if (expect.orderTotals !== undefined) assert.deepEqual(orders.filter((o) => o.kind === 'subscription_invoice').map((o) => o.total_minor), expect.orderTotals, `${where} package order totals`);
  if (expect.credits !== undefined) assert.deepEqual(credits.map((c) => c.amount_minor), expect.credits, `${where} credits`);
  // never two packages / package orders for one period, at most one open package
  assert.ok(packages.filter((p) => p.status === 'open').length <= 1, `${where} at most one open package`);
  const keys = orders.map((o) => o.idempotency_key).filter(Boolean);
  assert.equal(new Set(keys).size, keys.length, `${where} no duplicate order keys`);
  const firstDates = orders.filter((o) => o.kind === 'subscription_invoice').map((o) => o.delivery_date);
  assert.equal(new Set(firstDates).size, firstDates.length, `${where} one package order per first delivery date`);
  // (2) customer view
  const account = ok(await api('/api/account', null, { method: 'GET', cookie: cookie ?? session(email) }));
  const view = account.subscriptions.find((s) => s.id === subscriptionId);
  assert.ok(view, `${where} subscription visible in the account`);
  if (expect.status !== undefined) assert.equal(view.status, expect.status, `${where} account status`);
  if (expect.nextDeliveryDate !== undefined) assert.equal(view.nextDeliveryDate, expect.nextDeliveryDate, `${where} account next delivery`);
  if (expect.renewalEnabled !== undefined) assert.equal(view.renewalEnabled, expect.renewalEnabled, `${where} account renewalEnabled`);
  if (expect.summary !== undefined) {
    const s = view.packageSummary;
    assert.deepEqual(s ? [s.purchased, s.realized, s.remaining, s.paymentStatus] : null, expect.summary, `${where} account packageSummary [purchased, realized, remaining, payment]`);
  }
  // (3) admin view for a date
  let admin = null;
  if (adminDate) {
    admin = await adminDelivery(adminDate);
    const mine = (admin.orders ?? []).filter((o) => o.subscription_id === subscriptionId);
    const litres = mine.flatMap((o) => o.items).filter((i) => i.product_id === 'prod_kravlje_1l').reduce((n, i) => n + Number(i.quantity), 0);
    if (adminExpect !== undefined) {
      assert.equal(mine.length, adminExpect.stops, `${where} admin ${adminDate}: stops for this subscription`);
      assert.equal(litres, adminExpect.litres, `${where} admin ${adminDate}: litres for this subscription`);
      const prep = (admin.preparation ?? []).filter((p) => p.product_id === 'prod_kravlje_1l').reduce((n, p) => n + Number(p.total_quantity), 0);
      assert.ok(prep >= litres, `${where} preparation covers the stop`);
      if (adminExpect.cashDue !== undefined) assert.equal(mine.reduce((n, o) => n + Number(o.cash_due_minor ?? 0), 0), adminExpect.cashDue, `${where} admin ${adminDate}: cash the driver collects`);
    }
  }
  // (4) notifications of this step + global invariants
  const step = marker === undefined ? [] : outboxSince(marker);
  const counts = topicCounts(step.filter((row) => row.aggregate_id === subscriptionId || orders.some((o) => o.id === row.aggregate_id) || row.aggregate_type === 'delivery'));
  for (const [topic, n] of Object.entries(topics)) assert.equal(counts[topic] ?? 0, n, `${where} outbox ${topic} ×${n} (step topics: ${JSON.stringify(counts)})`);
  for (const topic of forbiddenTopics) assert.equal(counts[topic] ?? 0, 0, `${where} outbox must not contain ${topic} (step topics: ${JSON.stringify(counts)})`);
  globalInvariants(where);
  return { subscription, packages, orders, credits, account, view, admin, step, counts };
}

/** Never two "money" effects for one thing, whatever the step. */
export function globalInvariants(where = '') {
  const dupes = (sql) => rows(sql);
  assert.deepEqual(dupes("SELECT aggregate_id, COUNT(*) n FROM outbox WHERE topic = 'billing.invoice_created' GROUP BY aggregate_id HAVING n > 1"), [], `${where} one invoice event per order`);
  assert.deepEqual(dupes("SELECT aggregate_id, COUNT(*) n FROM outbox WHERE topic = 'fiscal.receipt.requested' GROUP BY aggregate_id HAVING n > 1"), [], `${where} one fiscal receipt request per order`);
  assert.deepEqual(dupes("SELECT aggregate_id, COUNT(*) n FROM outbox WHERE topic IN ('payment.captured') GROUP BY aggregate_id HAVING n > 1"), [], `${where} one capture per order`);
  assert.deepEqual(dupes("SELECT aggregate_id, COUNT(*) n FROM outbox WHERE topic = 'email.receipt.requested' GROUP BY aggregate_id HAVING n > 1"), [], `${where} one receipt email per order`);
  assert.deepEqual(dupes("SELECT topic, aggregate_id, json_extract(payload_json,'$.deliveryDate') d, COUNT(*) n FROM outbox WHERE topic IN ('email.delivery_reminder.requested') GROUP BY topic, aggregate_id, d HAVING n > 1"), [], `${where} one reminder per source and date`);
  assert.deepEqual(dupes("SELECT subscription_id, COUNT(*) n FROM subscription_packages GROUP BY subscription_id, order_id HAVING n > 1"), [], `${where} one package per order`);
  assert.deepEqual(dupes("SELECT d.delivery_date, dor.subscription_id, COUNT(*) n FROM delivery_orders dor JOIN deliveries d ON d.id = dor.delivery_id WHERE dor.subscription_id IS NOT NULL GROUP BY d.delivery_date, dor.subscription_id HAVING n > 1"), [], `${where} one stop per subscription and date`);
  assert.deepEqual(dupes("SELECT delivery_date, COUNT(*) n FROM deliveries GROUP BY delivery_date HAVING n > 1"), [], `${where} one delivery list per date`);
  assert.deepEqual(dupes("SELECT order_id, COUNT(*) n FROM payment_attempts WHERE operation = 'charge' AND status = 'paid' GROUP BY order_id HAVING n > 1"), [], `${where} one successful charge per order`);
}

export const addDays = (date, days) => { const d = new RealDate(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + days); return d.toISOString().slice(0, 10); };
export const weekday = (date) => new RealDate(date + 'T12:00:00Z').getUTCDay();
