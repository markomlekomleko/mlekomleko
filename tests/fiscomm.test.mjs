import assert from 'node:assert/strict';
import { beforeEach, afterEach, test } from 'node:test';
import { register } from 'node:module';
import { randomUUID } from 'node:crypto';
import { createDatabase } from './sqlite-d1.mjs';
import { renderTransactionalMessage } from '../server/notifications.ts';
const RealDate = Date, realFetch = globalThis.fetch;
let database, network, calls;
globalThis.fetch = (...args) => network(...args);
const env = {};
globalThis.__mlekoTestCloudflareEnv = env;
register(new URL('./cloudflare-loader.mjs', import.meta.url));
const worker = (await import('../dist/server/index.js')).default;
beforeEach(() => {
  Object.keys(env).forEach(k => delete env[k]);
  Object.assign(env, { APP_ENV: 'local', APP_ORIGIN: 'http://localhost', PAYMENT_MODE: 'mock', FISCAL_PROVIDER: 'fiscomm', FISCOMM_MODE: 'live', FISCOMM_API_KEY: 'test-only-never-real', FISCOMM_DELIVERY_TAX_LABEL: 'Е', BADI_MODE: 'disabled', BADI_LOCAL_BASE_URL: 'http://127.0.0.1:9999', BADI_DELIVERY_SKU: '90', EMAIL_MODE: 'console', ADMIN_LEGACY_ACCESS: 'true', ADMIN_SECRET: 'test-admin', PAYMENT_WEBHOOK_SECRET: 'test-webhook' });
  globalThis.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : ['2026-12-30T08:00:00Z'])); } static now() { return RealDate.parse('2026-12-30T08:00:00Z'); } };
  database = createDatabase(); env.DB = database; calls = [];
  database.raw.exec("UPDATE products SET is_active=1, badi_sku=10, fiscal_tax_label='Е'");
  network = globalThis.fetch = async (url, init) => {
    assert.ok(url.startsWith('https://api.fiscomm.rs/'));
    if(url.endsWith('/receipt/tax-rates')) return Response.json({currentTaxRates:{taxCategories:[{taxRates:[{label:'Е',rate:10}]}]}});
    const payload=JSON.parse(init.body); calls.push({url,payload});
    const receipt={invoiceNumber:'TEST-PFR-'+calls.length,sdcDateTime:new Date().toISOString(),totalAmount:payload.items.reduce((sum,item)=>sum+item.totalAmount,0),invoicePdfUrl:'https://fiscal.example.test/receipt.pdf'};
    return Response.json(url.endsWith('/finalize') ? {refundReceipt:{...receipt,invoiceNumber:'TEST-REFUND'},finalReceipt:receipt} : {receipt});
  };
});
afterEach(() => { database.close(); globalThis.Date = RealDate; globalThis.fetch = realFetch; });
async function api(path, data, { method='POST', admin=false, headers={} }={}) {
  return worker.fetch(new Request('http://localhost'+path, { method, headers: { 'content-type':'application/json', Origin:'http://localhost', 'Idempotency-Key':randomUUID(), ...(admin ? {'x-admin-secret':'test-admin'} : {}), ...headers }, ...(method==='GET' ? {} : {body:JSON.stringify(data)}) }), env, {waitUntil(){},passThroughOnException(){}});
}
async function paid() {
  const response = await api('/api/checkout', { customer:{ email:'fiscal@example.test',fullName:'Fiskalni Test',phone:'+381600000000',addressLine1:'Test 1',city:'Beograd',postalCode:'11000' }, items:[{ productId:'prod_kravlje_1l',quantity:2,purchaseType:'one_time' }],paymentMethod:'cash',deliveryDate:'2027-01-01' });
  assert.equal(response.status,201,await response.clone().text());
  const id=(await response.json()).order.id;
  const update=await api('/api/admin/orders',{id,paymentStatus:'paid'},{method:'PATCH',admin:true});
  assert.equal(update.status,200,await update.clone().text()); return id;
}
const one=sql=>database.raw.prepare(sql).get();
test('cash collected during a complete one-off handover issues one ordinary receipt',async()=>{
 const created=await api('/api/checkout',{customer:{email:'cod@example.test',fullName:'Test Gotovina',phone:'+381600000000',addressLine1:'Test 1',city:'Beograd',postalCode:'11000'},items:[{productId:'prod_kravlje_1l',quantity:2,purchaseType:'one_time'}],paymentMethod:'cash',deliveryDate:'2027-01-01'});
 assert.equal(created.status,201,await created.clone().text());
 globalThis.Date=class extends RealDate {constructor(...args){super(...(args.length?args:['2027-01-01T10:00:00Z']));}static now(){return RealDate.parse('2027-01-01T10:00:00Z');}};
 const route=await api('/api/admin/deliveries',{action:'generate',date:'2027-01-01'},{admin:true});const id=(await route.json()).orders[0].id;
 const result=await api('/api/admin/deliveries',{action:'complete',id,status:'delivered',cashCollected:true},{admin:true});assert.equal(result.status,200,await result.clone().text());
 assert.equal(calls.length,1);assert.ok(calls[0].url.endsWith('/receipt/normal/sale'));assert.equal(one('SELECT kind FROM fiscal_receipts').kind,'normal');
});
test('Fiscomm uses documented nested response, UTF8 tax labels, payment units and frozen journal',async()=>{
 const id=await paid();
 assert.equal(calls.length,1); assert.equal(calls[0].url,'https://api.fiscomm.rs/receipt/advance/sale');
 assert.equal(calls[0].payload.settings.returnIfOrderNumberExists,true);
 assert.equal(calls[0].payload.payments[0].type,'cash');
 assert.ok(calls[0].payload.items.every(item=>item.labels[0]==='Е'));
 assert.equal(one('SELECT status FROM fiscal_receipts').status,'issued');
 database.raw.exec("UPDATE fiscal_receipts SET status='failed'; UPDATE outbox SET status='pending',available_at='2020-01-01' WHERE topic='fiscal.receipt.requested'");
 await api('/api/admin/integrations',{action:'process'},{admin:true});
 assert.equal(calls.length,1);
 assert.equal(one('SELECT COUNT(*) AS n FROM outbox WHERE topic=\'email.fiscal_document.requested\'').n,1);
 assert.ok(id);
});
test('missing or foreign tax label blocks issuance before POST, and retry can recover after mapping',async()=>{
 database.raw.exec('UPDATE products SET fiscal_tax_label=NULL');
 await paid();
 assert.equal(calls.length,0);
 assert.equal(one('SELECT last_error_code FROM fiscal_receipts').last_error_code,'FISCAL_TAX_LABEL_MISSING');
 database.raw.exec("UPDATE products SET fiscal_tax_label='Е'; UPDATE outbox SET available_at='2020-01-01' WHERE topic='fiscal.receipt.requested'");
 await api('/api/admin/integrations',{action:'process'},{admin:true});
 assert.equal(calls.length,1);
});
test('timeout is journaled and cannot be retried by the generic retry button',async()=>{
 const original=globalThis.fetch;
 network=globalThis.fetch=async(url,init)=>{if(url.endsWith('/tax-rates')) return original(url,init); calls.push({url});throw new Error('timeout');};
 await paid();
 assert.equal(one('SELECT status FROM fiscal_dispatches').status,'unknown');
 await api('/api/admin/integrations',{action:'retry_failed'},{admin:true});
 assert.equal(calls.length,1);
});
for (const mode of ['live', 'training']) test(`package receipt lifecycle stays in ${mode} mode`,async()=>{
 env.FISCOMM_MODE = mode;
 const response=await api('/api/checkout',{customer:{email:'chain@example.test',fullName:'Test Lanac',phone:'+381600000000',addressLine1:'Test 1',city:'Beograd',postalCode:'11000'},items:[{productId:'prod_kravlje_1l',quantity:2,purchaseType:'subscription',cadence:'biweekly'}],paymentMethod:'card',paymentToken:'test-token',deliveryDate:'2027-01-01'});
 assert.equal(response.status,201,await response.clone().text());
 const order=(await response.json()).order;
 assert.equal(calls[0].url,`https://api.fiscomm.rs/receipt/${mode === 'training' ? 'training' : 'advance'}/sale`);
 assert.equal(calls[0].payload.items[0].quantity,4);
 for(const date of ['2027-01-01','2027-01-15']) {
  globalThis.Date = class extends RealDate {constructor(...args){super(...(args.length?args:[date+'T10:00:00Z']));}static now(){return RealDate.parse(date+'T10:00:00Z');}};
  const generated=await api('/api/admin/deliveries',{action:'generate',date},{admin:true});
  const deliveries=(await generated.json()).orders;
  for(const d of deliveries) {const result=await api('/api/admin/deliveries',{action:'complete',id:d.id,status:'delivered'},{admin:true});assert.equal(result.status,200,await result.clone().text());}
 }
 assert.equal(calls.length,3);
 assert.equal(calls[1].payload.items[0].quantity,2);
 assert.equal(calls[2].payload.items[0].quantity,2);
 assert.equal(calls[1].payload.payments[0].amount + calls[2].payload.payments[0].amount, order.totalMinor/100);
 if (mode === 'training') {
  assert.ok(calls.every(call => call.url === 'https://api.fiscomm.rs/receipt/training/sale'));
  assert.notEqual(calls[0].payload.orderNumber, calls[1].payload.orderNumber);
  assert.equal(calls[0].payload.items[0].quantity, 2*calls[1].payload.items[0].quantity);
  assert.equal(calls[1].payload.referentDocumentNumber, undefined);
  assert.equal(calls[1].payload.payments[0].advanceAmount, undefined);
  assert.equal(calls[1].payload.settings.isFinal, undefined);
  assert.equal(one("SELECT COUNT(*) AS n FROM fiscal_receipts WHERE status='issued' AND provider='fiscomm-training'").n, 3);
  assert.equal(one("SELECT COUNT(*) AS n FROM fiscal_receipts WHERE kind='refund'").n, 0);
  assert.equal(one("SELECT reference_receipt_id FROM fiscal_receipts WHERE kind='final'").reference_receipt_id, `receipt:${order.id}:advance`);
  return;
 }
 assert.equal(calls[1].url,'https://api.fiscomm.rs/receipt/advance/finalize');
 assert.equal(calls[1].payload.referentDocumentNumber,'TEST-PFR-1');
 assert.equal(calls[1].payload.settings.skipAdvanceChainDerivation,true);
 assert.equal(calls[1].payload.payments[0].advanceAmount,calls[1].payload.payments[0].amount);
 assert.equal(one("SELECT COUNT(*) AS n FROM fiscal_receipts WHERE status='issued'").n,5);
 const final=one("SELECT * FROM fiscal_receipts WHERE kind='final'");
 assert.equal(final.reference_receipt_id,`${final.operation_key}:advance_refund`);
 assert.equal(one("SELECT COUNT(*) AS n FROM outbox WHERE topic='email.fiscal_document.requested'").n,5);
});
test('unexpected top-level response or amount mismatch is unknown, never issued',async()=>{
 const original=globalThis.fetch;
 network=globalThis.fetch=async(url,init)=>url.endsWith('/tax-rates') ? original(url,init) : Response.json({invoiceNumber:'wrong-shape',receipt:{invoiceNumber:'wrong-amount',sdcDateTime:new Date().toISOString(),totalAmount:0}});
 await paid();
 assert.equal(one('SELECT status FROM fiscal_dispatches').status,'unknown');
 assert.equal(one('SELECT status FROM fiscal_receipts').status,'failed');
});
test('Q193: non-HTTPS document links are discarded before persistence and email',async()=>{
 const original=globalThis.fetch;
 network=globalThis.fetch=async(url,init)=>{const response=await original(url,init);if(url.endsWith('/tax-rates'))return response;const body=await response.json();body.receipt.invoicePdfUrl='javascript:alert(1)';body.receipt.verificationUrl='http://unsafe.example.test';return Response.json(body);};
 await paid();
 assert.equal(one('SELECT pdf_url FROM fiscal_receipts').pdf_url,null);
 assert.equal(one('SELECT verification_url FROM fiscal_receipts').verification_url,null);
 const payload=JSON.parse(one("SELECT payload_json FROM outbox WHERE topic='email.fiscal_document.requested'").payload_json);
 assert.equal(payload.documentUrl,null);
});
test('Q102: company PIB is transmitted in the documented buyer identification field',async()=>{const response=await api('/api/checkout',{customer:{email:'b2b@example.test',fullName:'Firma Test',phone:'+381600000000',addressLine1:'Dostava 1',city:'Beograd',postalCode:'11000'},billing:{companyName:'Primer DOO',taxId:'123456789',addressLine1:'Račun 2',city:'Novi Sad',postalCode:'21000'},items:[{productId:'prod_kravlje_1l',quantity:1,purchaseType:'one_time'}],paymentMethod:'cash',deliveryDate:'2027-01-01'});assert.equal(response.status,201);const id=(await response.json()).order.id;assert.equal((await api('/api/admin/orders',{id,paymentStatus:'paid'},{method:'PATCH',admin:true})).status,200);assert.equal(calls[0].payload.buyerId,'10:123456789');});

