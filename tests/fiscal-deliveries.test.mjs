import assert from 'node:assert/strict';
import test from 'node:test';
import {buildFiscalSnapshot, fiscalDeliveryItems} from '../integrations/fiscal-deliveries.mjs';

test('all partial fulfillment partitions conserve discounted products and delivery down to a cent', () => {
  for (const totalMinor of [0,1,301,10003,77999]) {
    const rows = [
      {id:'goat',product_name:'Goat',purchased_quantity:16,quantity:8,unit_price_minor:3000,line_total_minor:48000,tax_label:'Е'},
      {id:'cow',product_name:'Cow',purchased_quantity:40,quantity:10,unit_price_minor:1000,line_total_minor:40000,tax_label:'Е'},
    ];
    const snapshot = buildFiscalSnapshot(rows,totalMinor,901,'Ђ');
    let actual=0;
    for(const line of snapshot.lines) for(let offset=0;offset<line.quantity;offset++) {
      const result=fiscalDeliveryItems(snapshot,[{order_item_id:line.orderItemId,unit_offset:offset,quantity:1}]);
      actual+=result.totalMinor;
      assert.equal(result.items.filter(item=>item.name!=='Dostava').reduce((sum,item)=>sum+item.quantity,0),1);
    }
    assert.equal(actual,totalMinor);
    assert.equal(fiscalDeliveryItems(snapshot).totalMinor,totalMinor);
  }
});
test('free recurring products retain the full purchased quantity',()=>{
  const snapshot=buildFiscalSnapshot([{id:'free',product_name:'Free',purchased_quantity:40,quantity:10,unit_price_minor:0,line_total_minor:0,tax_label:'Е'}],400,400,'Ђ');
  assert.equal(fiscalDeliveryItems(snapshot).items[0].quantity,40);
  assert.equal(fiscalDeliveryItems(snapshot,[{order_item_id:'free',unit_offset:10,quantity:10}]).totalMinor,100);
  assert.throws(()=>fiscalDeliveryItems(snapshot,[{order_item_id:'free',unit_offset:31,quantity:10}]),/prelazi/);
  assert.throws(()=>fiscalDeliveryItems(snapshot,[{order_item_id:'foreign',unit_offset:0,quantity:1}]),/prelazi/);
});
