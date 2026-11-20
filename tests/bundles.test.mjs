import assert from 'node:assert/strict';
import { beforeEach, afterEach, test } from 'node:test';
import { register } from 'node:module';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';
import { createDatabase } from './sqlite-d1.mjs';

// Packages ("paketi") under the final rules of 20 Nov 2026, against the real API routes and
// SQLite: migration 0025 (product copy, old packages gone), admin validation (product off
// sale, biweekly, under the 2-litre minimum), and the price of a package in the cart quote
// and at checkout, bought once and as the prepaid four-delivery subscription.
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
 // The shop as it is sold today: cow milk only, 350 RSD once / 250 RSD on subscription, 2 L minimum.
 database.raw.exec("UPDATE products SET price_minor=35000, subscription_price_minor=25000, is_active=1, allow_subscription=1 WHERE id='prod_kravlje_1l'");
 database.raw.exec("INSERT INTO settings (key, value_json) VALUES ('minimumLitres', '2')");
});
afterEach(() => { database.close(); globalThis.Date = realDate; });
async function api(path, data, { method = 'POST', admin = false, key = randomUUID() } = {}) {
 const headers = { 'content-type': 'application/json', 'Idempotency-Key': key, Origin: 'http://localhost' };
 if (admin) headers['x-admin-secret'] = env.ADMIN_SECRET;
 const res = await worker.fetch(new Request('http://localhost' + path, { method, headers, ...(method !== 'GET' ? { body: JSON.stringify(data) } : {}) }), env, { waitUntil() {}, passThroughOnException() {} });
 const text = await res.text();
 let body; try { body = JSON.parse(text); } catch { body = text; }
 return { status: res.status, body };
}
const scalar = (sql, ...args) => Object.values(database.raw.prepare(sql).get(...args) ?? { value: null })[0];
function expectStatus(r, status = 200) { assert.equal(r.status, status, JSON.stringify(r.body)); return r.body; }
function expectError(r, status, code) { assert.equal(r.status, status, JSON.stringify(r.body)); assert.equal(r.body.error.code, code, JSON.stringify(r.body)); return r.body; }
const milk = (quantity = 2, purchaseType = 'subscription', extra = {}) => ({ productId: 'prod_kravlje_1l', quantity, purchaseType, ...(purchaseType === 'subscription' ? { cadence: 'weekly' } : {}), ...extra });
const bundle = (items = [milk()], extra = {}) => ({ slug: `paket-${randomUUID().slice(0, 8)}`, name: 'Nedeljni paket', description: '2 l kravljeg mleka svake nedelje.', items, ...extra });
const createBundle = (payload) => api('/api/admin/bundles', payload, { admin: true });
const patchBundle = (id, payload) => api(`/api/admin/bundles/${id}`, payload, { admin: true, method: 'PATCH' });
const customer = { email: 'paket@example.test', fullName: 'Paket Test', phone: '+381600000009', addressLine1: 'Test ulica 9', city: 'Beograd', postalCode: '11000' };
/** What the shop's "Dodaj paket u korpu" puts in the cart for a choice. */
const cartLines = (offer, mode) => offer.lines.map((line) => {
 const purchaseType = mode === 'one_time' ? 'one_time' : line.purchaseType;
 return { productId: line.productId, quantity: line.quantity, purchaseType, ...(purchaseType === 'subscription' ? { cadence: 'weekly' } : {}) };
});
async function shopBundles() { return expectStatus(await api('/api/storefront', null, { method: 'GET' })).bundles; }