for (const mode of [undefined, '', 'training']) test(`training is safe without live opt-in (mode=${String(mode)})`, async()=>{
 if (mode === undefined) delete env.FISCOMM_MODE; else env.FISCOMM_MODE = mode;
 await paid();
 assert.equal(calls.length, 1);
 assert.equal(calls[0].url, 'https://api.fiscomm.rs/receipt/training/sale');
 assert.equal(one('SELECT provider FROM fiscal_receipts').provider, 'fiscomm-training');
 const payload = JSON.parse(one("SELECT payload_json FROM outbox WHERE topic='email.fiscal_document.requested'").payload_json);
 assert.equal(payload.training, true);
 database.raw.exec("UPDATE fiscal_receipts SET status='failed'; UPDATE outbox SET status='pending',available_at='2020-01-01' WHERE topic='fiscal.receipt.requested'");
 await api('/api/admin/integrations',{action:'process'},{admin:true});
 assert.equal(calls.length, 1);
 assert.equal(one('SELECT status FROM fiscal_receipts').status, 'issued');
 assert.equal(one('SELECT provider FROM fiscal_receipts').provider, 'fiscomm-training');
});
for (const mode of ['disabled', 'invalid', 'LIVE']) test(`${mode} never sends a receipt`, async()=>{
 env.FISCOMM_MODE = mode;
 await paid();
 assert.equal(calls.length, 0);
 assert.equal(one('SELECT last_error_code FROM fiscal_receipts').last_error_code, 'FISCAL_NOT_CONFIGURED');
});
for (const from of ['live', 'training']) test(`switching from ${from} cannot reuse a document in the other mode`, async()=>{
 env.FISCOMM_MODE = from;
 await paid();
 env.FISCOMM_MODE = from === 'training' ? 'live' : 'training';
 database.raw.exec("UPDATE fiscal_receipts SET status='failed'; UPDATE outbox SET status='pending',available_at='2020-01-01' WHERE topic='fiscal.receipt.requested'");
 await api('/api/admin/integrations',{action:'process'},{admin:true});
 assert.equal(calls.length, 1);
 assert.equal(one('SELECT last_error_code FROM fiscal_receipts').last_error_code, 'FISCAL_MODE_MISMATCH');
});

