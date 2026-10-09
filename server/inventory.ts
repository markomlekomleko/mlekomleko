import { assertDomain, nonNegativeInt, requiredString } from './domain';
import { all, batch, first, type Row, type SqlValue } from './sql';
import { mutationGuard } from './mutation-guard';
import { audit } from './outbox';
import { assertLocalDate, localDateAt } from './time';
type Statement = { sql: string; bindings?: SqlValue[] };
export async function listInventory() { return all<Row>('SELECT l.*,p.name AS product_name,p.unit_label FROM inventory_lots l JOIN products p ON p.id=l.product_id ORDER BY l.expires_on,l.lot_number'); }
export async function receiveLot(input: Row) {
  const productId=requiredString(input.productId,'productId',100), lot=requiredString(input.lotNumber,'lotNumber',100), expiry=assertLocalDate(input.expiresOn), quantity=nonNegativeInt(input.quantity,'quantity',1000000), id=crypto.randomUUID();
  assertDomain(expiry >= localDateAt() && quantity > 0,'INVALID_LOT','Serija mora imati budući rok i pozitivnu količinu.',422);
  assertDomain(await first('SELECT id FROM products WHERE id = ?',productId),'PRODUCT_NOT_FOUND','Proizvod nije pronađen.',404);
  await batch([{sql:'INSERT INTO inventory_lots(id,product_id,lot_number,expires_on,quantity) VALUES(?,?,?,?,?)',bindings:[id,productId,lot,expiry,quantity]}, {sql:'INSERT INTO inventory_movements(id,lot_id,quantity,reason,actor_id) VALUES(?,?,?,?,?)',bindings:[crypto.randomUUID(),id,quantity,'receipt','admin']},audit('admin','admin-panel','inventory.received','lot',id,null,{productId,lot,expiry,quantity})]);
  return {id};
}
/** Whole-order reservation; opt-in stock products require stock valid through the last paid visit. */
export async function reserveInventory(orderId: string, lines: { productId:string; quantity:number; lastDate:string }[], releaseOwn = false): Promise<Statement[]> {
  const grouped=new Map<string,{quantity:number;lastDate:string}>();
  for(const line of lines){const old=grouped.get(line.productId);grouped.set(line.productId,{quantity:(old?.quantity??0)+line.quantity,lastDate:[old?.lastDate??'',line.lastDate].sort().at(-1)!});}
  const statements: Statement[]=[];
  for(const [productId,line] of grouped){
    const product=await first<Row>('SELECT inventory_enabled FROM products WHERE id=?',productId);if(!product?.inventory_enabled)continue;
    const lots=await all<Row>('SELECT l.*,quantity-reserved+COALESCE((SELECT SUM(r.quantity-r.consumed) FROM inventory_reservations r WHERE r.lot_id=l.id AND r.order_id=?),0) AS available FROM inventory_lots l WHERE product_id=? AND expires_on>=? ORDER BY expires_on,id',releaseOwn?orderId:'',productId,line.lastDate);
    let remaining=line.quantity;
    for(const lot of lots){const quantity=Math.min(remaining,Number(lot.available));if(!quantity)continue;
      const guard=mutationGuard('EXISTS(SELECT 1 FROM inventory_lots WHERE id=? AND quantity-reserved>=?)',[String(lot.id),quantity]);
      statements.push(guard.check,{sql:'UPDATE inventory_lots SET reserved=reserved+?,version=version+1 WHERE id=?',bindings:[quantity,String(lot.id)]},{sql:'INSERT INTO inventory_reservations(id,order_id,product_id,lot_id,quantity) VALUES(?,?,?,?,?) ON CONFLICT(order_id,lot_id) DO UPDATE SET quantity=inventory_reservations.quantity+excluded.quantity',bindings:[crypto.randomUUID(),orderId,productId,String(lot.id),quantity]},guard.cleanup);remaining-=quantity;if(!remaining)break;
    }
    assertDomain(!remaining,'OUT_OF_STOCK','Nema dovoljno zaliha sa važećim rokom za sve dostave ovog paketa.',409,{productId});
  }
  return statements;
}
export async function consumeInventory(deliveryId:string, quantities:{id:string;quantity:number}[]):Promise<Statement[]> {
  const rows=await all<Row>(`SELECT di.id,di.product_id,COALESCE(sp.order_id,dor.source_order_id,(SELECT order_id FROM order_items WHERE id=di.order_item_id)) AS order_id FROM delivery_items di JOIN delivery_orders dor ON dor.id=di.delivery_order_id LEFT JOIN package_lines pl ON pl.id=di.package_line_id LEFT JOIN subscription_packages sp ON sp.id=pl.package_id WHERE dor.id=?`,deliveryId);
  const grouped=new Map<string,{orderId:string;productId:string;quantity:number}>();
  for(const row of rows){if(!row.order_id)continue;const key=`${row.order_id}:${row.product_id}`,old=grouped.get(key);grouped.set(key,{orderId:String(row.order_id),productId:String(row.product_id),quantity:(old?.quantity??0)+(quantities.find(q=>q.id===row.id)?.quantity??0)});}
  const result:Statement[]=[];
  for(const line of grouped.values()){
    const lots=await all<Row>('SELECT r.*,l.expires_on FROM inventory_reservations r JOIN inventory_lots l ON l.id=r.lot_id WHERE r.order_id=? AND r.product_id=? AND r.quantity>r.consumed ORDER BY l.expires_on,r.id',line.orderId,line.productId);
    if(!lots.length)continue;
    let remaining=line.quantity;
    for(const lot of lots){if(!remaining)break;assertDomain(String(lot.expires_on)>=localDateAt(),'LOT_EXPIRED','Rezervisana serija je istekla. Zamenite rezervaciju pre isporuke.',409);const take=Math.min(remaining,Number(lot.quantity)-Number(lot.consumed));const guard=mutationGuard('EXISTS(SELECT 1 FROM inventory_reservations WHERE id=? AND consumed=? AND quantity-consumed>=?)',[String(lot.id),Number(lot.consumed),take]);result.push(guard.check,{sql:'UPDATE inventory_reservations SET consumed=consumed+? WHERE id=?',bindings:[take,String(lot.id)]},{sql:'UPDATE inventory_lots SET quantity=quantity-?,reserved=reserved-?,version=version+1 WHERE id=?',bindings:[take,take,String(lot.lot_id)]},{sql:'INSERT INTO inventory_movements(id,lot_id,quantity,reason,actor_id) VALUES(?,?,?,?,?)',bindings:[crypto.randomUUID(),String(lot.lot_id),-take,`delivery:${deliveryId}`,'admin']},guard.cleanup);remaining-=take;}
    assertDomain(!remaining,'STOCK_CONFLICT','Nedovoljna rezervisana količina.',409);
  }return result;
}
export function releaseInventory(orderId:string):Statement[]{return[{sql:'UPDATE inventory_lots SET reserved=reserved-COALESCE((SELECT SUM(quantity-consumed) FROM inventory_reservations WHERE order_id=? AND lot_id=inventory_lots.id),0),version=version+1 WHERE id IN (SELECT lot_id FROM inventory_reservations WHERE order_id=?)',bindings:[orderId,orderId]},{sql:'UPDATE inventory_reservations SET quantity=consumed WHERE order_id=?',bindings:[orderId]}];}

