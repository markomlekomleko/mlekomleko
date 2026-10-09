import assert from 'node:assert/strict';
import { beforeEach, afterEach, test } from 'node:test';
import { register } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { createDatabase } from './sqlite-d1.mjs';

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
async function mutate(id, action, details={}, cookie=session(), key=randomUUID()) { const version=scalar('SELECT version FROM subscriptions WHERE id=?',id); return api('/api/account/subscriptions/'+id,{action,expectedVersion:version,...details},{cookie,key,method:'PATCH'}); }
async function delivery(date='2027-01-01') { return expectStatus(await api('/api/admin/deliveries',{action:'generate',date},{admin:true})); }

async function paid(items=[line()], extra={}) { return create({paymentMethod:'card',paymentToken:'mock-token',...extra},items); }
async function handover(date, status='delivered') {
 at(date+'T10:00:00Z');
 const snapshot=await delivery(date);
 for(const order of snapshot.orders) expectStatus(await api('/api/admin/deliveries',{action:'complete',id:order.id,status},{admin:true}));
 return snapshot;
}
test('fixed package quantity and price at month end; quote equals charged amount',async()=>{
 const items=[line(),line('prod_jogurt_1l',2,'subscription','biweekly'),line('prod_sir_500g',1,'one_time')];
 const q=expectStatus(await api('/api/cart',checkoutData(items,{deliveryDate:'2027-01-29'})));
 assert.deepEqual(q.lines.map(x=>x.occurrences),[4,2,1]);
 const order=await paid(items,{deliveryDate:'2027-01-29'});
 assert.equal(order.order.totalMinor,q.totalMinor);
 assert.equal(scalar('SELECT SUM(required_deliveries) FROM package_lines'),7);
});
test('weekly package issues advance on payment, final only on fourth confirmed handover, once',async()=>{
 const order=await paid();
 assert.equal(scalar("SELECT COUNT(*) FROM fiscal_receipts WHERE kind='advance' AND status='issued'"),1);
 await delivery('2027-01-01');
 assert.equal(scalar("SELECT COUNT(*) FROM fiscal_receipts WHERE kind='final'"),0);
 for(const date of ['2027-01-01','2027-01-08','2027-01-15']) {await handover(date);assert.equal(scalar("SELECT COUNT(*) FROM fiscal_receipts WHERE kind='final'"),0);}
 const last=await handover('2027-01-22');
 assert.equal(scalar("SELECT status FROM subscription_packages"),'completed');
 assert.equal(scalar("SELECT COUNT(*) FROM fiscal_receipts WHERE kind='final' AND status='issued'"),1);
 assert.equal(scalar("SELECT COUNT(*) FROM fiscal_receipts WHERE kind='refund' AND status='issued'"),1);
 expectStatus(await api('/api/admin/deliveries',{action:'complete',id:last.orders[0].id,status:'delivered'},{admin:true}));
 assert.equal(scalar("SELECT COUNT(*) FROM outbox WHERE topic='fiscal.final.requested'"),1);
 assert.equal(scalar("SELECT COUNT(*) FROM outbox WHERE topic='email.fiscal_document.requested'"),3);
 assert.equal(scalar('SELECT fulfillment_status FROM orders WHERE id=?',order.order.id),'delivered');
});
test('biweekly package paused across months retains two deliveries and avoids duplicate billing',async()=>{
 const order=await paid([line('prod_kravlje_1l',3,'subscription','biweekly')]);
 expectStatus(await mutate(order.subscription.id,'pause',{pauseUntil:'2027-03-01'}));
 expectStatus(await api('/api/jobs/billing',{month:'2027-02'},{admin:true}));
 assert.equal(scalar('SELECT COUNT(*) FROM orders'),1);
 assert.equal(scalar('SELECT COUNT(*) FROM credits_ledger'),0);
 assert.equal((await delivery('2027-02-12')).orders.length,0);
 await handover('2027-03-12');
 assert.equal(scalar("SELECT COUNT(*) FROM fiscal_receipts WHERE kind='final'"),0);
 await handover('2027-03-26');
 assert.equal(scalar("SELECT COUNT(*) FROM fiscal_receipts WHERE kind='final' AND status='issued'"),1);
});
test('skip and failed delivery preserve entitlement; package takes five attempts after one failure',async()=>{
 const order=await paid();
 expectStatus(await mutate(order.subscription.id,'skip_next'));
 assert.equal((await delivery('2027-01-01')).orders.length,0);
 await handover('2027-01-08','failed');
 for(const date of ['2027-01-15','2027-01-22','2027-01-29']) await handover(date);
 assert.equal(scalar("SELECT COUNT(*) FROM fiscal_receipts WHERE kind='final'"),0);
 await handover('2027-02-05');
 assert.equal(scalar("SELECT COUNT(*) FROM fiscal_receipts WHERE kind='final' AND status='issued'"),1);
 assert.equal(scalar('SELECT COUNT(*) FROM credits_ledger'),0);
});
test('mixed cart waits for both rhythms and one-time item; all actual quantities are conserved',async()=>{
 await paid([line(),line('prod_jogurt_1l',2,'subscription','biweekly'),line('prod_sir_500g',1,'one_time')]);
 for(const date of ['2027-01-01','2027-01-08','2027-01-15','2027-01-22']) await handover(date);
 const totals=database.raw.prepare("SELECT product_id,SUM(quantity) AS quantity FROM delivery_items di JOIN delivery_orders dor ON dor.id=di.delivery_order_id WHERE dor.status='delivered' GROUP BY product_id ORDER BY product_id").all();
 assert.deepEqual(totals.map(row=>[row.product_id,row.quantity]),[['prod_jogurt_1l',4],['prod_kravlje_1l',12],['prod_sir_500g',1]]);
 assert.equal(scalar("SELECT COUNT(*) FROM fiscal_receipts WHERE kind='final' AND status='issued'"),1);
});
test('future catalog and subscription edits never change purchased quantities, price or cadence',async()=>{
 const order=await paid(), id=scalar('SELECT id FROM subscription_items');
 expectStatus(await mutate(order.subscription.id,'update_item',{itemId:id,quantity:1,cadence:'biweekly'}));
 expectStatus(await api('/api/admin/products/prod_kravlje_1l',{subscriptionPriceMinor:99900},{admin:true,method:'PATCH'}));
 const next=await delivery('2027-01-08');
 assert.equal(next.preparation[0].total_quantity,3);
 assert.equal(next.orders[0].items[0].unit_price_minor,25000);
 assert.equal(scalar('SELECT COUNT(*) FROM credits_ledger'),0);
});
test('paid cancellation disables renewal and finishes remaining package; renewal never duplicates an open package',async()=>{
 const order=await paid();
 expectStatus(await mutate(order.subscription.id,'cancel'));
 assert.equal(scalar('SELECT renewal_enabled FROM subscriptions'),0);
 for(const date of ['2027-01-01','2027-01-08','2027-01-15','2027-01-22']) await handover(date);
 assert.equal(scalar('SELECT status FROM subscriptions'),'cancelled');
 expectStatus(await api('/api/jobs/billing',{month:'2027-02'},{admin:true}));
 assert.equal(scalar('SELECT COUNT(*) FROM orders'),1);
});
test('unpaid packages are visible to admin but never prepared or finalized',async()=>{
 const order=await create();
 assert.equal((await delivery()).orders.length,0);
 const progress=expectStatus(await api('/api/admin/packages',null,{admin:true,method:'GET'}));
 assert.equal(progress.lines[0].payment_status,'pending');
 expectStatus(await api('/api/admin/orders',{id:order.order.id,fulfillmentStatus:'delivered'},{admin:true,method:'PATCH'}),409);
 expectStatus(await api('/api/admin/orders',{id:order.order.id,paymentStatus:'paid'},{admin:true,method:'PATCH'}));
 assert.equal((await delivery()).preparation[0].total_quantity,3);
});
test('late payment moves an unused package past a locked route without losing any deliveries',async()=>{
 const order=await create();
 at('2027-01-01T10:00:00Z');
 assert.equal((await delivery()).orders.length,0);
 expectStatus(await api('/api/admin/orders',{id:order.order.id,paymentStatus:'paid'},{admin:true,method:'PATCH'}));
 assert.equal(scalar('SELECT next_delivery_date FROM subscriptions'),'2027-01-08');
 assert.equal(scalar('SELECT anchor_date FROM package_lines'),'2027-01-08');
 for(const date of ['2027-01-08','2027-01-15','2027-01-22','2027-01-29']) await handover(date);
 assert.equal(scalar("SELECT COUNT(*) FROM fiscal_receipts WHERE kind='final' AND status='issued'"),1);
 assert.equal(scalar("SELECT SUM(quantity) FROM delivery_items di JOIN delivery_orders dor ON dor.id=di.delivery_order_id WHERE dor.status='delivered'"),12);
});
test('payment webhook respects paused package start and disallows reversing a paid package',async()=>{
 const order=await create({},[line('prod_kravlje_1l',3,'subscription','biweekly')]);
 expectStatus(await mutate(order.subscription.id,'pause',{pauseUntil:'2027-03-01'}));
 at('2027-01-02T10:00:00Z');
 const send=(status)=>api('/api/webhooks/payments',{eventId:randomUUID(),orderId:order.order.id,status},{extra:{'x-webhook-secret':env.PAYMENT_WEBHOOK_SECRET}});
 expectStatus(await send('paid'));
 assert.equal(scalar('SELECT next_delivery_date FROM subscriptions'),'2027-03-12');
 expectStatus(await send('refunded'),409);
 await handover('2027-03-12'); await handover('2027-03-26');
 assert.equal(scalar("SELECT COUNT(*) FROM fiscal_receipts WHERE kind='final' AND status='issued'"),1);
});
test('unpaid cancelled packages cannot be reactivated by late payments',async()=>{
 const order=await create();
 expectStatus(await mutate(order.subscription.id,'cancel'));
 expectStatus(await api('/api/admin/orders',{id:order.order.id,paymentStatus:'paid'},{admin:true,method:'PATCH'}),409);
 expectStatus(await api('/api/webhooks/payments',{eventId:randomUUID(),orderId:order.order.id,status:'paid'},{extra:{'x-webhook-secret':env.PAYMENT_WEBHOOK_SECRET}}),409);
 assert.equal(scalar("SELECT COUNT(*) FROM fiscal_receipts"),0);
});
test('three calendar month pause limit, future completion, payment reversal and repeat confirmation are protected',async()=>{
 const order=await paid();
 expectStatus(await mutate(order.subscription.id,'pause',{pauseUntil:'2027-03-31'}),422);
 expectStatus(await api('/api/admin/orders',{id:order.order.id,paymentStatus:'refunded'},{admin:true,method:'PATCH'}),409);
 await delivery();
 const locked=expectStatus(await api('/api/admin/deliveries',{action:'lock',date:'2027-01-01',force:true},{admin:true}));
 expectStatus(await api('/api/admin/deliveries',{action:'complete',id:locked.orders[0].id,status:'delivered'},{admin:true}),409);
 expectStatus(await mutate(order.subscription.id,'pause',{pauseUntil:'2027-03-30'}));
});
test('new package renewal only after prior fulfillment and with new configured quantities',async()=>{
 const order=await paid();
 expectStatus(await mutate(order.subscription.id,'update_item',{itemId:scalar('SELECT id FROM subscription_items'),quantity:1,cadence:'biweekly'}));
 for(const date of ['2027-01-01','2027-01-08','2027-01-15','2027-01-22']) await handover(date);
 const first=expectStatus(await api('/api/jobs/billing',{month:'2027-02'},{admin:true}));
 assert.equal(first.results[0].deliveryOccurrences,2);
 expectStatus(await api('/api/jobs/billing',{month:'2027-02'},{admin:true}));
 assert.equal(scalar('SELECT COUNT(*) FROM subscription_packages'),2);
 assert.equal(scalar("SELECT quantity FROM order_items WHERE order_id != ?",order.order.id),1);
});
test('calendar preview never invents a fifth paid occurrence',async()=>{
 await paid();
 assert.equal((await delivery('2027-01-22')).orders.length,1);
 assert.equal((await delivery('2027-01-29')).orders.length,0);
});
test('concurrent handovers of mixed package final delivery complete exactly once',async()=>{
 await paid([line('prod_kravlje_1l',1,'subscription','biweekly'),line('prod_sir_500g',1,'one_time')]);
 // Keep the independent one-time shipment locked until the last package visit.
 at('2027-01-01T10:00:00Z');const first=await delivery('2027-01-01');
 const recurring=first.orders.find(order=>order.subscription_id),oneTime=first.orders.find(order=>!order.subscription_id);
 expectStatus(await api('/api/admin/deliveries',{action:'complete',id:recurring.id,status:'delivered'},{admin:true}));
 at('2027-01-15T10:00:00Z');const last=await delivery('2027-01-15');
 const outcomes=await Promise.all([oneTime.id,last.orders[0].id].map(id=>api('/api/admin/deliveries',{action:'complete',id,status:'delivered'},{admin:true})));
 outcomes.forEach(result=>expectStatus(result));
 assert.equal(scalar("SELECT status FROM subscription_packages"),'completed');
 assert.equal(scalar("SELECT COUNT(*) FROM outbox WHERE topic='fiscal.final.requested'"),1);
});
test('failed mixed one-time item moves to a later visit without being charged again',async()=>{
 await paid([line(),line('prod_sir_500g',1,'one_time')]);
 at('2027-01-01T10:00:00Z');const first=await delivery('2027-01-01');
 for(const order of first.orders) expectStatus(await api('/api/admin/deliveries',{action:'complete',id:order.id,status:order.subscription_id?'delivered':'failed'},{admin:true}));
 for(const date of ['2027-01-08','2027-01-15','2027-01-22']) await handover(date);
 assert.equal(scalar("SELECT SUM(di.quantity) FROM delivery_items di JOIN delivery_orders dor ON dor.id=di.delivery_order_id WHERE product_id='prod_sir_500g' AND dor.status='delivered'"),1);
 assert.equal(scalar("SELECT status FROM subscription_packages"),'completed');
});
test('admin photo upload persists a public image and rejects unauthorized or non-image input',async()=>{
 const png=Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/lX8AAAAASUVORK5CYII=','base64'));
 async function upload(bytes,authorized=true) {
  const form=new FormData();form.set('image',new File([bytes],'test.png',{type:'image/png'}));
  return worker.fetch(new Request('http://localhost/api/admin/product-images',{method:'POST',headers:{Origin:'http://localhost',...(authorized?{'x-admin-secret':env.ADMIN_SECRET}:{})},body:form}),env,{waitUntil(){},passThroughOnException(){}});
 }
 assert.equal((await upload(png,false)).status,403);
 assert.equal((await upload(new TextEncoder().encode('<svg onload="alert(1)"></svg>'))).status,422);
 const response=await upload(png);assert.equal(response.status,201);
 const {url}=await response.json();const image=await worker.fetch(new Request('http://localhost'+url),env,{waitUntil(){},passThroughOnException(){}});
 assert.equal(image.headers.get('content-type'),'image/png');assert.deepEqual(new Uint8Array(await image.arrayBuffer()),png);
 const product=expectStatus(await api('/api/admin/products',{slug:'photo-test',name:'Photo Test',unitLabel:'1 L',priceMinor:12300,imageUrl:url,fiscalTaxLabel:'Е'},{admin:true}),201);
 assert.ok(JSON.stringify(product).includes(url));
 expectStatus(await api('/api/admin/products/'+(product.product?.id??product.id),{priceMinor:12400,fiscalTaxLabel:'Ђ'},{admin:true,method:'PATCH'}));
 assert.equal(scalar("SELECT fiscal_tax_label FROM products WHERE slug='photo-test'"),'Ђ');
});