test('training document resend keeps its test label in the email', async()=>{
 env.FISCOMM_MODE = 'training';
 await paid();
 const receipt = one('SELECT id FROM fiscal_receipts');
 const response = await api('/api/admin/integrations', {action:'resend_receipt', receiptId:receipt.id}, {admin:true});
 assert.equal(response.status, 200);
 const payload = JSON.parse(one("SELECT payload_json FROM outbox WHERE idempotency_key LIKE 'resend:%'").payload_json);
 assert.equal(payload.training, true);
 const message = renderTransactionalMessage('email.fiscal_document.requested', payload);
 assert.match(message.subject, /Test dokument/);
 assert.match(message.text, /OVO NIJE FISKALNI RAČUN/);
 assert.match(message.html, /OVO NIJE FISKALNI RAČUN/);
});

function at(date) {
 globalThis.Date = class extends RealDate {constructor(...args){super(...(args.length?args:[date+'T10:00:00Z']));}static now(){return RealDate.parse(date+'T10:00:00Z');}};
}
async function deliver(date, deliveredQuantity) {
 at(date);
 const response=await api('/api/admin/deliveries',{action:'generate',date},{admin:true});
 assert.equal(response.status,200,await response.clone().text());
 const {orders}=await response.json();
 for(const order of orders) {
  const result=await api('/api/admin/deliveries',{action:'complete',id:order.id,status:'delivered',...(deliveredQuantity===undefined?{}:{items:order.items.map(item=>({id:item.id,deliveredQuantity}))})},{admin:true});
  assert.equal(result.status,200,await result.clone().text());
 }
 return orders;
}
async function buyMilk(productId,quantity,cadence) {
 const response=await api('/api/checkout',{customer:{email:'milk@example.test',fullName:'Milk Test',phone:'+381600000000',addressLine1:'Test 1',city:'Beograd',postalCode:'11000'},items:[{productId,quantity,purchaseType:cadence?'subscription':'one_time',...(cadence?{cadence}:{})}],paymentMethod:'card',paymentToken:'test-token',deliveryDate:'2027-01-01'});
 assert.equal(response.status,201,await response.clone().text());return response.json();
}
for(const mode of ['live','training']) test(`2l one-time and 8l biweekly: each actual delivery has the right amount (${mode})`,async()=>{
 env.FISCOMM_MODE=mode;
 const single=await buyMilk('prod_kozje_1l',2);
 const recurring=await buyMilk('prod_kozje_1l',8,'biweekly');
 assert.deepEqual(calls.map(call=>call.payload.items[0].quantity),[2,16]);
 await deliver('2027-01-01');
 assert.deepEqual(calls.slice(2).map(call=>call.payload.items[0].quantity).sort((a,b)=>a-b),[2,8]);
 await deliver('2027-01-15');
 assert.equal(calls.at(-1).payload.items[0].quantity,8);
 for(const order of [single.order,recurring.order]) {
  const docs=calls.filter(call=>call.payload.metaFields.order_id===order.id && call.payload.metaFields.delivery_order_id);
  assert.equal(docs.reduce((sum,call)=>sum+Math.round(call.payload.payments[0].amount*100),0),order.totalMinor);
 }
 assert.equal(calls.length,5);
});
for(const mode of ['live','training']) test(`10l weekly, week three skipped: four delivery receipts, no extra charge (${mode})`,async()=>{
 env.FISCOMM_MODE=mode;
 const purchase=await buyMilk('prod_kravlje_1l',10,'weekly');
 await deliver('2027-01-01');await deliver('2027-01-08');
 at('2027-01-10');
 const response=await api('/api/admin/subscriptions/'+purchase.subscription.id,{action:'skip_next',expectedVersion:one('SELECT version FROM subscriptions').version},{method:'PATCH',admin:true});
 assert.equal(response.status,200,await response.clone().text());
 assert.equal((await deliver('2027-01-15')).length,0);
 assert.equal(calls.length,3);
 await deliver('2027-01-22');const last=await deliver('2027-01-29');
 assert.equal(calls.length,5);
 assert.deepEqual(calls.map(call=>call.payload.items[0].quantity),[40,10,10,10,10]);
 assert.equal(one('SELECT COUNT(*) n FROM orders').n,1);
 const repeat=await api('/api/admin/deliveries',{action:'complete',id:last[0].id,status:'delivered'},{admin:true});
 assert.equal(repeat.status,200);assert.equal(calls.length,5);
 assert.equal(calls.slice(1).reduce((sum,call)=>sum+Math.round(call.payload.payments[0].amount*100),0),purchase.order.totalMinor);
});
test('partial delivery uses frozen discounts and taxes; failed response cannot create a second finalization',async()=>{
 const purchase=await buyMilk('prod_kravlje_1l',10,'weekly');
 await deliver('2027-01-01',3);
 database.raw.exec("UPDATE products SET price_minor=99999,fiscal_tax_label='Ђ'; UPDATE order_items SET unit_price_minor=99999,line_total_minor=99999");
 await deliver('2027-01-08');await deliver('2027-01-15');await deliver('2027-01-22');await deliver('2027-01-29');
 assert.deepEqual(calls.map(call=>call.payload.items[0].quantity),[40,3,10,10,10,7]);
 assert.equal(calls.slice(1).reduce((sum,call)=>sum+Math.round(call.payload.payments[0].amount*100),0),purchase.order.totalMinor);
 assert.ok(calls.every(call=>call.payload.items.every(item=>item.labels[0]==='Е')));
 const before=calls.length;
 database.raw.exec("UPDATE fiscal_receipts SET status='failed' WHERE kind='final'; UPDATE outbox SET status='pending',available_at='2020-01-01' WHERE topic='fiscal.delivery.requested'");
 await api('/api/admin/integrations',{action:'process'},{admin:true});
 assert.equal(calls.length,before);
 assert.equal(one("SELECT COUNT(*) n FROM fiscal_receipts WHERE kind='final' AND status='issued'").n,5);
});
test('full one-time cash handover followed by payment emits one normal receipt, without an advance',async()=>{
 const response=await api('/api/checkout',{customer:{email:'cod@example.test',fullName:'Cash Test',phone:'+381600000000',addressLine1:'Test 1',city:'Beograd',postalCode:'11000'},items:[{productId:'prod_kozje_1l',quantity:2,purchaseType:'one_time'}],paymentMethod:'cash',deliveryDate:'2027-01-01'});
 assert.equal(response.status,201);const {order}=await response.json();
 await deliver('2027-01-01');assert.equal(calls.length,0);
 const payment=await api('/api/admin/orders',{id:order.id,paymentStatus:'paid'},{method:'PATCH',admin:true});
 assert.equal(payment.status,200,await payment.clone().text());
 assert.equal(calls.length,1);assert.equal(calls[0].url,'https://api.fiscomm.rs/receipt/normal/sale');
 database.raw.exec("UPDATE outbox SET available_at='2020-01-01' WHERE topic='fiscal.delivery.requested'");
 await api('/api/admin/integrations',{action:'process'},{admin:true});
 assert.equal(calls.length,1);
});
test('partial finalize with a wrong refund amount is unknown and blocks automatic retry',async()=>{
 await buyMilk('prod_kozje_1l',8,'biweekly');
 const original=globalThis.fetch;
 network=globalThis.fetch=async(url,init)=>{
  const response=await original(url,init);if(!url.endsWith('/finalize'))return response;
  const body=await response.json();body.refundReceipt.totalAmount*=2;return Response.json(body);
 };
 await deliver('2027-01-01');
 assert.equal(one("SELECT status FROM fiscal_dispatches WHERE operation_key LIKE '%:delivery:%'").status,'unknown');
 const before=calls.length;
 database.raw.exec("UPDATE outbox SET status='pending',available_at='2020-01-01' WHERE topic='fiscal.delivery.requested'");
 await api('/api/admin/integrations',{action:'process'},{admin:true});
 assert.equal(calls.length,before);
});

