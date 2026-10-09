import assert from 'node:assert/strict';
import test from 'node:test';
import { fiscalAmounts } from '../integrations/fiscal-amounts.mjs';
const item=(sku,quantity,price)=>({badi_sku:sku,quantity,unit_price_minor:price,line_total_minor:quantity*price});
const sum=lines=>lines.reduce((n,line)=>n+Math.round(line.unitPrice*100)*line.quantity,0);
test('product discount never reduces delivery and receipt matches paid cents',()=>{
 const lines=fiscalAmounts([item(1,3,10000),item(2,2,20000)],63000+30000,30000,90,null);
 assert.equal(lines.find(line=>line.sku===90).unitPrice,300);
 assert.equal(sum(lines),93000);
 assert.equal(lines.filter(line=>line.sku===1).reduce((n,line)=>n+line.quantity,0),3);
});
test('penny allocations, multiple billing occurrences and fully applied balance stay exact',()=>{
 for(const total of [1,2,1001,13599,99999]) {
  const lines=fiscalAmounts([item(1,30,1234),item(2,70,4567)],total,999,90,91);
  assert.equal(sum(lines),total);
  assert.equal(lines.filter(line=>line.sku===1).reduce((n,line)=>n+line.quantity,0),30);
  assert.ok(lines.every(line=>line.unitPrice>=0));
 }
});
test('surcharges require mapped SKU and invalid quantities fail before dispatch',()=>{
 assert.throws(()=>fiscalAmounts([item(1,1,100)],200,0,null,null),/ADJUSTMENT_SKU/);
 assert.equal(sum(fiscalAmounts([item(1,1,100)],200,0,null,91)),200);
 assert.throws(()=>fiscalAmounts([{...item(1,1,100),line_total_minor:101}],101,0,null,null),/količine/);
});
