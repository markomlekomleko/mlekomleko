import assert from 'node:assert/strict';
import { beforeEach, afterEach, test } from 'node:test';
import { register } from 'node:module';
import { randomUUID } from 'node:crypto';
import { createDatabase } from './sqlite-d1.mjs';
const RealDate = Date, realFetch = globalThis.fetch;
const env = {};
let database, calls, metaFail;
globalThis.__mlekoTestCloudflareEnv = env;
register(new URL('./cloudflare-loader.mjs', import.meta.url));
const worker = (await import('../dist/server/index.js')).default;
beforeEach(() => {
  Object.keys(env).forEach(key => delete env[key]);
  Object.assign(env, { APP_ENV:'local', APP_ORIGIN:'http://localhost', PAYMENT_MODE:'mock', BADI_MODE:'mock', EMAIL_MODE:'console', ADMIN_LEGACY_ACCESS:'true', ADMIN_SECRET:'test-admin', GA4_MEASUREMENT_ID:'G-TEST', GA4_API_SECRET:'stub-secret', NEXT_PUBLIC_META_PIXEL_ID:'12345', META_CONVERSIONS_ACCESS_TOKEN:'stub-meta', META_GRAPH_API_VERSION:'v24.0' });
  globalThis.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : ['2026-12-30T08:00:00Z'])); } static now() { return RealDate.parse('2026-12-30T08:00:00Z'); } };
  database = createDatabase(); env.DB=database; calls=[]; metaFail=false;
  database.raw.exec("UPDATE products SET is_active=1,allow_subscription=1,price_minor=25000,subscription_price_minor=25000 WHERE id='prod_kravlje_1l'");
  globalThis.fetch = async (url, init) => {
    assert.match(String(url), /^https:\/\/(www\.google-analytics\.com\/mp\/collect|graph\.facebook\.com\/v24.0\/12345\/events)/);
    calls.push({ url:String(url), body:JSON.parse(init.body) });
    return String(url).includes('facebook') ? Response.json(metaFail ? {error:'stub'} : {events_received:1}, {status:metaFail ? 503 : 200}) : new Response(null,{status:204});
  };
});
afterEach(()=>{database.close();globalThis.Date=RealDate;globalThis.fetch=realFetch;});
async function api(path,data,{method='POST',admin=false}={}) {
  const response=await worker.fetch(new Request('http://localhost'+path,{method,headers:{'content-type':'application/json',Origin:'http://localhost','Idempotency-Key':randomUUID(),...(admin?{'x-admin-secret':'test-admin'}:{})},...(method==='GET'?{}:{body:JSON.stringify(data)})}),env,{waitUntil(){},passThroughOnException(){}});
  assert.ok(response.ok,await response.clone().text()); return response.json();
}
async function checkout(consent=true, marketing=true, subscription=false) {
  return api('/api/checkout',{customer:{email:'analytics@example.test',fullName:'Test kupac',phone:'+381600000000',addressLine1:'Test 1',city:'Beograd',postalCode:'11000'},paymentMethod:'cash',deliveryDate:'2027-01-01',items:[{productId:'prod_kravlje_1l',quantity:2,purchaseType:subscription?'subscription':'one_time',...(subscription?{cadence:'weekly'}:{})}],analyticsConsent:consent,marketingConsent:marketing,attribution:{identity:{anonymousId:'browser-123',sessionId:'session-123',gaClientId:'client-123',gaSessionId:'1798617600'},firstTouch:{parameters:{utm_source:'google',utm_medium:'cpc',utm_campaign:'test'}},lastTouch:{parameters:{utm_source:'google',utm_medium:'cpc',utm_campaign:'test'}}}});
}
const purchaseRows=()=>database.raw.prepare("SELECT * FROM analytics_events WHERE event_name='purchase'").all();
test('pending cash is not purchase; denied consent suppresses local and vendor purchase after payment',async()=>{
  const created=await checkout(false,false);
  assert.equal(calls.length,0);assert.equal(purchaseRows().length,0);
  await api('/api/admin/orders',{id:created.order.id,paymentStatus:'paid'},{method:'PATCH',admin:true});
  assert.equal(calls.length,0);assert.equal(purchaseRows().length,0);
});
test('paid four-delivery package preserves browser identity, all billed units, RSD and analytics-only consent',async()=>{
  const created=await checkout(true,false,true);
  assert.equal(calls.length,0);assert.equal(purchaseRows().length,0);
  await api('/api/admin/orders',{id:created.order.id,paymentStatus:'paid'},{method:'PATCH',admin:true});
  assert.equal(calls.length,1);
  const row=purchaseRows()[0];assert.equal(row.anonymous_id,'browser-123');assert.equal(row.session_id,'session-123');
  const payload=calls[0].body;assert.equal(payload.client_id,'client-123');assert.equal(payload.consent.ad_user_data,'DENIED');
  const params=payload.events[0].params;assert.equal(params.currency,'RSD');assert.equal(params.value,created.order.totalMinor/100);assert.equal(params.session_id,1798617600);assert.equal(params.items[0].item_id,'prod_kravlje_1l');assert.equal(params.items[0].quantity,8);assert.equal(params.items[0].price,250);
  assert.doesNotMatch(JSON.stringify(payload),/analytics@example|Test kupac|381600/);
  await api('/api/admin/orders',{id:created.order.id,paymentStatus:'paid'},{method:'PATCH',admin:true});
  assert.equal(purchaseRows().length,1);assert.equal(calls.length,1);
});
test('GA success then Meta failure retries with identical transaction/event IDs and one local revenue row',async()=>{
  const created=await checkout();metaFail=true;
  await api('/api/admin/orders',{id:created.order.id,paymentStatus:'paid'},{method:'PATCH',admin:true});
  assert.equal(calls.length,2);assert.equal(purchaseRows().length,1);
  const ga=calls[0].body.events[0].params,meta=calls[1].body.data[0];
  assert.equal(ga.event_id,meta.event_id);assert.equal(meta.custom_data.currency,'RSD');
  metaFail=false;
  database.raw.exec("UPDATE outbox SET available_at='2020-01-01',status='pending' WHERE topic='analytics.purchase'");
  await api('/api/admin/integrations',{action:'process'},{admin:true});
  assert.equal(calls.length,4);assert.equal(purchaseRows().length,1);
  assert.equal(calls[2].body.events[0].params.transaction_id,ga.transaction_id);
  assert.equal(calls[3].body.data[0].event_id,meta.event_id);
});
