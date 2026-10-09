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
  Object.assign(env, { APP_ENV: 'local', APP_ORIGIN: 'http://localhost', PAYMENT_MODE: 'mock', BADI_MODE: 'local', BADI_LOCAL_BASE_URL: 'http://127.0.0.1:9999', BADI_DELIVERY_SKU: '90', EMAIL_MODE: 'console', ADMIN_LEGACY_ACCESS: 'true', ADMIN_SECRET: 'test-admin', PAYMENT_WEBHOOK_SECRET: 'test-webhook' });
  globalThis.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : ['2026-12-30T08:00:00Z'])); } static now() { return RealDate.parse('2026-12-30T08:00:00Z'); } };
  database = createDatabase(); env.DB = database; calls = [];
  database.raw.exec('UPDATE products SET is_active=1, badi_sku=10');
  network = globalThis.fetch = async (url, init) => {
    assert.equal(url, 'http://127.0.0.1:9999/fiscalization/receipts');
    calls.push(JSON.parse(init.body));
    return Response.json({ invoiceNumber: 'TEST-PFR-1', pdf: 'https://fiscal.example.test/1.pdf' });
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
test('real fiscal handler journals request, validates result and repairs projection without second issue',async()=>{
  const id=await paid();
  assert.equal(calls.length,1);
  assert.equal(one('SELECT status FROM fiscal_dispatches').status,'issued');
  assert.equal(one('SELECT invoice_number FROM fiscal_receipts').invoice_number,'TEST-PFR-1');
  const original=one('SELECT request_json FROM fiscal_dispatches').request_json;
  database.raw.exec("UPDATE fiscal_receipts SET status='failed', invoice_number=NULL; UPDATE outbox SET status='pending',available_at='2020-01-01' WHERE topic='fiscal.receipt.requested'");
  await api('/api/admin/integrations',{action:'process'},{admin:true});
  assert.equal(calls.length,1);
  assert.equal(one('SELECT invoice_number FROM fiscal_receipts').invoice_number,'TEST-PFR-1');
  assert.equal(one('SELECT request_json FROM fiscal_dispatches').request_json,original);
  assert.ok(id);
});
test('ambiguous fiscal result cannot reissue through retry button or forced event requeue',async()=>{
  network=globalThis.fetch=async(_url,init)=>{calls.push(JSON.parse(init.body));throw new Error('connection reset');};
  await paid();
  assert.equal(one('SELECT status FROM fiscal_dispatches').status,'unknown');
  assert.equal(one('SELECT status FROM fiscal_receipts').status,'failed');
  await api('/api/admin/integrations',{action:'retry_failed'},{admin:true});
  assert.equal(one("SELECT status FROM outbox WHERE topic='fiscal.receipt.requested'").status,'failed');
  database.raw.exec("UPDATE outbox SET status='pending',available_at='2020-01-01' WHERE topic='fiscal.receipt.requested'");
  await api('/api/admin/integrations',{action:'process'},{admin:true});
  assert.equal(calls.length,1);
  assert.equal(one('SELECT last_error_code FROM fiscal_receipts').last_error_code,'FISCAL_RECONCILIATION_REQUIRED');
});
test('simulator payment webhook refuses production even with correct shared secret',async()=>{
  env.APP_ENV='production';
  const response=await api('/api/webhooks/payments',{eventId:'test',orderId:'test',status:'paid'},{headers:{'x-webhook-secret':'test-webhook'}});
  assert.equal(response.status,503);
  assert.equal((await response.json()).error.code,'PAYMENT_ADAPTER_NOT_CONNECTED');
  assert.equal(calls.length,0);
});
