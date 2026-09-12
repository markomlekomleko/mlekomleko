import assert from 'node:assert/strict';
import { beforeEach, afterEach, test } from 'node:test';
import { register } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { createDatabase } from './sqlite-d1.mjs';

const realDate = Date;
let database;
const env = { APP_ENV: 'local', PAYMENT_MODE: 'mock', APP_ORIGIN: 'http://localhost', ADMIN_LEGACY_ACCESS: "true", ADMIN_SECRET: 'test-admin-secret', PAYMENT_WEBHOOK_SECRET: 'test-webhook-secret', LOCAL_AUTH_EXPOSE_TOKEN: 'true' };
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
 database.raw.exec("UPDATE products SET is_active=1, allow_subscription=1; UPDATE products SET price_minor=25000, subscription_price_minor=25000 WHERE id='prod_kravlje_1l'; UPDATE products SET price_minor=15000, subscription_price_minor=15000 WHERE id='prod_jogurt_1l'; UPDATE products SET price_minor=40000, subscription_price_minor=40000 WHERE id='prod_sir_500g';");
});
afterEach(() => { database.close(); globalThis.Date = realDate; });
async function api(path, data, { method = 'POST', admin = false, cookie, key = randomUUID(), extra = {} } = {}) {
 const headers = { 'content-type': 'application/json', Origin: 'http://localhost', 'Idempotency-Key': key, ...extra };
 if (admin) headers['x-admin-secret'] = env.ADMIN_SECRET;
 if (cookie) headers.cookie = cookie;
 const res = await worker.fetch(new Request('http://localhost' + path, { method, headers, ...(method !== 'GET' ? { body: JSON.stringify(data) } : {}) }), env, {waitUntil(){},passThroughOnException(){}});
 const text = await res.text();
 let body; try { body=JSON.parse(text); } catch { body=text; }
 return {status:res.status,body,headers:res.headers};
}
function line(productId='prod_kravlje_1l', quantity=3, purchaseType='subscription', cadence='weekly') { return { productId, quantity, purchaseType, ...(purchaseType==='subscription'?{cadence}:{}) }; }
function checkoutData(items=[line()],extra={}) { return { customer:{email:'qa@example.test',fullName:'Željko QA Kupac',phone:'+381600000000',addressLine1:'Test ulica 1',city:'Beograd',postalCode:'11000'},items,paymentMethod:'cash',deliveryDate:'2027-01-01',...extra }; }
function expectStatus(r,status=200) { assert.equal(r.status,status,JSON.stringify(r.body)); return r.body; }
async function create(extra={},items=[line()]) { return expectStatus(await api('/api/checkout',checkoutData(items,extra)),201); }
function session() {
 const c=database.raw.prepare('SELECT id,email FROM customers LIMIT 1').get();
 const token=randomUUID()+randomUUID();
 database.raw.prepare("INSERT INTO auth_tokens (id, customer_id,email,token_hash,kind,expires_at) VALUES (?,?,?,?,'session','2030-01-01T00:00:00Z')").run(randomUUID(),c.id,c.email,createHash('sha256').update(token).digest('base64url'));
 return 'mm_session='+token;
}
const scalar=(sql,...args)=>Object.values(database.raw.prepare(sql).get(...args))[0];
async function mutate(id, action, details={}, cookie=session(), key=randomUUID()) { const version=scalar('SELECT version FROM subscriptions WHERE id=?',id); return api('/api/account/subscriptions/'+id,{action,expectedVersion:version,...details},{cookie,key,method:'PATCH'}); }
async function delivery(date='2027-01-01') { return expectStatus(await api('/api/admin/deliveries',{action:'generate',date},{admin:true})); }


test('account exposes customer-scoped delivery snapshots, skips, cutoff and cadence', async () => {
  const created = await create({}, [line(), line('prod_jogurt_1l', 1, 'subscription', 'biweekly'), line('prod_sir_500g', 1, 'one_time')]);
  const cookie = session();
  const otherData = checkoutData([line()], {customer: {...checkoutData().customer, email: 'other@example.test'}});
  expectStatus(await api('/api/checkout', otherData), 201);
  await delivery();
  const customerId = scalar("SELECT id FROM customers WHERE email='qa@example.test'");
  database.raw.prepare("UPDATE delivery_orders SET status='delivered' WHERE customer_id=?").run(customerId);
  let account = expectStatus(await api('/api/account', null, {method: 'GET', cookie}));
  assert.equal(account.deliveryHistory.length, 2); // Subscription + first-order one-time snapshot.
  assert.ok(account.deliveryHistory.every(entry => entry.status === 'delivered'));
  assert.equal(account.deliveryHistory.flatMap(entry => entry.items).reduce((sum, item) => sum + item.quantity, 0), 5);
  assert.equal(account.oneTimeDeliveries[0].items[0].quantity, 1);
  assert.equal(account.subscriptions[0].locked, false);
  assert.ok(account.subscriptions[0].cutoffAt.endsWith('Z'));
  assert.equal(account.subscriptions[0].afterSkipDate, '2027-01-08');
  expectStatus(await mutate(created.subscription.id, 'skip_next', {}, cookie));
  account = expectStatus(await api('/api/account', null, {method: 'GET', cookie}));
  assert.ok(account.deliveryHistory.some(entry => entry.status === 'skipped' && entry.date === '2027-01-01'));
  assert.equal(account.subscriptions[0].items.find(item => item.cadence === 'biweekly').dueNext, false);
  // The mixed-cart one-time purchase stays on its original date.
  assert.equal(account.oneTimeDeliveries[0].date, '2027-01-01');
});

test('account exposes locked snapshots separately from the advanced subscription', async () => {
  await create();
  const cookie = session();
  await delivery();
  expectStatus(await api('/api/admin/deliveries', {action: 'lock', date: '2027-01-01', force: true}, {admin: true}));
  const account = expectStatus(await api('/api/account', null, {method: 'GET', cookie}));
  assert.equal(account.deliveryHistory[0].status, 'locked');
  assert.equal(account.deliveryHistory[0].date, '2027-01-01');
  assert.equal(account.subscriptions[0].nextDeliveryDate, '2027-01-08');
});