test('migration 0025 removes the seeded goat/biweekly packages and rewrites the milk copy', async () => {
 assert.equal(scalar('SELECT COUNT(*) FROM bundles'), 0);
 assert.equal(scalar('SELECT COUNT(*) FROM bundle_items'), 0);
 assert.equal(scalar("SELECT COUNT(*) FROM bundles b JOIN bundle_items bi ON bi.bundle_id = b.id WHERE b.is_active = 1 AND (bi.product_id = 'prod_kozje_1l' OR bi.cadence = 'biweekly')"), 0);
 for (const id of ['prod_kravlje_1l', 'prod_kozje_1l']) {
  const row = database.raw.prepare('SELECT short_description, description, seo_title, seo_description, badge FROM products WHERE id = ?').get(id);
  const copy = Object.values(row).join(' ');
  assert.doesNotMatch(copy, /dvonedelj|biweekly|Izaberite|poručite|vaše|vaš |Vaš/i, `${id}: ${copy}`);
  assert.match(row.description, /četiri nedeljne dostave/);
  assert.match(row.description, /povratnoj staklenoj flaši/);
  assert.match(row.description, /2 l po dostavi/);
 }
 assert.doesNotMatch(Object.values(database.raw.prepare("SELECT short_description, description, seo_description FROM products WHERE id = 'prod_kravlje_1l'").get()).join(' '), /kozj/i);
 // Seeded content settings are left alone (they were never the stale values the migration replaces).
 assert.equal(scalar("SELECT COUNT(*) FROM settings WHERE key = 'heroSubtitle' AND value_json LIKE '%kozje%'"), 0);
});

test('migration 0025 on a live-like database: stale texts replaced, other packages with a biweekly line hidden', () => {
 const db = new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys = ON');
 const files = readdirSync(new URL('../migrations/', import.meta.url)).filter(f => f.endsWith('.sql')).sort();
 for (const file of files.filter(f => f < '0025')) db.exec(readFileSync(new URL('../migrations/' + file, import.meta.url), 'utf8'));
 db.exec(`INSERT INTO settings (key, value_json) VALUES ('heroSubtitle', '"Domaće kravlje i kozje mleko u povratnim staklenim flašama. Dostavljamo na vašu adresu."') ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json`);
 db.exec(`INSERT INTO settings (key, value_json) VALUES ('trustItemTwo', '"Moj tekst vlasnika"') ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json`);
 db.exec("INSERT INTO bundles (id, slug, name, is_active) VALUES ('bundle_owner', 'vlasnikov-paket', 'Vlasnikov paket', 1), ('bundle_weekly', 'nedeljni', 'Nedeljni', 1)");
 db.exec("INSERT INTO bundle_items (id, bundle_id, product_id, quantity, purchase_type, cadence) VALUES ('bi_owner', 'bundle_owner', 'prod_kravlje_1l', 2, 'subscription', 'biweekly'), ('bi_weekly', 'bundle_weekly', 'prod_kravlje_1l', 2, 'subscription', 'weekly')");
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM bundles WHERE id IN ('bundle_probni', 'bundle_dorucak', 'bundle_porodicni')").get().n, 3);
 db.exec(readFileSync(new URL('../migrations/0025_product_copy_and_bundles.sql', import.meta.url), 'utf8'));
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM bundles WHERE id IN ('bundle_probni', 'bundle_dorucak', 'bundle_porodicni')").get().n, 0);
 assert.equal(db.prepare("SELECT COUNT(*) AS n FROM bundle_items WHERE bundle_id IN ('bundle_probni', 'bundle_dorucak', 'bundle_porodicni')").get().n, 0);
 assert.equal(db.prepare("SELECT is_active FROM bundles WHERE id = 'bundle_owner'").get().is_active, 0, 'a biweekly package is hidden, not deleted');
 assert.equal(db.prepare("SELECT is_active FROM bundles WHERE id = 'bundle_weekly'").get().is_active, 1);
 assert.match(db.prepare("SELECT value_json FROM settings WHERE key = 'heroSubtitle'").get().value_json, /četiri nedeljne dostave/);
 assert.equal(db.prepare("SELECT value_json FROM settings WHERE key = 'trustItemTwo'").get().value_json, '"Moj tekst vlasnika"', 'owner text is never overwritten');
 db.close();
 // The PostgreSQL twin runs the same statements; only the timestamp expression differs.
 const sqlite = readFileSync(new URL('../migrations/0025_product_copy_and_bundles.sql', import.meta.url), 'utf8');
 const postgres = readFileSync(new URL('../migrations/postgres/0025_product_copy_and_bundles.sql', import.meta.url), 'utf8');
 const statements = (sql) => sql.split('\n').filter(line => !line.startsWith('--')).join('\n').replaceAll("to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')", 'CURRENT_TIMESTAMP').trim();
 assert.equal(statements(postgres), statements(sqlite));
});

