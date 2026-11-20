// Shared helpers for the Phase 2 test-plan suites (tests/tp-a-*, tp-b-*, tp-d-*).
// Real worker bundle (dist/server/index.js) + in-memory SQLite, no network. Unlike
// qa-harness' setup(), the catalogue is left in its REAL post-migration state:
// cow milk 1 L = 35000 one-time / 25000 subscription para, goat/yogurt/cheese inactive,
// delivery fee 35000, cutoff 36 h before 07:00 Europe/Belgrade, Beograd Tue+Fri, Novi Sad Fri,
// and the 2-litre minimum switched on (sqlite-d1 deletes it; production has it).
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import * as harness from './qa-harness.mjs';
export * from './qa-harness.mjs';
const { env, call, rows, sql, count, setClock, setup, sessionFor } = harness;

export const COW = 'prod_kravlje_1l';
export const FEE = 35000, ONE_TIME = 35000, SUB = 25000;

/** Fresh DB in the real catalogue state. Clock default: Fri 2026-11-20 10:00Z (11:00 in Belgrade). */
export function fresh(clock = '2026-11-20T10:00:00Z', overrides = {}, { minimumLitres = 2 } = {}) {
  const database = setup(overrides, clock);
  database.raw.exec("UPDATE products SET price_minor=35000, subscription_price_minor=25000 WHERE id='prod_kravlje_1l'; UPDATE products SET is_active=0 WHERE id!='prod_kravlje_1l'");
  setSetting('minimumLitres', minimumLitres);
  return database;
}
export function setSetting(key, value) {
  harness.database.raw.prepare('INSERT INTO settings(key,value_json) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json').run(key, JSON.stringify(value));
}
export const BG = { city: 'Beograd', postalCode: '11000' };
export const NS = { city: 'Novi Sad', postalCode: '21000' };
export const cust = (email = 'tp-kupac@example.test', where = BG, extra = {}) => ({ email, fullName: 'TP Kupac', phone: '+381600000000', addressLine1: 'TP ulica 1', ...where, ...extra });
export const oneTime = (qty = 2) => [{ productId: COW, quantity: qty, purchaseType: 'one_time' }];
export const weekly = (qty = 2) => [{ productId: COW, quantity: qty, purchaseType: 'subscription', cadence: 'weekly' }];

/** POST /api/checkout. method defaults to cash; set paymentMethod:'card' + paymentToken for card. */
export function buy(items, date, { email, where = BG, customer, paymentMethod = 'cash', paymentToken, key = randomUUID(), body = {}, ...options } = {}) {
  const payload = { customer: customer ?? cust(email, where), items, paymentMethod, deliveryDate: date, ...(paymentMethod === 'card' ? { paymentToken: paymentToken ?? 'tok_test' } : {}), ...body };
  if (date === undefined) delete payload.deliveryDate;
  return call('/api/checkout', { body: payload, key, ...options });
}
export function sessionByEmail(email) {
  const row = sql('SELECT id FROM customers WHERE email=?', email);
  assert.ok(row, 'customer exists: ' + email);
  return sessionFor(row.id, email);
}
export const account = (cookie) => call('/api/account', { cookie });
export const adminDay = (date) => call('/api/admin/deliveries?date=' + date, { admin: true });
export const topics = (like = '%') => rows('SELECT topic, aggregate_type, aggregate_id FROM outbox WHERE topic LIKE ? ORDER BY created_at, rowid', like);
export const topicCount = (topic, aggregateId) => count('outbox', aggregateId ? 'topic=? AND aggregate_id=?' : 'topic=?', ...(aggregateId ? [topic, aggregateId] : [topic]));
export const noDuplicateOutbox = () => {
  const dup = rows("SELECT topic, aggregate_id, COUNT(*) n FROM outbox WHERE topic NOT LIKE 'delivery.%' GROUP BY topic, aggregate_id HAVING n>1");
  assert.deepEqual(dup.map(d => `${d.topic}/${d.aggregate_id}`), [], 'duplicate outbox rows');
};
export const inst = (iso) => setClock(iso);
export { env, call, rows, sql, count };
