import assert from 'node:assert/strict';
import { beforeEach, afterEach, test } from 'node:test';
import { register } from 'node:module';
import { randomUUID } from 'node:crypto';
import { createDatabase } from './sqlite-d1.mjs';
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
test('Fiscomm uses documented nested response, UTF8 tax labels, payment units and frozen journal',async()=>{
 const id=await paid();
 assert.equal(calls.length,1); assert.equal(calls[0].url,'https://api.fiscomm.rs/receipt/normal/sale');
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
test('advance-finalize references original PFR and snapshot; saves refund and final independently',async()=>{
 const response=await api('/api/checkout',{customer:{email:'chain@example.test',fullName:'Test Lanac',phone:'+381600000000',addressLine1:'Test 1',city:'Beograd',postalCode:'11000'},items:[{productId:'prod_kravlje_1l',quantity:2,purchaseType:'subscription',cadence:'biweekly'}],paymentMethod:'card',paymentToken:'test-token',deliveryDate:'2027-01-01'});
 assert.equal(response.status,201,await response.clone().text());
 const order=(await response.json()).order;
 assert.equal(calls[0].url,'https://api.fiscomm.rs/receipt/advance/sale');
 assert.equal(calls[0].payload.items[0].quantity,4);
 for(const date of ['2027-01-01','2027-01-15']) {
  globalThis.Date = class extends RealDate {constructor(...args){super(...(args.length?args:[date+'T10:00:00Z']));}static now(){return RealDate.parse(date+'T10:00:00Z');}};
  const generated=await api('/api/admin/deliveries',{action:'generate',date},{admin:true});
  const deliveries=(await generated.json()).orders;
  for(const d of deliveries) {const result=await api('/api/admin/deliveries',{action:'complete',id:d.id,status:'delivered'},{admin:true});assert.equal(result.status,200,await result.clone().text());}
 }
 assert.equal(calls.length,2);
 assert.equal(calls[1].url,'https://api.fiscomm.rs/receipt/advance/finalize');
 assert.equal(calls[1].payload.referentDocumentNumber,'TEST-PFR-1');
 assert.deepEqual(calls[1].payload.items,calls[0].payload.items);
 assert.equal(calls[1].payload.payments[0].advanceAmount,order.totalMinor/100);
 assert.equal(one("SELECT COUNT(*) AS n FROM fiscal_receipts WHERE status='issued'").n,3);
 const final=one("SELECT * FROM fiscal_receipts WHERE kind='final'");
 assert.equal(final.reference_receipt_id,`receipt:${order.id}:advance_refund`);
 assert.equal(one("SELECT COUNT(*) AS n FROM outbox WHERE topic='email.fiscal_document.requested'").n,3);
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