test('admin package validation: product off sale, biweekly, under the minimum, duplicate line', async () => {
 // Goat milk is off sale: a published package with it is refused, a hidden draft is kept.
 const goat = { productId: 'prod_kozje_1l', quantity: 2, purchaseType: 'subscription', cadence: 'weekly' };
 expectError(await createBundle(bundle([goat])), 422, 'PRODUCT_INACTIVE');
 const draft = expectStatus(await createBundle(bundle([goat], { isActive: false })), 201).bundle;
 assert.equal(draft.isActive, false);
 assert.equal(draft.available, false);
 expectError(await patchBundle(draft.id, { isActive: true }), 422, 'PRODUCT_INACTIVE');
 // Weekly is the only rhythm sold.
 expectError(await createBundle(bundle([milk(2, 'subscription', { cadence: 'biweekly' })])), 422, 'CADENCE_UNAVAILABLE');
 // Two litres per delivery at least, per line.
 const small = expectError(await createBundle(bundle([milk(1)])), 422, 'MINIMUM_QUANTITY');
 assert.match(small.error.message, /najmanja količina je 2 l po dostavi/);
 expectError(await createBundle(bundle([milk(1, 'one_time')])), 422, 'MINIMUM_QUANTITY');
 expectError(await createBundle(bundle([milk(2), milk(4)])), 422, 'DUPLICATE_BUNDLE_ITEM');
 // A subscription line needs a product that allows one.
 database.raw.exec("UPDATE products SET allow_subscription = 0 WHERE id = 'prod_kravlje_1l'");
 expectError(await createBundle(bundle([milk(2)])), 422, 'SUBSCRIPTION_NOT_ALLOWED');
 database.raw.exec("UPDATE products SET allow_subscription = 1 WHERE id = 'prod_kravlje_1l'");

 const created = expectStatus(await createBundle(bundle([milk(2)])), 201).bundle;
 assert.equal(created.isActive, true);
 assert.equal(created.offersSubscription, true);
 assert.equal(created.packageDeliveries, 4);
 assert.equal(created.perDeliveryMinor, 50000, '2 L × 250 RSD');
 assert.equal(created.subscriptionPackageMinor, 200000, '4 deliveries × 2 L × 250 RSD');
 assert.equal(created.oneTimeMinor, 70000, '2 L × 350 RSD');
 assert.equal(created.lines[0].cadence, 'weekly');
 // Updates obey the same rules and leave the stored package unchanged when refused.
 expectError(await patchBundle(created.id, { items: [milk(2, 'subscription', { cadence: 'biweekly' })] }), 422, 'CADENCE_UNAVAILABLE');
 expectError(await patchBundle(created.id, { items: [milk(1)] }), 422, 'MINIMUM_QUANTITY');
 expectError(await patchBundle(created.id, { items: [goat] }), 422, 'PRODUCT_INACTIVE');
 assert.equal(scalar('SELECT quantity FROM bundle_items WHERE bundle_id = ?', created.id), 2);
 const updated = expectStatus(await patchBundle(created.id, { items: [milk(4)] })).bundle;
 assert.equal(updated.subscriptionPackageMinor, 400000);
 // A package whose product goes off sale disappears from the shop by itself.
 assert.equal((await shopBundles()).some(item => item.id === created.id), true);
 database.raw.exec("UPDATE products SET is_active = 0 WHERE id = 'prod_kravlje_1l'");
 assert.equal((await shopBundles()).some(item => item.id === created.id), false);
});

