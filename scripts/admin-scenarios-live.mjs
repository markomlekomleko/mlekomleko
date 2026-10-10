// Imports only the isolated scenario cohort. Default rehearsal always rolls back.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { createHash, randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import pg from 'pg';
import { postgresConfig, postgresUrl } from '../db/postgres-config.mjs';
const apply=process.argv.includes('--apply');
const manifest=JSON.parse(readFileSync('.data/admin-scenarios-latest.json','utf8'));
const cohort=`admin-scenarios:${manifest.createdAt}`;
const db=new DatabaseSync(manifest.databasePath,{readOnly:true});
const customerIds=new Set(manifest.scenarios.map(s=>s.customerId));
const rows={};
const read=(table)=>db.prepare(`SELECT * FROM ${table}`).all();
rows.customers=read('customers').filter(r=>customerIds.has(r.id));
assert.equal(rows.customers.length,26);
assert(rows.customers.every(r=>r.full_name.startsWith('TEST ')&&r.email.endsWith('@example.invalid')));
for(const table of ['subscriptions','orders','refund_requests','next_delivery_addons','delivery_orders']) rows[table]=read(table).filter(r=>customerIds.has(r.customer_id) || (table==='next_delivery_addons' && rows.subscriptions.some(s=>s.id===r.subscription_id)));
const ids=(table)=>new Set(rows[table].map(r=>r.id));
for(const [table,parent,key] of [['subscription_items','subscriptions','subscription_id'],['subscription_skips','subscriptions','subscription_id'],['order_items','orders','order_id'],['subscription_packages','orders','order_id'],['package_lines','subscription_packages','package_id'],['delivery_items','delivery_orders','delivery_order_id']])rows[table]=read(table).filter(r=>ids(parent).has(r[key]));
const deliveryIds=new Set(rows.delivery_orders.map(r=>r.delivery_id));
rows.deliveries=read('deliveries').filter(r=>deliveryIds.has(r.id));
const entityIds=new Set(Object.values(rows).flat().map(r=>r.id));
rows.audit_log=read('audit_log').filter(r=>entityIds.has(r.entity_id));
assert.equal(rows.orders.length,27);
assert(rows.orders.every(r=>r.payment_method==='cash'));
assert.equal(read('fiscal_receipts').length,0);
assert.equal(read('payment_attempts').length,0);
const env=parseEnv(readFileSync('.env.local','utf8'));
const client=new pg.Client(postgresConfig(postgresUrl(env)));
const quote=s=>{assert(/^[a-z_][a-z_0-9]*$/.test(s));return `"${s}"`;};
async function insert(table,row){const cols=Object.keys(row);await client.query(`INSERT INTO ${quote(table)} (${cols.map(quote).join(',')}) VALUES (${cols.map((_,i)=>'$'+(i+1)).join(',')})`,Object.values(row));}
const count=async table=>Number((await client.query(`SELECT COUNT(*) AS n FROM ${quote(table)}`)).rows[0].n);
try{
 await client.connect();await client.query('BEGIN');
 await client.query("SELECT pg_advisory_xact_lock(hashtext('mleko-migrations'),hashtext('public'))");
 await client.query("SELECT pg_advisory_xact_lock(hashtext($1))",[cohort]);
 const applied=new Map((await client.query('SELECT name,checksum FROM __mleko_migrations')).rows.map(r=>[r.name,r.checksum]));
 for(const name of readdirSync('migrations/postgres').filter(n=>n.endsWith('.sql')).sort()){
  const sql=readFileSync(`migrations/postgres/${name}`,'utf8'),checksum=createHash('sha256').update(sql).digest('hex');
  if(applied.has(name)){assert.equal(applied.get(name),checksum,`Migration changed: ${name}`);continue;}
  assert.equal(name,'0020_test_scenarios.sql','Unexpected unapplied migration');
  await client.query(sql);await client.query('INSERT INTO __mleko_migrations(name,checksum) VALUES($1,$2)',[name,checksum]);
  await client.query('ALTER TABLE test_scenario_customers ENABLE ROW LEVEL SECURITY');
  await client.query('REVOKE ALL ON test_scenario_customers FROM PUBLIC,anon,authenticated');
 }
 const existing=await client.query('SELECT customer_id FROM test_scenario_customers WHERE cohort=$1',[cohort]);
 if(existing.rowCount){assert.equal(existing.rowCount,26);console.log(JSON.stringify({alreadyImported:true,customers:26}));await client.query('ROLLBACK');process.exitCode=0;}
 else{
 const before={};for(const table of ['customers','orders','subscriptions','fiscal_receipts','fiscal_dispatches','message_deliveries','payment_attempts'])before[table]=await count(table);
 const originalOrders=(await client.query('SELECT * FROM orders ORDER BY id')).rows;
 const originalCustomers=(await client.query('SELECT * FROM customers ORDER BY id')).rows;
 const products=new Set((await client.query('SELECT id FROM products')).rows.map(r=>r.id));
 assert(rows.order_items.every(r=>products.has(r.product_id)),'Referenced product is absent');
 for(const row of rows.customers){await insert('customers',row);await insert('test_scenario_customers',{customer_id:row.id,cohort});}
 for(const table of ['subscriptions','orders','subscription_items','subscription_skips','order_items','subscription_packages','package_lines','next_delivery_addons','refund_requests'])for(const row of rows[table])await insert(table,row);
 for(const row of rows.deliveries){const prior=(await client.query('SELECT id,status FROM deliveries WHERE delivery_date=$1',[row.delivery_date])).rows[0];if(prior){assert.equal(prior.status,'open','Cannot merge into a locked live delivery');assert.equal(row.status,'open');for(const order of rows.delivery_orders)if(order.delivery_id===row.id)order.delivery_id=prior.id;}else await insert('deliveries',row);}
 for(const table of ['delivery_orders','delivery_items','audit_log'])for(const row of rows[table])await insert(table,row);
 // Probe financial and message protection in savepoints, never call providers.
 await client.query('SAVEPOINT guard_probe');
 const probes=[['order',rows.orders[0].id],['subscription',rows.subscriptions[0].id],['customer',rows.customers[0].id],['delivery_order',rows.delivery_orders[0].id],['refund',rows.refund_requests[0].id]];
 for(const [type,id] of probes){const event=randomUUID();await insert('outbox',{id:event,topic:'fiscal.receipt.requested',aggregate_type:type,aggregate_id:id,payload_json:'{}',available_at:'2020-01-01'});await client.query("UPDATE outbox SET available_at='2020-01-01' WHERE id=$1",[event]);const row=(await client.query('SELECT available_at FROM outbox WHERE id=$1',[event])).rows[0];assert(row.available_at.startsWith('9999'));}
 if(originalOrders.length){const id=randomUUID();await insert('outbox',{id,topic:'guard.probe',aggregate_type:'order',aggregate_id:originalOrders[0].id,payload_json:'{}',available_at:'2020-01-01'});assert.equal((await client.query('SELECT available_at FROM outbox WHERE id=$1',[id])).rows[0].available_at,'2020-01-01');}
 await client.query('ROLLBACK TO SAVEPOINT guard_probe');
 for(const table of ['fiscal_receipts','payment_attempts']){
  await client.query('SAVEPOINT financial_probe');let blocked=false;
  try{await insert(table,table==='fiscal_receipts'?{id:randomUUID(),order_id:rows.orders[0].id,operation_key:randomUUID()}:{id:randomUUID(),order_id:rows.orders[0].id,operation:'charge',status:'pending',amount_minor:100,provider:'test',idempotency_key:randomUUID()});}catch(e){blocked=e.message.includes('TEST_SCENARIO_EXTERNAL_ACTION_BLOCKED');}
  await client.query('ROLLBACK TO SAVEPOINT financial_probe');assert(blocked,`${table} guard failed`);
 }
 assert.deepEqual((await client.query('SELECT * FROM orders WHERE NOT(customer_id=ANY($1::text[])) ORDER BY id',[[...customerIds]])).rows,originalOrders);
 assert.deepEqual((await client.query('SELECT * FROM customers WHERE NOT(id=ANY($1::text[])) ORDER BY id',[[...customerIds]])).rows,originalCustomers);
 for(const table of ['fiscal_receipts','fiscal_dispatches','message_deliveries','payment_attempts'])assert.equal(await count(table),before[table]);
 const report={applied:apply,cohort,createdAt:new Date().toISOString(),before,imported:Object.fromEntries(Object.entries(rows).map(([k,v])=>[k,v.length])),customerIds:[...customerIds],checks:'All guard probes passed; original customers/orders unchanged; zero new receipts, payments or messages.'};
 await client.query(apply?'COMMIT':'ROLLBACK');
 writeFileSync(`.data/live-scenarios-${apply?'applied':'rehearsal'}.json`,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({...report,customerIds:undefined},null,2));
 }
}catch(e){await client.query('ROLLBACK').catch(()=>{});console.error({code:e.code,message:e.message});process.exitCode=1;}finally{db.close();await client.end();}
