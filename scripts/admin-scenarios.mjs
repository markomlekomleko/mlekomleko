// Creates a NEW, isolated SQLite database. Never touches the configured shop database.
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, readdirSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { scenarioEnvironment } from './lib/scenario-env.mjs';
import './lib/domain-loader.mjs';
const realDate = Date;
const stamp = new realDate().toISOString().replace(/[:.]/g, '-');
const path = resolve('.data', `admin-scenarios-${stamp}.sqlite`);
mkdirSync(resolve('.data'), {recursive:true});
assert(!existsSync(path));
Object.assign(process.env, scenarioEnvironment(path));
globalThis.fetch = async () => { throw new Error('External network is forbidden while creating admin scenarios.'); };
const raw = new DatabaseSync(path);
raw.exec('PRAGMA foreign_keys=ON');
for (const name of readdirSync('migrations').filter(n=>n.endsWith('.sql')).sort()) raw.exec(readFileSync(`migrations/${name}`, 'utf8'));
raw.exec("UPDATE products SET is_active=1,allow_subscription=1,inventory_enabled=0;");
raw.prepare("INSERT INTO settings(key,value_json) VALUES('storeName',?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json").run(JSON.stringify('Mleko i Mleko — TEST SCENARIJI'));
raw.exec("CREATE TRIGGER test_scenarios_defer_events AFTER INSERT ON outbox BEGIN UPDATE outbox SET available_at='9999-12-31T00:00:00Z',external_id='scenario:deferred' WHERE id=NEW.id; END");
raw.close();
const {checkout,mutateSubscription}=await import('../server/commerce.ts');
const {updateOrder}=await import('../server/admin.ts');
const {first,run}=await import('../server/sql.ts');
const {generateDelivery}=await import('../server/deliveries.ts');
const {completeDeliveryOrder}=await import('../server/delivery-completion.ts');
const {getNextDeliveryWindow}=await import('../server/settings.ts');
const {localDateAt,addLocalDays}=await import('../server/time.ts');
const today=localDateAt();
const next=(await getNextDeliveryWindow(new realDate(),'Beograd')).deliveryDate;
const at = date => { const instant=realDate.parse(date+'T10:00:00Z'); globalThis.Date=class extends realDate {constructor(...args){super(...(args.length?args:[instant]));}static now(){return instant;}}; };
const scenarios=[];
const line=(quantity=2,cadence='weekly',productId='prod_kravlje_1l')=>({productId,quantity,purchaseType:cadence?'subscription':'one_time',...(cadence?{cadence}:{})});
async function create(name,description,{items=[line()],date=next,paid=true,city='Beograd',extra={}}={}) {
 const number=scenarios.length+1,fullName=`TEST ${String(number).padStart(2,'0')} — ${name}`;
 const response=await checkout({customer:{email:`scenario-${number}@example.invalid`,fullName,phone:'+381000000000',addressLine1:`Test ulica ${number}`,city,postalCode:city==='Novi Sad'?'21000':'11000'},items,deliveryDate:date,paymentMethod:'cash',note:`TEST PODACI — ${description}`,analyticsConsent:false,marketingConsent:false,...extra},`scenario:${stamp}:${number}`,{notify:false});
 const order=response.body.order;
 if(paid) await updateOrder({id:order.id,paymentStatus:'paid'});
 const row=await first('SELECT customer_id FROM orders WHERE id=?',order.id);
 const s={number,name:fullName,description,orderId:order.id,orderNumber:order.orderNumber,customerId:row.customer_id,subscriptionId:response.body.subscription?.id??null,date};
 scenarios.push(s);return s;
}
async function mutate(s,action,details={}) {
 const sub=await first('SELECT version FROM subscriptions WHERE id=?',s.subscriptionId);
 return mutateSubscription(s.customerId,s.subscriptionId,{action,expectedVersion:sub.version,...details},`scenario:${stamp}:${s.number}:${action}:${crypto.randomUUID()}`,'customer');
}
const itemId=async s=>(await first("SELECT id FROM subscription_items WHERE subscription_id=? AND status='active' ORDER BY id LIMIT 1",s.subscriptionId)).id;
// Historical scenarios use the actual business transitions and a controlled clock.
const last=addLocalDays(next,-7),start=addLocalDays(last,-21);
at(addLocalDays(start,-3));
const finished=await create('Završen paket','Sve četiri nedeljne dostave uručene.',{date:start});
const partial=await create('Delimično uručeno','Od 3 flaše uručene 2; neuručena količina ostaje u paketu.',{date:last,items:[line(3)]});
const failed=await create('Neuspela dostava','Kupac nije bio na adresi; ništa nije potrošeno iz paketa.',{date:last});
await create('Jednokratno uručeno','Plaćena i potpuno uručena jednokratna porudžbina.',{date:last,items:[line(2,null)]});
for(let i=0;i<4;i++) {
 const date=addLocalDays(start,i*7);at(date);
 const delivery=await generateDelivery(date,`scenario:history:${i}`);
 for(const o of delivery.orders) {
  const status=o.customer_id===failed.customerId?'failed':'delivered';
  const items=o.customer_id===partial.customerId?o.items.map(item=>({id:item.id,deliveredQuantity:2})):undefined;
  await completeDeliveryOrder({id:o.id,status,...(items?{items}:{})});
 }
}
globalThis.Date=realDate;
await create('Čeka gotovinu','Jednokratna porudžbina, naplata pri dostavi.',{items:[line(2,null)],paid:false});
await create('Plaćena jednokratna','Uplata evidentirana, čeka dostavu.',{items:[line(2,null)]});
await create('Nedeljni paket','Plaćen paket: 2 flaše × 4 dostave.');
await create('Dvonedeljni paket','Plaćen paket: 3 flaše × 2 dostave.',{items:[line(3,'biweekly')]});
await create('Paket čeka uplatu','Neplaćen paket; ne ulazi u pripremu.',{paid:false});
const skipped=await create('Preskočena dostava','Preskočen prvi termin; plaćene količine ostaju.');await mutate(skipped,'skip_next');
const changed=await create('Promenjena količina','Kupljeno 2 po dostavi; za sledeći paket izabrano 4.');await mutate(changed,'update_item',{itemId:await itemId(changed),quantity:4});
const cadence=await create('Promenjen ritam','Kupljen nedeljni paket; naredni paket na dve nedelje.');await mutate(cadence,'slow_down');
const paused=await create('Pauzirana pretplata','Pauza dve nedelje; kupljene količine sačuvane.');await mutate(paused,'pause',{pauseUntil:addLocalDays(next,14)});
const resumed=await create('Nastavljena pretplata','Kupac pauzirao pa nastavio; obe izmene u istoriji.');await mutate(resumed,'pause',{pauseUntil:addLocalDays(next,14)});await mutate(resumed,'resume');
const cancel=await create('Obnova otkazana','Plaćeni paket se isporučuje do kraja, bez obnove.');await mutate(cancel,'cancel');
const unpaidCancel=await create('Otkazan neplaćen paket','Kupac otkazao pre uplate.',{paid:false});await mutate(unpaidCancel,'cancel');
const addon=await create('Dodatak za sledeću dostavu','Uz paket dodat 1 jogurt samo za sledeći termin.');await mutate(addon,'add_next_only',{productId:'prod_jogurt_1l',quantity:1});
await create('Mešovita korpa','Mleko nedeljno, jogurt dvonedeljno, sir jednokratno.',{items:[line(2),line(1,'biweekly','prod_jogurt_1l'),line(1,null,'prod_sir_500g')]});
const edit=await create('Izmenjena porudžbina','Jednokratna porudžbina: količina 2 → 4 i nova adresa.',{items:[line(2,null)],paid:false});await updateOrder({id:edit.orderId,items:[{productId:'prod_kravlje_1l',quantity:4}],customer:{addressLine1:'Promenjena test adresa 19'}});
const cancelledOrder=await create('Otkazana jednokratna','Porudžbina otkazana pre naplate.',{items:[line(2,null)],paid:false});await updateOrder({id:cancelledOrder.orderId,fulfillmentStatus:'cancelled'});
const failedPay=await create('Neuspela naplata','Simuliran status neuspešne naplate; nema bankarske transakcije.',{items:[line(2,null)],paid:false});await updateOrder({id:failedPay.orderId,paymentStatus:'failed'});
await create('Račun na firmu','Porudžbina sa podacima pravnog lica; bez izdatog računa.',{items:[line(2,null)],extra:{billing:{companyName:'TEST Primer DOO',taxId:'123456789',addressLine1:'Test poslovna 22',city:'Beograd',postalCode:'11000'}}});
const added=await create('Dodat proizvod u pretplatu','Jogurt dodat u sastav narednog paketa.');await mutate(added,'add_item',{productId:'prod_jogurt_1l',quantity:1,cadence:'weekly'});
const removed=await create('Uklonjen proizvod','Kupljeni paket ostaje isti; jogurt uklonjen iz sledećeg.',{items:[line(2),line(1,'weekly','prod_jogurt_1l')]});
const yogurt=await first("SELECT id FROM subscription_items WHERE subscription_id=? AND product_id='prod_jogurt_1l'",removed.subscriptionId);await mutate(removed,'remove_item',{itemId:yogurt.id});
const {requestRefund,reviewRefund}=await import('../server/refunds.ts');
const refund=await create('Tražen povraćaj','Zahtev za povraćaj neisporučenog paketa; nije izvršen.');await requestRefund({orderId:refund.orderId,idempotencyKey:`scenario:refund:${stamp}`,reason:'TEST: kupac traži povraćaj'},refund.customerId);
const approved=await create('Odobren povraćaj','Povraćaj odobren, čeka izvršenje; nema bankarske ni fiskalne radnje.');
const req=await requestRefund({orderId:approved.orderId,idempotencyKey:`scenario:refund-approved:${stamp}`,reason:'TEST: odobren zahtev'},approved.customerId);await reviewRefund({id:req.id,action:'approve',expectedVersion:req.version});
// Preserve the audit and queued events; defer dispatch permanently in this test fixture.
await run("UPDATE outbox SET available_at='9999-12-31T00:00:00Z',external_id='scenario:deferred',last_error_code=NULL,last_error_message=NULL");
const preview=await generateDelivery(next,`scenario:preview:${stamp}`);
assert.equal((await first('SELECT COUNT(*) AS n FROM fiscal_receipts')).n,0);
assert.equal((await first('SELECT COUNT(*) AS n FROM fiscal_dispatches')).n,0);
assert.equal((await first('SELECT COUNT(*) AS n FROM message_deliveries')).n,0);
assert.equal((await first('SELECT status FROM subscription_packages WHERE order_id=?',finished.orderId)).status,'completed');
assert.equal((await first('SELECT status FROM subscriptions WHERE id=?',paused.subscriptionId)).status,'paused');
assert.equal((await first('SELECT status FROM subscriptions WHERE id=?',unpaidCancel.subscriptionId)).status,'cancelled');
assert.equal((await first('SELECT renewal_enabled FROM subscriptions WHERE id=?',cancel.subscriptionId)).renewal_enabled,0);
assert.equal((await first('SELECT COUNT(*) AS n FROM subscription_skips WHERE subscription_id=?',skipped.subscriptionId)).n,1);
assert.equal(preview.orders.some(o=>o.customer_id===skipped.customerId),false);
assert.equal(preview.orders.some(o=>o.customer_id===paused.customerId),false);
for(const s of scenarios) {
 const order=await first('SELECT payment_status,fulfillment_status FROM orders WHERE id=?',s.orderId);
 Object.assign(s,order);
}
const summary={createdAt:new realDate().toISOString(),databasePath:path,adminUrl:'http://localhost:4191/admin',today,nextDelivery:next,historyDates:Array.from({length:4},(_,i)=>addLocalDays(start,i*7)),customers:scenarios.length,orders:(await first('SELECT COUNT(*) AS n FROM orders')).n,fiscalReceipts:0,externalRequests:0,scenarios};
writeFileSync('.data/admin-scenarios-latest.json',JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