test('a package is priced in the cart and at checkout exactly as its lines, once and as the four-delivery subscription', async () => {
 const created = expectStatus(await createBundle(bundle([milk(2)], { name: 'Dva litra nedeljno' })), 201).bundle;
 const [offer] = await shopBundles();
 assert.equal(offer.id, created.id);

 // Subscription: 2 L × 250 RSD × 4 deliveries + 4 × 350 RSD delivery.
 const subscriptionQuote = expectStatus(await api('/api/cart', { items: cartLines(offer, 'subscription'), deliveryDate: '2027-01-01', city: 'Beograd' }));
 assert.equal(subscriptionQuote.subtotalMinor, 200000);
 assert.equal(subscriptionQuote.deliveryOccurrences, 4);
 assert.equal(subscriptionQuote.deliveryFeeMinor, 140000);
 assert.equal(subscriptionQuote.totalMinor, 340000);
 assert.equal(subscriptionQuote.lines[0].unitPriceMinor, offer.lines[0].subscriptionUnitPriceMinor);
 assert.deepEqual(subscriptionQuote.lines[0].deliveryDates, ['2027-01-01', '2027-01-08', '2027-01-15', '2027-01-22']);

 // Once: 2 L × 350 RSD + one delivery.
 const oneTimeQuote = expectStatus(await api('/api/cart', { items: cartLines(offer, 'one_time'), deliveryDate: '2027-01-01', city: 'Beograd' }));
 assert.equal(oneTimeQuote.subtotalMinor, offer.oneTimeMinor);
 assert.equal(oneTimeQuote.deliveryFeeMinor, 35000);
 assert.equal(oneTimeQuote.totalMinor, 105000);

 const subscriptionOrder = expectStatus(await api('/api/checkout', { customer, items: cartLines(offer, 'subscription'), paymentMethod: 'cash', deliveryDate: '2027-01-01' }), 201);
 assert.equal(subscriptionOrder.order.totalMinor, 340000);
 assert.ok(subscriptionOrder.subscription?.id, JSON.stringify(subscriptionOrder));
 const orderId = subscriptionOrder.order.id;
 assert.equal(scalar('SELECT line_total_minor FROM order_items WHERE order_id = ?', orderId), 200000);
 assert.equal(scalar("SELECT cadence FROM subscription_items WHERE subscription_id = ?", subscriptionOrder.subscription.id), 'weekly');
 assert.equal(scalar('SELECT required_deliveries FROM package_lines WHERE package_id = ?', orderId), 4);

 const oneTimeOrder = expectStatus(await api('/api/checkout', { customer: { ...customer, email: 'jednom@example.test' }, items: cartLines(offer, 'one_time'), paymentMethod: 'cash', deliveryDate: '2027-01-01' }), 201);
 assert.equal(oneTimeOrder.order.totalMinor, 105000);
 assert.equal(oneTimeOrder.subscription ?? null, null);
 assert.equal(scalar('SELECT COUNT(*) FROM subscriptions s JOIN customers c ON c.id = s.customer_id WHERE c.email = ?', 'jednom@example.test'), 0);

 // A package below the minimum can never be bought around the admin check either.
 expectError(await api('/api/checkout', { customer, items: [milk(1)], paymentMethod: 'cash', deliveryDate: '2027-01-01' }), 422, 'MINIMUM_QUANTITY');

 // Hidden again: gone from the shop.
 expectStatus(await patchBundle(created.id, { isActive: false }));
 assert.deepEqual(await shopBundles(), []);
});

test('a mixed package charges its one-time line once and the subscription line four times', async () => {
 database.raw.exec("UPDATE products SET is_active = 1, allow_subscription = 0, price_minor = 45000, unit_label = '500 g' WHERE id = 'prod_sir_500g'");
 const created = expectStatus(await createBundle(bundle([milk(2), { productId: 'prod_sir_500g', quantity: 1, purchaseType: 'one_time' }])), 201).bundle;
 assert.equal(created.perDeliveryMinor, 50000 + 45000);
 assert.equal(created.subscriptionPackageMinor, 200000 + 45000);
 assert.equal(created.oneTimeMinor, 70000 + 45000);
 const [offer] = await shopBundles();
 const quote = expectStatus(await api('/api/cart', { items: cartLines(offer, 'subscription'), deliveryDate: '2027-01-01', city: 'Beograd' }));
 assert.equal(quote.subtotalMinor, created.subscriptionPackageMinor);
 assert.equal(quote.totalMinor, created.subscriptionPackageMinor + 4 * 35000);
});
