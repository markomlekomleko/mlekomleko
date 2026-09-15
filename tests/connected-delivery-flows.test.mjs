import assert from 'node:assert/strict';
import { beforeEach, afterEach, test } from 'node:test';
import { register } from 'node:module';
import { createHash, randomUUID } from 'node:crypto';
import { createDatabase } from './sqlite-d1.mjs';
const RealDate = Date, realFetch = globalThis.fetch;
let database, instant, sent, failEmail, mockFetch;
// Install before importing Vinext: its fetch wrapper captures the original at module load.
globalThis.fetch = (...args) => { if (!mockFetch) throw new Error("External network disabled in tests"); return mockFetch(...args); };
const env = {};
globalThis.__mlekoTestCloudflareEnv = env;
register(new URL('./cloudflare-loader.mjs', import.meta.url));
const worker = (await import('../dist/server/index.js')).default;
const at = (date) => { instant = RealDate.parse(date); };
beforeEach(() => {
  Object.keys(env).forEach(key => delete env[key]);
  Object.assign(env, { APP_ENV: 'local', APP_ORIGIN: 'http://localhost', PAYMENT_MODE: 'mock', BADI_MODE: 'disabled', ADMIN_LEGACY_ACCESS: 'true', ADMIN_SECRET: 'test-admin', CRON_SECRET: 'test-cron', EMAIL_MODE: 'provider', EMAIL_PROVIDER: 'resend', EMAIL_API_KEY: 'test-only', EMAIL_FROM: 'test@example.test', WHATSAPP_MODE: 'provider', WHATSAPP_PROVIDER: 'infobip', WHATSAPP_API_KEY: 'test-only', WHATSAPP_SENDER_ID: '381600000001', WHATSAPP_AUTH_TEMPLATE: 'test_login', WHATSAPP_UPDATE_TEMPLATE: 'test_update', WHATSAPP_TEMPLATE_LANGUAGE: 'sr', INFOBIP_BASE_URL: 'https://test.api.infobip.com' });
  at('2026-09-12T10:00:00Z');
  globalThis.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : [instant])); } static now() { return instant; } };
  database = createDatabase(); env.DB = database; sent = []; failEmail = false;
  database.raw.exec('UPDATE products SET is_active=1, allow_subscription=1');
  mockFetch = globalThis.fetch = async (url, init) => {
    assert.ok(url.startsWith('https://api.resend.com/') || url.startsWith('https://test.api.infobip.com/'), `Unexpected network request: ${url}`);
    const body = JSON.parse(init.body);
    if (url.includes('resend')) {
      if (failEmail) return Response.json({}, {status:503});
      sent.push({channel:'email', ...body}); return Response.json({id: randomUUID()});
    }
    sent.push({channel:'whatsapp', ...body.messages[0]});
    return Response.json({messages:[{messageId: body.messages[0].messageId, status:{groupId:1}}]});
  };
});
afterEach(() => { database.close(); globalThis.Date = RealDate; globalThis.fetch = realFetch; });
async function api(path, data, {method='POST', admin=false, cookie, key=randomUUID(), cron=false}={}) {
  const headers = {'content-type':'application/json', Origin:env.APP_ORIGIN, 'Idempotency-Key':key, ...(admin?{'x-admin-secret':env.ADMIN_SECRET}:{}), ...(cookie?{cookie}:{}), ...(cron?{authorization:'Bearer test-cron'}:{})};
  const response = await worker.fetch(new Request(env.APP_ORIGIN+path,{method,headers,...(method==='GET'?{}:{body:JSON.stringify(data)})}),env,{waitUntil(){},passThroughOnException(){}});
  const body = await response.json(); assert.ok(response.ok, JSON.stringify(body)); return body;
}
const one = (sql,...args) => database.raw.prepare(sql).get(...args);
function cookie() {
  const customer = one('SELECT id,email FROM customers LIMIT 1'), token=randomUUID();
  database.raw.prepare("INSERT INTO auth_tokens (id,customer_id,email,token_hash,kind,expires_at) VALUES (?,?,?,?,'session','2030-01-01T00:00:00Z')").run(randomUUID(),customer.id,customer.email,createHash('sha256').update(token).digest('base64url'));
  return 'mm_session='+token;
}
function optIn() {
  const {id}=one('SELECT id FROM customers LIMIT 1');
  database.raw.prepare("INSERT INTO customer_credentials (customer_id,password_hash,email_verified_at,whatsapp_phone,whatsapp_verified_at,whatsapp_consent_at,whatsapp_notifications_at) VALUES (?,'test-only',?,'+381600000000',?,?,?)").run(id,...Array(4).fill(new Date().toISOString()));
}
const line=(productId='prod_kravlje_1l',purchaseType='subscription')=>({productId,quantity:2,purchaseType,...(purchaseType==='subscription'?{cadence:'weekly'}:{})});
async function create(date='2026-09-15',items=[line()]) {
 return api('/api/checkout',{customer:{email:'flow@example.test',fullName:'Test Kupac',phone:'+381600000000',addressLine1:'Test 1',city:'Beograd',postalCode:'11000'},paymentMethod:'cash',deliveryDate:date,items});
}
const generate = (date) => api('/api/admin/deliveries',{action:'generate',date},{admin:true});
const jobs = () => api('/api/jobs/scheduled',null,{method:'GET',cron:true});
const process = () => api('/api/admin/integrations',{action:'process',limit:100},{admin:true});
async function mutate(id,action,details={},key=randomUUID()) {
 const version=one('SELECT version FROM subscriptions WHERE id=?',id).version;
 return api('/api/account/subscriptions/'+id,{action,expectedVersion:version,...details},{method:'PATCH',cookie:cookie(),key});
}
const emails=()=>sent.filter(x=>x.channel==='email');
const whatsapps=()=>sent.filter(x=>x.channel==='whatsapp');
const waText=(m)=>m.content.templateData.body.placeholders[0];
for (const [action, expected] of [['skip_next','Vaša sledeća isporuka je preskočena'],['pause','Pretplata je pauzirana'],['resume','Pretplata je nastavljena'],['cancel','Pretplata je otkazana'],['add_item','Proizvod je dodat'],['update_item','Proizvod u pretplati je izmenjen'],['remove_item','Proizvod je uklonjen'],['slow_down','svake dve nedelje'],['add_next_only','Dodatak za sledeću dostavu']]) {
 test(`customer ${action} reaches admin, delivery preparation, email and opted-in WhatsApp`,async()=>{
  const result=await create('2026-09-15',[line(),line('prod_kozje_1l')]),id=result.subscription.id;
  optIn();
  if(action==='resume') await mutate(id,'pause',{pauseUntil:'2026-09-22'});
  await generate('2026-09-15'); await generate('2026-09-22'); sent=[];
  const itemId=one("SELECT id FROM subscription_items WHERE product_id='prod_kravlje_1l'").id;
  const details={pause:{pauseUntil:'2026-09-22'},add_item:{productId:'prod_jogurt_1l',quantity:1,cadence:'biweekly'},update_item:{itemId,quantity:4,cadence:'biweekly'},remove_item:{itemId},add_next_only:{productId:'prod_jogurt_1l',quantity:1}}[action]??{};
  const changed=await mutate(id,action,details);
  const admin=(await api('/api/admin/subscriptions',null,{admin:true,method:'GET'})).subscriptions.find(s=>s.id===id);
  assert.equal(admin.version,changed.version);
  const expectedStatus=action==='cancel'?'cancelled':action==='pause'?'paused':'active';
  assert.equal(admin.status,expectedStatus);
  if(action==='skip_next') assert.equal(admin.skips[0].delivery_date,'2026-09-15');
  if(action==='update_item') { assert.equal(admin.items.find(i=>i.id===itemId).quantity,4); assert.equal(admin.items.find(i=>i.id===itemId).cadence,'biweekly'); }
  const projection=await api('/api/admin/deliveries?date=2026-09-15',null,{admin:true,method:'GET'});
  if(['skip_next','pause','cancel','resume'].includes(action)) assert.equal(projection.orders.length,0);
  if(action==='update_item') assert.equal(projection.preparation.find(i=>i.product_id==='prod_kravlje_1l').total_quantity,4);
  if(action==='remove_item') assert.ok(!projection.preparation.some(i=>i.product_id==='prod_kravlje_1l'));
  assert.ok(emails().some(m=>m.subject.includes(expected)), JSON.stringify({emails:emails(),outbox:database.raw.prepare("SELECT topic,status,last_error_message FROM outbox").all()}));
  assert.ok(whatsapps().some(m=>waText(m).includes(expected)), JSON.stringify(whatsapps()));
  assert.ok(emails().every(m=>m.text.includes('http://localhost/nalog')));
  if(action==='cancel') assert.ok(!emails().find(m=>m.subject===expected).text.includes('Sledeća dostava:'));
 });
}
for(const [date,day,previous] of [['2026-09-15','u utorak','2026-09-14'],['2026-09-18','u petak','2026-09-17']]) {
 test(`${day}: cron generates tomorrow after cutoff and sends one reminder per channel across regeneration`,async()=>{
  await create(date,[line(),line('prod_jogurt_1l','one_time')]); optIn(); sent=[];
  at(previous+'T10:00:00Z'); await jobs(); await jobs();
  const reminders=emails().filter(m=>m.subject==='Podsetnik za sutrašnju dostavu');
  assert.equal(reminders.length,2); // separate one-time and recurring delivery entries
  assert.ok(reminders.every(m=>m.text.includes('sutra, '+day)&&m.text.includes('/nalog')));
  assert.equal(whatsapps().length,2);
  at(previous+'T10:10:00Z'); await jobs(); await jobs();
  assert.equal(emails().filter(m=>m.subject==='Podsetnik za sutrašnju dostavu').length,2);
  assert.equal(whatsapps().length,2);
 });
}
test('skipped/cancelled/paused subscriptions never get next-day reminders',async()=>{
 for(const action of ['skip_next','pause','cancel']) {
  const r=await create(); await mutate(r.subscription.id,action,action==='pause'?{pauseUntil:'2026-09-22'}:{});
 }
 sent=[]; at('2026-09-14T10:00:00Z'); await jobs(); await jobs();
 assert.equal(emails().filter(m=>m.subject==='Podsetnik za sutrašnju dostavu').length,0);
});
test('queued reminder is suppressed after a skip and after its intended day',async()=>{
 const r=await create(); optIn(); await generate('2026-09-15');
 at('2026-09-14T04:00:00Z');
 await api('/api/admin/integrations',{action:'delivery_reminders',date:'2026-09-15'},{admin:true});
 await mutate(r.subscription.id,'skip_next'); sent=[]; await process();
 assert.equal(emails().filter(m=>m.subject==='Podsetnik za sutrašnju dostavu').length,0);
 assert.equal(whatsapps().length,0);
});
test('email failure does not block WhatsApp and retries keep original event date',async()=>{
 const r=await create(); optIn(); failEmail=true;
 await mutate(r.subscription.id,'skip_next');
 assert.equal(whatsapps().length,1);
 await mutate(r.subscription.id,'skip_next');
 assert.equal(whatsapps().length,2);
 failEmail=false; sent=[]; at('2026-09-12T11:00:00Z'); await process(); await process();
 const skipped=emails().filter(m=>m.subject.includes('preskočena'));
 assert.equal(skipped.length,2);
 assert.ok(skipped.some(m=>m.text.includes('22. septembar')));
 assert.ok(skipped.some(m=>m.text.includes('29. septembar')));
 assert.equal(whatsapps().length,0);
});
test('creation and admin changes send confirmations and opted-out customers receive no WhatsApp',async()=>{
 const r=await create('2026-09-15',[line('prod_kravlje_1l','one_time')]);
 assert.equal(emails().length,1); assert.equal(whatsapps().length,0);
 await generate('2026-09-15'); sent=[];
 await api('/api/admin/orders',{id:r.order.id,fulfillmentStatus:'cancelled'},{admin:true,method:'PATCH'});
 assert.equal(emails()[0].subject,'Porudžbina je ažurirana'); assert.match(emails()[0].text,/otkazano/);
 assert.equal((await api('/api/admin/deliveries?date=2026-09-15',null,{admin:true,method:'GET'})).orders.length,0);
});
test('Tuesday subscription retains Tuesday cadence and is included in next monthly billing',async()=>{
 const r=await create();
 const result=await api('/api/jobs/billing',{month:'2026-10'},{admin:true});
 assert.equal(result.results.find(x=>x.subscriptionId===r.subscription.id).deliveryOccurrences,4);
 assert.equal(one("SELECT delivery_date FROM orders WHERE subscription_id=? AND delivery_date LIKE '2026-10%'",r.subscription.id).delivery_date,'2026-10-06');
});
test('opted-in customer receives one-time order and subscription activation confirmations',async()=>{
 await create('2026-09-15',[line('prod_kravlje_1l','one_time')]); optIn(); sent=[];
 await create('2026-09-18',[line('prod_kozje_1l','one_time')]);
 assert.equal(emails().length,1); assert.equal(whatsapps().length,1);
 sent=[]; await create();
 assert.equal(emails().length,2); assert.equal(whatsapps().length,2);
 assert.ok(emails().some(m=>m.subject==='Pretplata je aktivirana'));
});
test('replayed mutation does not duplicate confirmations, and rejected mutation sends nothing',async()=>{
 const r=await create(); optIn(); sent=[];
 const key=randomUUID(), headers={cookie:cookie(),method:'PATCH',key}, input={action:'skip_next',expectedVersion:1};
 const path='/api/account/subscriptions/'+r.subscription.id;
 await api(path,input,headers); await api(path,input,headers);
 assert.equal(emails().length,1); assert.equal(whatsapps().length,1);
 const response=await worker.fetch(new Request(env.APP_ORIGIN+path,{method:'PATCH',headers:{'content-type':'application/json',Origin:env.APP_ORIGIN,cookie:cookie(),'Idempotency-Key':randomUUID()},body:JSON.stringify(input)}),env,{waitUntil(){}});
 assert.equal(response.status,409); assert.equal(emails().length,1); assert.equal(whatsapps().length,1);
});
test('queued WhatsApp reminder respects opt-out and yesterday reminder is suppressed',async()=>{
 await create(); optIn(); at('2026-09-14T10:00:00Z'); sent=[];
 await jobs(); // email queues a distinct WhatsApp job
 database.raw.exec('UPDATE customer_credentials SET whatsapp_notifications_at=NULL');
 await process(); assert.equal(whatsapps().length,0);
 assert.equal(one("SELECT COUNT(*) n FROM outbox WHERE topic='whatsapp.account_update' AND external_id LIKE 'suppressed:%'").n,1);
 // A delayed reminder is never delivered as "tomorrow" on the delivery date.
 database.raw.exec("UPDATE outbox SET status='pending' WHERE topic='email.delivery_reminder.requested'");
 at('2026-09-15T10:00:00Z'); sent=[]; await process(); assert.equal(emails().length,0);
});
test('cron does not wake customers at midnight and handles Belgrade daylight saving time',async()=>{
 await create('2026-09-15'); optIn(); sent=[];
 at('2026-09-13T22:10:00Z'); await jobs(); assert.equal(emails().length,0);
 at('2026-09-14T06:50:00Z'); await jobs(); assert.equal(emails().length,0);
 at('2026-09-14T07:00:00Z'); await jobs(); assert.equal(emails().filter(m=>m.subject==='Podsetnik za sutrašnju dostavu').length,1);
});
test('one-time purchase conversion activates a subscription and sends both confirmations immediately',async()=>{
 const order=await create('2026-09-15',[line('prod_kravlje_1l','one_time')]); optIn(); sent=[];
 const result=await api('/api/orders/convert-to-subscription',{token:order.subscriptionOffer.token,cadence:'biweekly'});
 const admin=(await api('/api/admin/subscriptions',null,{admin:true,method:'GET'})).subscriptions;
 assert.equal(admin[0].id,result.subscription.id); assert.equal(admin[0].items[0].cadence,'biweekly');
 assert.equal(emails().length,1); assert.equal(emails()[0].subject,'Pretplata je aktivirana');
 assert.equal(whatsapps().length,1); assert.match(waText(whatsapps()[0]),/Pretplata je aktivirana/);
});
