import assert from 'node:assert/strict';
import { beforeEach, afterEach, test } from 'node:test';
import { register } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { createDatabase } from './sqlite-d1.mjs';

const realDate = Date;
let database;
const env = { APP_ENV: 'local', APP_ORIGIN: 'http://localhost', ADMIN_SECRET: 'test-admin-secret', PAYMENT_WEBHOOK_SECRET: 'test-webhook-secret', LOCAL_AUTH_EXPOSE_TOKEN: 'true' };
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
 database.raw.prepare("INSERT INTO auth_tokens (id, customer_id,email,token_hash,kind,expires_at) VALUES (?,?,?,?,'session','2030-01-01T00:00:00Z')").run(randomUUID(),c.id,c.email,createHash('sha256').update(token).digest('hex'));
 return 'mm_session='+token;
}
const scalar=(sql,...args)=>Object.values(database.raw.prepare(sql).get(...args))[0];
async function mutate(id, action, details={}, cookie=session(), key=randomUUID()) { const version=scalar('SELECT version FROM subscriptions WHERE id=?',id); return api('/api/account/subscriptions/'+id,{action,expectedVersion:version,...details},{cookie,key}); }
async function delivery(date='2027-01-01') { return expectStatus(await api('/api/admin/deliveries',{action:'generate',date},{admin:true})); }