export async function replaceInventoryReservation(input:Row){
 const orderId=requiredString(input.orderId,'orderId',100);
 const order=await first<Row>('SELECT o.*,s.next_delivery_date FROM orders o LEFT JOIN subscriptions s ON s.id=o.subscription_id WHERE o.id=?',orderId);assertDomain(order && order.fulfillment_status!=='cancelled','ORDER_NOT_FOUND','Aktivna porudžbina nije pronađena.',404);
 const items=await all<Row>(`SELECT oi.*,pl.required_deliveries,pl.cancelled_quantity,pl.imported_delivered_quantity,(SELECT COALESCE(SUM(COALESCE(di.delivered_quantity,di.quantity)),0) FROM delivery_items di JOIN delivery_orders dor ON dor.id=di.delivery_order_id WHERE di.order_item_id=oi.id AND dor.status='delivered') AS delivered FROM order_items oi LEFT JOIN package_lines pl ON pl.order_item_id=oi.id WHERE oi.order_id=?`,orderId);
 const guard=mutationGuard("EXISTS(SELECT 1 FROM orders WHERE id=? AND updated_at=?) AND (SELECT COALESCE(SUM(COALESCE(di.delivered_quantity,di.quantity)),0) FROM delivery_items di JOIN delivery_orders dor ON dor.id=di.delivery_order_id JOIN order_items oi ON oi.id=di.order_item_id WHERE oi.order_id=? AND dor.status='delivered')=?",[orderId,String(order.updated_at),orderId,items.reduce((sum,item)=>sum+Number(item.delivered),0)]);
 const {addLocalDays}=await import('./time');
 const {getBusinessSettings}=await import('./settings');const settings=await getBusinessSettings();
 const lines=items.map(item=>{const quantity=Math.max(0,Number(item.quantity)*Number(item.required_deliveries??1)-Number(item.cancelled_quantity??0)-Number(item.imported_delivered_quantity??0)-Number(item.delivered));let lastDate=String(order.next_delivery_date??order.delivery_date);let remaining=Math.ceil(quantity/Number(item.quantity));while(remaining>0){if(!settings.holidays.includes(lastDate))remaining--;if(remaining)lastDate=addLocalDays(lastDate,item.cadence==='biweekly'?14:7);}return{productId:String(item.product_id),quantity,lastDate};}).filter(line=>line.quantity>0);
 await batch([guard.check,...releaseInventory(orderId),...await reserveInventory(orderId,lines,true),audit('admin','admin-panel','inventory.reallocated','order',orderId,null,{lines}),guard.cleanup]);return {reallocated:true};
}
