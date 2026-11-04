// Shared harness for the QA-critical suites (tests/qa-*.test.mjs).
// Every suite runs the real worker bundle (dist/server/index.js) against its OWN
// in-memory SQLite database. No network: global fetch is replaced with a guard
// that throws, so a test can never reach api.fiscomm.rs or any other host.
// Test data prefix: "TEST-F-".
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
export let instant = RealDate.parse('2026-12-30T10:00:00Z');
export const networkCalls = [];
export const defaultEnv = {
  APP_ENV: 'local', AUTH_MODE: 'local', APP_ORIGIN: 'http://localhost',
  PAYMENT_MODE: 'mock', EMAIL_MODE: 'console', WHATSAPP_MODE: 'disabled',
  FISCAL_PROVIDER: 'fiscomm', FISCOMM_MODE: 'mock', BADI_MODE: 'mock',
  ADMIN_LEGACY_ACCESS: 'true', ADMIN_SECRET: 'test-f-admin-secret',
  PAYMENT_WEBHOOK_SECRET: 'test-f-webhook-secret-0123456789', CRON_SECRET: 'test-f-cron-secret-0123456789',
  LOCAL_AUTH_EXPOSE_TOKEN: 'true',
};

/** Fresh env + DB + frozen clock for one test. Call from beforeEach. */
export function setup(overrides = {}, clock = '2026-12-30T10:00:00Z') {
  for (const key of Object.keys(env)) delete env[key];
  Object.assign(env, defaultEnv, overrides);
  for (const [key, value] of Object.entries(overrides)) if (value === undefined) delete env[key];
  networkCalls.length = 0;
  globalThis.fetch = async (url) => { networkCalls.push(String(url)); throw new Error(`TEST-F network guard: ${url}`); };
  setClock(clock);
  database = createDatabase();
  env.DB = database;
  database.raw.exec("UPDATE products SET is_active=1, allow_subscription=1, fiscal_tax_label='Е', badi_sku=10; UPDATE products SET price_minor=25000, subscription_price_minor=25000 WHERE id='prod_kravlje_1l'; UPDATE products SET price_minor=30000, subscription_price_minor=30000 WHERE id='prod_kozje_1l'");
  return database;
}
export function teardown() {
  database?.close();
  globalThis.Date = RealDate;
  globalThis.fetch = realFetch;
}
/** Freeze `new Date()` / `Date.now()` at an ISO instant. */
export function setClock(iso) {
  instant = RealDate.parse(iso);
  globalThis.Date = class extends RealDate {
    constructor(...args) { super(...(args.length ? args : [instant])); }
    static now() { return instant; }
  };
}
export const advance = (ms) => { instant += ms; };
export const sql = (query, ...args) => database.raw.prepare(query).get(...args);
export const rows = (query, ...args) => database.raw.prepare(query).all(...args);
export const count = (table, where = '1=1', ...args) => Number(database.raw.prepare(`SELECT COUNT(*) n FROM ${table} WHERE ${where}`).get(...args).n);
export const hash = (value) => createHash('sha256').update(value).digest('base64url');

/** Low-level API call. Defaults: JSON body, Origin = APP_ORIGIN, unique Idempotency-Key. */
export async function call(path, { method, body, cookie, bearer, admin = false, origin = env.APP_ORIGIN, ip = '198.51.100.60', key = randomUUID(), headers = {} } = {}) {
  const verb = method ?? (body === undefined ? 'GET' : 'POST');
  const h = { 'content-type': 'application/json', 'x-real-ip': ip, 'Idempotency-Key': key, ...headers };
  if (origin) h.Origin = origin;
  if (cookie) h.cookie = cookie;
  if (bearer) h.Authorization = `Bearer ${bearer}`;
  if (admin) h['x-admin-secret'] = env.ADMIN_SECRET;
  const response = await worker.fetch(new Request('http://localhost' + path, { method: verb, headers: h, ...(body !== undefined && verb !== 'GET' && verb !== 'HEAD' ? { body: typeof body === 'string' ? body : JSON.stringify(body) } : {}) }), env, { waitUntil() {}, passThroughOnException() {} });
  const text = await response.text();
  let parsed; try { parsed = JSON.parse(text); } catch { parsed = text; }
  return { status: response.status, body: parsed, headers: response.headers, code: parsed?.error?.code };
}
export function expectStatus(result, status = 200) {
  assert.equal(result.status, status, `expected ${status}, got ${result.status}: ${JSON.stringify(result.body)}`);
  return result.body;
}
export function expectError(result, status, code) {
  assert.equal(result.status, status, `expected ${status}/${code}, got ${result.status}: ${JSON.stringify(result.body)}`);
  assert.equal(result.code, code, JSON.stringify(result.body));
  return result.body;
}

export const TEST_CUSTOMER = { email: 'test-f-kupac@example.test', fullName: 'TEST-F Željko Kupac', phone: '+381600000000', addressLine1: 'TEST-F ulica 1', city: 'Beograd', postalCode: '11000' };
export const line = (productId = 'prod_kravlje_1l', quantity = 2, purchaseType = 'one_time', cadence = 'weekly') => ({ productId, quantity, purchaseType, ...(purchaseType === 'subscription' ? { cadence } : {}) });
export function checkoutBody(items = [line()], extra = {}) {
  const hasSubscription = Array.isArray(items) && items.some((item) => item?.purchaseType === 'subscription');
  return { customer: { ...TEST_CUSTOMER }, items, paymentMethod: hasSubscription ? 'card' : 'cash', ...(hasSubscription ? { paymentToken: 'test-f-token' } : {}), deliveryDate: '2027-01-01', ...extra };
}
export async function checkout(items, extra, options = {}) {
  return call('/api/checkout', { body: checkoutBody(items, extra), ...options });
}
/** Customer session cookie inserted directly (valid auth_tokens row). */
export function sessionFor(customerId, email, { expiresAt = '2030-01-01T00:00:00Z' } = {}) {
  const token = randomUUID() + randomUUID();
  database.raw.prepare("INSERT INTO auth_tokens (id, customer_id, email, token_hash, kind, expires_at) VALUES (?,?,?,?,'session',?)").run(randomUUID(), customerId, email, hash(token), expiresAt);
  return { cookie: 'mm_session=' + token, token };
}