test('T-04: independent mixed-cart monthly total is 6,350 RSD', async()=>{
 const items=[line(),line('prod_jogurt_1l',1,'subscription','biweekly'),line('prod_sir_500g',1,'one_time')];
 const quote=expectStatus(await api('/api/cart',{items,deliveryDate:'2027-01-01'}));
 assert.equal(quote.totalMinor,635000); assert.equal(quote.deliveryOccurrences,5);
 const order=await create({},items); assert.equal(order.order.totalMinor,635000);
 assert.equal(scalar('SELECT COUNT(*) FROM orders'),1);
});
test('T-04/T-46: mixed-cart one-time item appears exactly on its first delivery',async()=>{
 await create({},[line(),line('prod_jogurt_1l',1,'subscription','biweekly'),line('prod_sir_500g',1,'one_time')]);
 const first=await delivery();
 assert.equal(first.preparation.find(p=>p.product_id==='prod_sir_500g')?.total_quantity,1);
 assert.equal(first.preparation.find(p=>p.product_id==='prod_kravlje_1l')?.total_quantity,3);
 const next=await delivery('2027-01-08');
 assert.ok(!next.preparation.some(p=>p.product_id==='prod_sir_500g'));
 assert.ok(!next.preparation.some(p=>p.product_id==='prod_jogurt_1l'));
});
test('T-11: checkout replay and concurrent requests create one order',async()=>{
 const key=randomUUID(), data=checkoutData();
 const both=await Promise.all([api('/api/checkout',data,{key}),api('/api/checkout',data,{key})]);
 both.forEach(r=>expectStatus(r,201));
 assert.equal(both[0].body.order.id,both[1].body.order.id);
 assert.equal(scalar('SELECT COUNT(*) FROM orders'),1);
 expectStatus(await api('/api/checkout',{...data,items:[line('prod_kravlje_1l',4)]},{key}),409);
});
test('T-03/T-07: invalid quantities, unavailable products and fake prices cannot create orders',async()=>{
 for (const q of [0,-1,1.5,101]) expectStatus(await api('/api/checkout',checkoutData([line('prod_kravlje_1l',q)])),422);
 const order=await create({totalMinor:1},[line()]); assert.equal(order.order.totalMinor,550000);
 database.raw.exec("UPDATE products SET is_active=0 WHERE id='prod_kozje_1l'");
 expectStatus(await api('/api/checkout',checkoutData([line('prod_kozje_1l')])),409);
});
test('T-09/T-34: checkout rejects wrong weekday and invalid postal code',async()=>{
 expectStatus(await api('/api/checkout',checkoutData([line()],{deliveryDate:'2027-01-02'})),422);
 expectStatus(await api('/api/checkout',{...checkoutData(),customer:{...checkoutData().customer,postalCode:'11'}}),422);
 assert.equal(scalar('SELECT COUNT(*) FROM orders'),0);
});
test('T-17/T-18/T-19: magic link single use and logout revoke actual session',async()=>{
 await create();
 const link=expectStatus(await api('/api/auth/magic-link',{email:'qa@example.test'}),202);
 const token=link.token ?? new URL(link.url??link.magicLinkUrl??link.localUrl).searchParams.get('token');
 const exchange=await api('/api/auth/magic-link/exchange',{token}); expectStatus(exchange);
 const cookie=exchange.headers.get('set-cookie').split(';')[0];
 expectStatus(await api('/api/auth/magic-link/exchange',{token}),401);
 expectStatus(await api('/api/account',null,{method:'GET',cookie}));
 expectStatus(await api('/api/auth/logout',{}, {cookie}));
 expectStatus(await api('/api/account',null,{method:'GET',cookie}),401);
});
test('T-22/T-31: actual concurrent mutations keep one version and projection',async()=>{
 const order=await create(); const id=order.subscription.id,cookie=session();
 const item=database.raw.prepare('SELECT id FROM subscription_items LIMIT 1').get().id;
 await delivery();
 const outcomes=await Promise.all([api('/api/account/subscriptions/'+id,{action:'update_item',expectedVersion:1,itemId:item,quantity:4},{cookie}),api('/api/account/subscriptions/'+id,{action:'update_item',expectedVersion:1,itemId:item,quantity:5},{cookie})]);
 assert.deepEqual(outcomes.map(r=>r.status).sort(),[200,409]);
 assert.equal(scalar('SELECT version FROM subscriptions WHERE id=?',id),2);
 const qty=scalar('SELECT quantity FROM subscription_items WHERE id=?',item);
 assert.equal(scalar('SELECT SUM(quantity) FROM delivery_items WHERE product_id=?','prod_kravlje_1l'),qty);
});
test('T-23: add a recurring product without altering existing item cadence',async()=>{
 const order=await create(); const id=order.subscription.id;
 expectStatus(await mutate(id,'add_item',{productId:'prod_jogurt_1l',quantity:1,cadence:'biweekly'}));
 assert.equal(scalar("SELECT COUNT(*) FROM subscription_items WHERE subscription_id=? AND status='active'",id),2);
 assert.equal((await delivery()).preparation.find(p=>p.product_id==='prod_jogurt_1l')?.total_quantity,1);
 assert.ok(!(await delivery('2027-01-08')).preparation.some(p=>p.product_id==='prod_jogurt_1l'));
});
test('T-25/T-45: next-only addon is consumed once by lock',async()=>{
 const order=await create(); const id=order.subscription.id;
 expectStatus(await mutate(id,'add_next_only',{productId:'prod_sir_500g',quantity:1}));
 assert.equal((await delivery()).preparation.find(p=>p.product_id==='prod_sir_500g')?.total_quantity,1);
 expectStatus(await api('/api/admin/deliveries',{action:'lock',date:'2027-01-01',force:true},{admin:true}));
 assert.ok(scalar('SELECT consumed_at FROM next_delivery_addons'));
 assert.ok(!(await delivery('2027-01-08')).preparation.some(p=>p.product_id==='prod_sir_500g'));
});
test('T-27/T-28/T-29/T-30: skip, pause, resume and terminal cancel update persisted state',async()=>{
 const order=await create(); const id=order.subscription.id;
 expectStatus(await mutate(id,'skip_next'));
 assert.equal(scalar('SELECT next_delivery_date FROM subscriptions'),'2027-01-08');
 expectStatus(await mutate(id,'pause',{pauseUntil:'2027-02-01'}));
 assert.equal(scalar('SELECT status FROM subscriptions'),'paused');
 expectStatus(await mutate(id,'resume'));
 assert.equal(scalar('SELECT status FROM subscriptions'),'active');
 expectStatus(await mutate(id,'cancel'));
 assert.equal(scalar('SELECT status FROM subscriptions'),'cancelled');
 expectStatus(await mutate(id,'resume'),409);
});
test('T-24: removing the final recurring item cannot leave a billable empty subscription',async()=>{
 const order=await create(); const id=order.subscription.id,itemId=scalar('SELECT id FROM subscription_items');
 expectStatus(await mutate(id,'remove_item',{itemId}));
 assert.equal(scalar('SELECT status FROM subscriptions'),'cancelled');
});
test('T-34: exact cutoff is rejected and does not create mutation records',async()=>{
 const order=await create();
 at('2026-12-31T07:00:00Z');
 expectStatus(await mutate(order.subscription.id,'skip_next'),409);
 assert.equal(scalar('SELECT COUNT(*) FROM subscription_mutation_versions'),0);
});
test('T-37: paid reduction after two deliveries creates exactly 750 RSD credit',async()=>{
 const order=await create({paymentMethod:'card',paymentToken:'test-provider-token'}),id=order.subscription.id,itemId=scalar('SELECT id FROM subscription_items');
 database.raw.prepare("UPDATE subscriptions SET next_delivery_date='2027-01-15' WHERE id=?").run(id);
 at('2027-01-13T10:00:00Z');
 expectStatus(await mutate(id,'update_item',{itemId,quantity:2}));
 assert.equal(scalar('SELECT SUM(amount_minor) FROM credits_ledger'),75000);
 assert.equal(scalar('SELECT total_minor FROM orders WHERE id=?',order.order.id),550000);
});
test('T-35/T-38: monthly billing carries excess credit and stays idempotent',async()=>{
 const order=await create(),id=order.subscription.id,cid=scalar('SELECT id FROM customers');
 database.raw.prepare("UPDATE subscriptions SET next_delivery_date='2027-02-05' WHERE id=?").run(id);
 database.raw.prepare("INSERT INTO credits_ledger (id,customer_id,subscription_id,amount_minor,reason,status) VALUES (?,?,?,600000,'test','open')").run(randomUUID(),cid,id);
 const key=randomUUID();
 expectStatus(await api('/api/jobs/billing',{month:'2027-02'},{admin:true,key}));
 expectStatus(await api('/api/jobs/billing',{month:'2027-02'},{admin:true,key}));
 assert.equal(scalar("SELECT COUNT(*) FROM orders WHERE substr(delivery_date,1,7)='2027-02'"),1);
 assert.equal(scalar("SELECT total_minor FROM orders WHERE substr(delivery_date,1,7)='2027-02'"),0);
 assert.equal(scalar("SELECT SUM(amount_minor) FROM credits_ledger WHERE status='open'"),160000);
});
test('T-51: admin edits open one-time order quantity and shipping address atomically',async()=>{
 const order=await create({},[line('prod_kravlje_1l',2,'one_time')]); await delivery();
 expectStatus(await api('/api/admin/orders',{id:order.order.id,items:[{productId:'prod_kravlje_1l',quantity:4}],customer:{addressLine1:'Nova test ulica 2',city:'Beograd',postalCode:'11000'}},{method:'PATCH',admin:true}));
 assert.equal(scalar('SELECT quantity FROM order_items WHERE order_id=?',order.order.id),4);
 assert.equal(scalar('SELECT total_minor FROM orders WHERE id=?',order.order.id),135000);
 const exported=expectStatus(await api('/api/admin/deliveries?date=2027-01-01',null,{method:'GET',admin:true}));
 assert.equal(exported.preparation[0].total_quantity,4);
 assert.ok(JSON.stringify(exported).includes('Nova test ulica 2'));
});
test('T-73: last promo usage cannot be consumed by two simultaneous orders',async()=>{
 database.raw.exec("UPDATE promo_codes SET is_active=1,usage_limit=1,times_used=0,minimum_order_minor=0,starts_at=NULL,ends_at=NULL WHERE id='promo_demo_welcome'");
 const code=scalar("SELECT code FROM promo_codes WHERE id='promo_demo_welcome'");
 const result=await Promise.all([api('/api/checkout',checkoutData([line()],{promoCode:code})),api('/api/checkout',checkoutData([line()],{promoCode:code}))]);
 assert.equal(result.filter(r=>r.status===201).length,1,JSON.stringify(result));
 assert.equal(scalar("SELECT times_used FROM promo_codes WHERE id='promo_demo_welcome'"),1);
});