test('all three rhythms in one basket retain separate quantities and exactly the prepaid total',async()=>{
 const response=await api('/api/checkout',{customer:{email:'mixedmilk@example.test',fullName:'Mixed Milk Test',phone:'+381600000000',addressLine1:'Test 1',city:'Beograd',postalCode:'11000'},items:[
  {productId:'prod_kozje_1l',quantity:2,purchaseType:'one_time'},
  {productId:'prod_kozje_1l',quantity:8,purchaseType:'subscription',cadence:'biweekly'},
  {productId:'prod_kravlje_1l',quantity:10,purchaseType:'subscription',cadence:'weekly'},
 ],paymentMethod:'card',paymentToken:'test-token',deliveryDate:'2027-01-01'});
 assert.equal(response.status,201,await response.clone().text());const {order}=await response.json();
 for(const date of ['2027-01-01','2027-01-08','2027-01-15','2027-01-22'])await deliver(date);
 const finals=calls.slice(1);
 assert.equal(finals.reduce((sum,call)=>sum+Math.round(call.payload.payments[0].amount*100),0),order.totalMinor);
 assert.equal(finals.flatMap(call=>call.payload.items).filter(item=>item.name!=='Dostava').reduce((sum,item)=>sum+item.quantity,0),58);
 assert.equal(one("SELECT SUM(quantity) n FROM fiscal_delivery_allocations").n,58);
 assert.equal(one('SELECT status FROM subscription_packages').status,'completed');
});
test('an ambiguous finalization stops later receipts of that order until reconciliation',async()=>{
 await buyMilk('prod_kravlje_1l',10,'weekly');
 const original=globalThis.fetch;
 network=globalThis.fetch=async(url,init)=>{if(url.endsWith('/finalize')){calls.push({url,payload:JSON.parse(init.body)});throw new Error('lost finalization response');}return original(url,init);};
 await deliver('2027-01-01');
 network=globalThis.fetch=original;
 await deliver('2027-01-08');
 assert.equal(calls.length,2);
 assert.equal(one("SELECT COUNT(*) n FROM outbox WHERE topic='fiscal.delivery.requested' AND status='failed'").n,2);
});
test('mock documents cannot be reused as real advances',async()=>{
 env.FISCOMM_MODE='mock';await buyMilk('prod_kravlje_1l',10,'weekly');
 assert.equal(calls.length,0);
 env.FISCOMM_MODE='live';await deliver('2027-01-01');
 assert.equal(calls.length,0);
 assert.equal(one("SELECT last_error_code FROM fiscal_receipts WHERE kind='final'").last_error_code,'FISCAL_MODE_MISMATCH');
});
test('old whole-package documents are not duplicated or silently migrated',async()=>{
 await buyMilk('prod_kozje_1l',8,'biweekly');
 database.raw.exec('DELETE FROM fiscal_order_snapshots');
 await deliver('2027-01-01');
 assert.equal(calls.length,1);
 assert.equal(one("SELECT last_error_code FROM fiscal_receipts WHERE kind='final'").last_error_code,'FISCAL_LEGACY_REVIEW_REQUIRED');
});
test('order dropdown cannot bypass delivered quantities or refund a paid Fiscomm order',async()=>{
 const {order}=await buyMilk('prod_kozje_1l',2);
 for(const change of [{fulfillmentStatus:'delivered'},{paymentStatus:'refunded'}]) {
  const result=await api('/api/admin/orders',{id:order.id,...change},{admin:true,method:'PATCH'});
  assert.equal(result.status,409);
 }
 assert.equal(calls.length,1);
});
test('concurrent deliveries defer an active fiscal request and later finish without duplicate issuance',async()=>{
 const response=await api('/api/checkout',{customer:{email:'race@example.test',fullName:'Race Test',phone:'+381600000000',addressLine1:'Test 1',city:'Beograd',postalCode:'11000'},items:[{productId:'prod_kozje_1l',quantity:2,purchaseType:'one_time'},{productId:'prod_kravlje_1l',quantity:10,purchaseType:'subscription',cadence:'weekly'}],paymentMethod:'card',paymentToken:'test-token',deliveryDate:'2027-01-01'});
 assert.equal(response.status,201);
 at('2027-01-01');const route=await api('/api/admin/deliveries',{action:'generate',date:'2027-01-01'},{admin:true});
 const {orders}=await route.json();assert.equal(orders.length,2);
 const original=globalThis.fetch;
 network=globalThis.fetch=async(url,init)=>{if(url.endsWith('/finalize'))await new Promise(resolve=>setTimeout(resolve,30));return original(url,init);};
 const results=await Promise.all(orders.map(order=>api('/api/admin/deliveries',{action:'complete',id:order.id,status:'delivered'},{admin:true})));
 for(const result of results)assert.equal(result.status,200);
 assert.equal(one("SELECT COUNT(*) n FROM outbox WHERE topic='fiscal.delivery.requested' AND status='failed'").n,0);
 database.raw.exec("UPDATE outbox SET available_at='2020-01-01' WHERE topic='fiscal.delivery.requested' AND status='pending'");
 await api('/api/admin/integrations',{action:'process'},{admin:true});
 assert.equal(one("SELECT COUNT(*) n FROM fiscal_receipts WHERE kind='final' AND status='issued'").n,2);
 assert.equal(calls.length,3);
});
