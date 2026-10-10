import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
function setup(){
 const db=new DatabaseSync(':memory:');
 db.exec(`
 CREATE TABLE customers(id TEXT PRIMARY KEY);
 CREATE TABLE orders(id TEXT PRIMARY KEY,customer_id TEXT);
 CREATE TABLE subscriptions(id TEXT PRIMARY KEY,customer_id TEXT);
 CREATE TABLE delivery_orders(id TEXT PRIMARY KEY,customer_id TEXT);
 CREATE TABLE refund_requests(id TEXT PRIMARY KEY,customer_id TEXT);
 CREATE TABLE outbox(id TEXT PRIMARY KEY,aggregate_type TEXT,aggregate_id TEXT,available_at TEXT,external_id TEXT);
 CREATE TABLE fiscal_receipts(id TEXT PRIMARY KEY,order_id TEXT);
 CREATE TABLE payment_attempts(id TEXT PRIMARY KEY,order_id TEXT);
 INSERT INTO customers VALUES('test'),('real');
 INSERT INTO orders VALUES('test-order','test'),('real-order','real');
 INSERT INTO subscriptions VALUES('test-sub','test');
 INSERT INTO delivery_orders VALUES('test-delivery','test');
 INSERT INTO refund_requests VALUES('test-refund','test');`);
 db.exec(readFileSync(new URL('../migrations/0020_test_scenarios.sql',import.meta.url),'utf8'));
 db.exec("INSERT INTO test_scenario_customers(customer_id,cohort) VALUES('test','sample')");
 return db;
}
test('registered scenarios cannot queue external actions or requeue retries',()=>{
 const db=setup();try{
 for(const [type,id] of [['customer','test'],['order','test-order'],['subscription','test-sub'],['delivery_order','test-delivery'],['refund','test-refund']]){
 db.prepare('INSERT INTO outbox VALUES(?,?,?, ?,NULL)').run(type,type,id,'2020');
 db.prepare("UPDATE outbox SET available_at='2020' WHERE id=?").run(type);
 assert.equal(db.prepare('SELECT available_at FROM outbox WHERE id=?').get(type).available_at,'9999-12-31T00:00:00Z');
 }
 }finally{db.close();}
});
test('normal customer events and financial records remain usable',()=>{
 const db=setup();try{
 db.exec("INSERT INTO outbox VALUES('real-event','order','real-order','2020',NULL)");
 assert.equal(db.prepare('SELECT available_at FROM outbox').get().available_at,'2020');
 for(const table of ['fiscal_receipts','payment_attempts'])db.exec(`INSERT INTO ${table} VALUES('real-record','real-order')`);
 }finally{db.close();}
});
test('direct financial creation and reassignment to test orders are blocked',()=>{
 const db=setup();try{
 for(const table of ['fiscal_receipts','payment_attempts']){
 assert.throws(()=>db.exec(`INSERT INTO ${table} VALUES('blocked','test-order')`),/TEST_SCENARIO_EXTERNAL_ACTION_BLOCKED/);
 db.exec(`INSERT INTO ${table} VALUES('real-record','real-order')`);
 assert.throws(()=>db.exec(`UPDATE ${table} SET order_id='test-order' WHERE id='real-record'`),/TEST_SCENARIO_EXTERNAL_ACTION_BLOCKED/);
 }
 }finally{db.close();}
});
