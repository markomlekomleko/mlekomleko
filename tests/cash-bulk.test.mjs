import assert from 'node:assert/strict';
import { beforeEach, afterEach, test } from 'node:test';
import { register } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { createDatabase } from './sqlite-d1.mjs';
import {prepareCustomerImport,applyCustomerImport} from '../integrations/customer-import.mjs';

const realDate = Date;
let database;
const env = { APP_ENV: 'local', PAYMENT_MODE: 'mock', BADI_MODE: 'mock', EMAIL_MODE: 'console', APP_ORIGIN: 'http://localhost', ADMIN_LEGACY_ACCESS: "true", ADMIN_SECRET: 'test-admin-secret', PAYMENT_WEBHOOK_SECRET: 'test-webhook-secret', LOCAL_AUTH_EXPOSE_TOKEN: 'true' };
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
async function delivery(date='2027-01-01') { return expectStatus(await api('/api/admin/deliveries',{action:'generate',date},{admin:true})); }

async function handover(date, status='delivered') {
 at(date+'T10:00:00Z');
 const snapshot=await delivery(date);
 for(const order of snapshot.orders) expectStatus(await api('/api/admin/deliveries',{action:'complete',id:order.id,status},{admin:true}));
 return snapshot;
}
test('cash package is prepared before payment, collected once at first handover and never moved',async()=>{
 database.raw.prepare("UPDATE settings SET value_json='35000' WHERE key='deliveryFeeMinor'").run();
 const order=await create({},[line('prod_kravlje_1l',2)]);
 assert.equal(order.order.totalMinor,340000);
 const unmaterialized=expectStatus(await api('/api/admin/delivery-preview?date=2027-01-01',null,{admin:true,method:'GET'}));
 assert.equal(unmaterialized.orders[0].cash_due_minor,340000);
 const preview=await delivery();assert.equal(preview.preparation[0].total_quantity,2);
 assert.equal((await delivery('2027-01-08')).orders.length,0);
 at('2027-01-01T10:00:00Z');const route=await delivery();const id=route.orders[0].id;
 const details=expectStatus(await api('/api/admin/delivery-preview?date=2027-01-01',null,{admin:true,method:'GET'}));
 assert.equal(details.orders[0].cash_due_minor,340000);
 expectStatus(await api('/api/admin/deliveries',{action:'complete',id,status:'delivered'},{admin:true}),409);
 assert.equal(scalar('SELECT payment_status FROM orders'),'pending');
 const body={action:'complete',id,status:'delivered',cashCollected:true};
 expectStatus(await api('/api/admin/deliveries',body,{admin:true}));
 expectStatus(await api('/api/admin/deliveries',body,{admin:true}));
 assert.equal(scalar('SELECT payment_status FROM orders'),'paid');
 assert.equal(scalar('SELECT anchor_date FROM package_lines'),'2027-01-01');
 assert.equal(scalar('SELECT next_delivery_date FROM subscriptions'),'2027-01-08');
 assert.equal(scalar("SELECT COUNT(*) FROM audit_log WHERE action='cash.collected'"),1);
 assert.equal(scalar("SELECT COUNT(*) FROM fiscal_receipts WHERE kind='advance'"),1);
 for(const date of ['2027-01-08','2027-01-15','2027-01-22']) {
  const next=expectStatus(await api('/api/admin/delivery-preview?date='+date,null,{admin:true,method:'GET'}));
  assert.equal(next.orders[0].cash_due_minor,0);await handover(date);
 }
 assert.equal(scalar("SELECT SUM(delivered_quantity) FROM delivery_items di JOIN delivery_orders dor ON dor.id=di.delivery_order_id WHERE dor.status='delivered'"),8);
 assert.equal(scalar("SELECT status FROM subscription_packages"),'completed');
 assert.equal(scalar("SELECT COUNT(*) FROM fiscal_receipts WHERE kind='final'"),4);
});
test('imported customer logs into the existing balance and fiscal allocations start after historical deliveries',async()=>{
 const db={first:(sql,...bindings)=>database.prepare(sql).bind(...bindings).first(),batch:statements=>database.batch(statements.map(s=>database.prepare(s.sql).bind(...(s.bindings??[]))))};
 const row={external_customer_id:'legacy-1',full_name:'Uvezeni kupac',email:'import@example.test',phone:'+381600000000',address:'Test 1',city:'Beograd',postal_code:'11000',external_order_id:'legacy-package',next_delivery_date:'2027-01-01',paid:'true',payment_method:'cash',advance_provider:'fiscomm',advance_mode:'live',advance_invoice_number:'OLD-ADVANCE',advance_time:'2026-12-20T10:00:00Z',purchased_at:'2026-12-20T10:00:00Z',total_rsd:'3400',delivery_fee_rsd:'1400',remaining_rsd:'1700',delivery_tax_label:'A',product_id:'prod_kravlje_1l',cadence:'weekly',quantity:'2',delivered_quantity:'4',unit_price_rsd:'250',net_product_rsd:'2000',allocated_delivery_rsd:'1400',tax_label:'A'};
 const plan=await prepareCustomerImport([row],{db,batchId:'marko-import',validatePackage:async()=>{}});assert.deepEqual(plan.errors,[]);
 await applyCustomerImport(plan,{db,approvedHash:plan.approvalHash});
 const account=await api('/api/account',null,{method:'GET',cookie:session()});expectStatus(account);
 await handover('2027-01-01');assert.equal(scalar('SELECT unit_offset FROM fiscal_delivery_allocations'),4);
 await handover('2027-01-08');assert.equal(scalar('SELECT SUM(quantity) FROM fiscal_delivery_allocations'),4);assert.equal(scalar('SELECT status FROM subscription_packages'),'completed');
 assert.equal(scalar("SELECT COUNT(*) FROM fiscal_receipts WHERE kind='advance'"),1);
});
test('Indjija stays unavailable until its schedule is approved and Novi Sad remains Friday-only',async()=>{
 const customer={...checkoutData().customer,city:'Inđija',postalCode:'22320'};
 expectStatus(await api('/api/checkout',checkoutData([line()],{customer})),422);
 expectStatus(await api('/api/admin/settings',{indjijaEnabled:true},{admin:true,method:'PATCH'}),422);
 expectStatus(await api('/api/admin/settings',{indjijaEnabled:true,indjijaDeliveryWeekdays:[5],servicePostalCodes:['11','21']},{admin:true,method:'PATCH'}),422);
 expectStatus(await api('/api/admin/settings',{indjijaEnabled:true,indjijaDeliveryWeekdays:[5],servicePostalCodes:['11','21','22320']},{admin:true,method:'PATCH'}));
 expectStatus(await api('/api/checkout',checkoutData([line()],{customer})),201);
 expectStatus(await api('/api/checkout',checkoutData([line()],{customer:{...customer,city:'Novi Sad',postalCode:'21000'},deliveryDate:'2027-01-05'})),422);
});
test('approved Indjija weekday outside Belgrade schedule reaches checkout, admin options and calendar',async()=>{
 expectStatus(await api('/api/admin/settings',{indjijaEnabled:true,indjijaDeliveryWeekdays:[3],servicePostalCodes:['11','21','22320']},{admin:true,method:'PATCH'}));
 const options=expectStatus(await api('/api/admin/orders/quote',null,{admin:true,method:'GET'}));assert.deepEqual(options.deliveryWeekdaysByCity['Inđija'],[3]);assert.ok(options.dates.includes('2027-01-06'));assert.deepEqual(options.deliveryWeekdaysByCity['Novi Sad'],[5]);
 const customer={...checkoutData().customer,city:'Inđija',postalCode:'22320'};
 expectStatus(await api('/api/checkout',checkoutData([line()],{customer,deliveryDate:'2027-01-06'})),201);
 const calendar=expectStatus(await api('/api/admin/delivery-calendar?from=2027-01-06&to=2027-01-06',null,{admin:true,method:'GET'}));assert.ok(JSON.stringify(calendar).includes('2027-01-06'));
});
test('failed Novi Sad one-off visit is rescheduled to Friday',async()=>{
 const customer={...checkoutData().customer,city:'Novi Sad',postalCode:'21000'};
 await create({customer},[line('prod_kravlje_1l',2,'one_time')]);
 at('2027-01-01T10:00:00Z');const route=await delivery();
 expectStatus(await api('/api/admin/deliveries',{action:'complete',id:route.orders[0].id,status:'failed'},{admin:true}));
 assert.equal(scalar('SELECT delivery_date FROM orders'),'2027-01-08');
});
test('failed first cash attempt preserves money and quantities, and another packed route cannot overlap it',async()=>{
 await create();at('2027-01-01T10:00:00Z');const first=await delivery();
 assert.equal((await delivery('2027-01-08')).orders.length,0);
 expectStatus(await api('/api/admin/deliveries',{action:'complete',id:first.orders[0].id,status:'failed'},{admin:true}));
 assert.equal(scalar('SELECT payment_status FROM orders'),'pending');
 assert.equal(scalar('SELECT COUNT(*) FROM fiscal_delivery_allocations'),0);
 at('2027-01-08T10:00:00Z');const next=await delivery('2027-01-08');assert.equal(next.preparation[0].total_quantity,3);
 const insights=expectStatus(await api('/api/admin/insights',null,{admin:true,method:'GET'}));assert.equal(insights.totals.cashDueMinor,scalar('SELECT total_minor FROM orders'));
 expectStatus(await api('/api/admin/deliveries',{action:'complete',id:next.orders[0].id,status:'delivered',cashCollected:true,items:next.orders[0].items.map(i=>({id:i.id,deliveredQuantity:1}))},{admin:true}));
 assert.equal(scalar('SELECT SUM(delivered_quantity) FROM delivery_items'),1);
});
test('bulk payment preserves a packed cash visit and rejects stale snapshots',async()=>{
 const order=await create();at('2027-01-01T10:00:00Z');await delivery();
 const current=database.raw.prepare('SELECT * FROM orders').get();
 const body={confirmed:true,orders:[{id:order.order.id,expectedUpdatedAt:current.updated_at}]};
 const result=expectStatus(await api('/api/admin/orders/bulk-payment',body,{admin:true}));assert.equal(result.succeeded,1);
 assert.equal(scalar('SELECT anchor_date FROM package_lines'),'2027-01-01');
 assert.equal(scalar('SELECT next_delivery_date FROM subscriptions'),'2027-01-08');
});
test('mixed first visit counts the package cash only once in the daily overview',async()=>{
 const created=await create({},[line('prod_kravlje_1l',1,'one_time'),line('prod_kravlje_1l',2)]);
 at('2027-01-01T10:00:00Z');
 const insights=expectStatus(await api('/api/admin/insights',null,{admin:true,method:'GET'}));
 assert.equal(insights.upcoming.orders.length,2);assert.equal(insights.totals.cashDueMinor,created.order.totalMinor);
});
test('concurrent bulk requests share one result and an expired request resumes without a second payment',async()=>{
 const order=await create();const before=database.raw.prepare('SELECT updated_at FROM orders WHERE id=?').get(order.order.id);
 const body={confirmed:true,orders:[{id:order.order.id,expectedUpdatedAt:before.updated_at}]},key=randomUUID();
 const results=await Promise.all([api('/api/admin/orders/bulk-payment',body,{admin:true,key}),api('/api/admin/orders/bulk-payment',body,{admin:true,key})]);
 assert.ok(results.some(r=>r.status===200));assert.ok(results.every(r=>r.status===200||r.status===409));
 const cached=expectStatus(await api('/api/admin/orders/bulk-payment',body,{admin:true,key}));assert.equal(cached.succeeded,1);
 const audits=scalar("SELECT COUNT(*) FROM audit_log WHERE action='order.updated'");
 database.raw.prepare("UPDATE idempotency_keys SET response_json=? WHERE namespace='bulk-cash-payment' AND key=?").run(JSON.stringify({leaseUntil:'2020-01-01T00:00:00Z'}),key);
 const resumed=expectStatus(await api('/api/admin/orders/bulk-payment',body,{admin:true,key}));assert.equal(resumed.succeeded,1);assert.equal(resumed.results[0].replay,true);
 assert.equal(scalar("SELECT COUNT(*) FROM audit_log WHERE action='order.updated'"),audits);
});
function insertClone(table,row) {
 const keys=Object.keys(row);database.raw.prepare(`INSERT INTO ${table}(${keys.join(',')}) VALUES(${keys.map(()=>'?').join(',')})`).run(...keys.map(k=>row[k]));
}
async function fiftyOrders(){
 await create({},[line('prod_kravlje_1l',1,'one_time')]);
 const source=database.raw.prepare('SELECT * FROM orders').get();const item=database.raw.prepare('SELECT * FROM order_items').get();
 for(let i=1;i<50;i++){const id=randomUUID();insertClone('orders',{...source,id,order_number:'BULK-'+i,idempotency_key:randomUUID()});insertClone('order_items',{...item,id:randomUUID(),order_id:id});}
 return database.raw.prepare('SELECT * FROM orders ORDER BY id').all();
}
test('50 cash orders with three exclusions process 47 exactly once and enforce version, scope and origin',async()=>{
 const orders=await fiftyOrders();const chosen=orders.slice(3);
 const body={confirmed:true,orders:chosen.map(o=>({id:o.id,expectedUpdatedAt:o.updated_at}))};const key=randomUUID();
 const a=expectStatus(await api('/api/admin/orders/bulk-payment',body,{admin:true,key}));assert.equal(a.succeeded,47);
 const b=expectStatus(await api('/api/admin/orders/bulk-payment',body,{admin:true,key}));assert.deepEqual(a,b);
 assert.equal(scalar("SELECT COUNT(*) FROM orders WHERE payment_status='paid'"),47);
 expectStatus(await api('/api/admin/orders/bulk-payment',{...body,orders:[]},{admin:true,key}),422);
 expectStatus(await api('/api/admin/orders/bulk-payment',{...body,orders:[{id:orders[0].id,expectedUpdatedAt:orders[0].updated_at}]},{admin:true,key}),409);
 const stale=expectStatus(await api('/api/admin/orders/bulk-payment',{confirmed:true,orders:[{id:orders[0].id,expectedUpdatedAt:'stale'}]},{admin:true}));assert.equal(stale.failed,1);assert.equal(stale.results[0].code,'ORDER_VERSION_CONFLICT');
 const denied=await api('/api/admin/orders/bulk-payment',body,{admin:true,extra:{Origin:'https://evil.example.test'}});expectStatus(denied,403);
 expectStatus(await api('/api/admin/orders/bulk-payment',body),403);
});
test('bulk delivery processes 47 selected stops, replays safely and rejects another date',async()=>{
 await fiftyOrders();at('2027-01-01T10:00:00Z');const route=await delivery();assert.equal(route.orders.length,50);
 const ids=route.orders.slice(3).map(o=>o.id);const body={date:'2027-01-01',confirmed:true,deliveryOrderIds:ids,cashCollected:true};const key=randomUUID();
 const a=expectStatus(await api('/api/admin/deliveries/bulk-complete',body,{admin:true,key}));assert.equal(a.succeeded,47);
 expectStatus(await api('/api/admin/deliveries/bulk-complete',body,{admin:true,key}));
 assert.equal(scalar("SELECT COUNT(*) FROM delivery_orders WHERE status='delivered'"),47);
 assert.equal(scalar("SELECT COUNT(*) FROM orders WHERE payment_status='paid'"),47);
 const wrong=expectStatus(await api('/api/admin/deliveries/bulk-complete',{...body,date:'2027-01-08',deliveryOrderIds:[route.orders[0].id]},{admin:true}));assert.equal(wrong.failed,1);
 assert.equal(scalar("SELECT COUNT(*) FROM delivery_orders WHERE status='locked'"),3);
});
test('declined card packages stay outside preparation',async()=>{
 expectStatus(await api('/api/checkout',checkoutData([line()],{paymentMethod:'card',paymentToken:'mock-decline'})),402);
 await create();database.raw.exec("UPDATE orders SET payment_method='card',payment_status='failed'");
 assert.equal((await delivery()).orders.length,0);
});
