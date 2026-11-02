import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createDatabase} from './sqlite-d1.mjs';
import {prepareCustomerImport,applyCustomerImport,parseCustomerCsv} from '../integrations/customer-import.mjs';
const row={external_customer_id:'old-1',full_name:'Test Kupac',email:'import@example.test',phone:'+381600000000',address:'Test 1',city:'Beograd',postal_code:'11000',external_order_id:'paket-1',next_delivery_date:'2027-01-08',paid:'true',payment_method:'cash',advance_provider:'fiscomm',advance_mode:'live',advance_invoice_number:'TEST-OLD-ADVANCE',advance_time:'2026-12-20T10:00:00Z',purchased_at:'2026-12-20T10:00:00Z',total_rsd:'3400',delivery_fee_rsd:'1400',remaining_rsd:'1700',delivery_tax_label:'A',product_id:'prod_kravlje_1l',cadence:'weekly',quantity:'2',delivered_quantity:'4',unit_price_rsd:'250',net_product_rsd:'2000',allocated_delivery_rsd:'1400',tax_label:'A'};
function fixture(){const raw=createDatabase();return {raw,now:'2026-12-30T10:00:00Z',db:{first:(sql,...bindings)=>raw.prepare(sql).bind(...bindings).first(),batch:statements=>raw.batch(statements.map(s=>raw.prepare(s.sql).bind(...(s.bindings??[]))))},validatePackage:async()=>{}};}
test('reviewed import preserves remaining paid units and repeats without any charges or messages',async()=>{
 const f=fixture();try{
  const plan=await prepareCustomerImport([row],{...f,batchId:'marko-001'});assert.deepEqual(plan.errors,[]);assert.equal(plan.remainingUnits,4);assert.equal(plan.remainingMinor,170000);
  await assert.rejects(applyCustomerImport(plan,{db:f.db,approvedHash:'wrong'}));
  await applyCustomerImport(plan,{db:f.db,approvedHash:plan.approvalHash});
  const count=table=>f.raw.raw.prepare(`SELECT COUNT(*) n FROM ${table}`).get().n;
  assert.equal(count('customers'),1);assert.equal(count('orders'),1);assert.equal(count('outbox'),0);assert.equal(count('payment_attempts'),0);assert.equal(count('fiscal_receipts'),1);
  assert.equal(f.raw.raw.prepare('SELECT imported_delivered_quantity n FROM package_lines').get().n,4);
  const repeat=await prepareCustomerImport([row],{...f,batchId:'marko-001'});assert.equal(repeat.alreadyImported,true);await applyCustomerImport(repeat,{db:f.db});assert.equal(count('orders'),1);
  await assert.rejects(prepareCustomerImport([{...row,remaining_rsd:'100'}],{...f,batchId:'marko-001'}));
  const duplicate=await prepareCustomerImport([row],{...f,batchId:'marko-002'});assert.ok(duplicate.errors.length);assert.equal(duplicate.statements.length,0);
 }finally{f.raw.close();}
});
test('invalid balance, conflicting contact and unconfirmed area abort the entire import',async()=>{
 const f=fixture();try{
  for(const patch of [{remaining_rsd:'1600'},{delivered_quantity:'9'},{paid:'false'},{next_delivery_date:'2027-02-30'}]){
   const p=await prepareCustomerImport([{...row,...patch}],{...f,batchId:'invalid'});assert.ok(p.errors.length);assert.equal(p.statements.length,0);
  }
  const conflict=await prepareCustomerImport([row,{...row,phone:'other'}],{...f,batchId:'conflict'});assert.ok(conflict.errors.length);
  const area=await prepareCustomerImport([row],{...f,batchId:'area',validatePackage:async()=>{throw Error('disabled');}});assert.ok(area.errors.length);
 }finally{f.raw.close();}
});
test('CSV supports Excel delimiter, quotes, multiline and rejects malformed rows',()=>{
 assert.deepEqual(parseCustomerCsv('\ufeffname;address\r\n"Željko";"A;B\nC"\r\n'),[{name:'Željko',address:'A;B\nC'}]);
 assert.throws(()=>parseCustomerCsv('a,a\n1,2'));assert.throws(()=>parseCustomerCsv('a,b\n"x,y'));assert.throws(()=>parseCustomerCsv('a,b\n1'));
});
