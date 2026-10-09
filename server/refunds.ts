import { assertDomain, enumValue, positiveInt, requiredString } from './domain';
import { all, batch, first, type Row, type SqlValue } from './sql';
import { mutationGuard } from './mutation-guard';
import { audit } from './outbox';
import { env } from './runtime';
import { releaseInventory } from './inventory';
export async function refundPreview(orderId:string,customerId?:string){
 const order=await first<Row>('SELECT * FROM orders WHERE id=?',orderId);
 assertDomain(order && (!customerId || order.customer_id===customerId),'ORDER_NOT_FOUND','Porudžbina nije pronađena.',404);
 assertDomain(order.payment_status==='paid','REFUND_PAYMENT_REQUIRED','Povraćaj je dostupan samo za naplaćenu porudžbinu.',409);
 const lines=await all<Row>(`SELECT oi.*,pl.id AS line_id,pl.required_deliveries,pl.cancelled_quantity,pl.imported_delivered_quantity,(SELECT COALESCE(SUM(CASE WHEN dor.status='delivered' THEN COALESCE(di.delivered_quantity,di.quantity) ELSE di.quantity END),0) FROM delivery_items di JOIN delivery_orders dor ON dor.id=di.delivery_order_id WHERE (di.package_line_id=pl.id OR di.order_item_id=oi.id) AND dor.status IN ('locked','delivered')) AS consumed FROM order_items oi LEFT JOIN package_lines pl ON pl.order_item_id=oi.id WHERE oi.order_id=? ORDER BY oi.id`,orderId);
 const available=lines.map(line=>{const total=Number(line.quantity)*Number(line.required_deliveries??1);const remaining=line.line_id?Math.max(0,total-Number(line.consumed)-Number(line.cancelled_quantity)-Number(line.imported_delivered_quantity)):order.fulfillment_status==='planned'?Math.max(0,total-Number(line.consumed)):0;return {lineId:line.line_id??line.id,productName:line.product_name,total,remaining,lineTotal:Number(line.line_total_minor),packageLine:Boolean(line.line_id)};});
 // Floor each refundable share. Never refund delivery fees or more than the paid net product amount.
 const productNet=Math.max(0,Number(order.total_minor)-Number(order.delivery_fee_minor));
 const amountMinor=available.reduce((sum,line)=>sum+Number(BigInt(productNet)*BigInt(line.lineTotal)*BigInt(line.remaining)/(BigInt(Math.max(1,Number(order.subtotal_minor)))*BigInt(line.total))),0);
 return {order,lines:available,amountMinor};
}
export async function requestRefund(input:Row,customerId?:string){
 const orderId=requiredString(input.orderId,'orderId',100),key=requiredString(input.idempotencyKey,'idempotencyKey',200);
 const existing=await first<Row>('SELECT * FROM refund_requests WHERE idempotency_key=?',key);
 if(existing){assertDomain(existing.order_id===orderId && (!customerId || existing.customer_id===customerId),'IDEMPOTENCY_CONFLICT','Ključ je već upotrebljen.',409);return existing;}
 const preview=await refundPreview(orderId,customerId);assertDomain(preview.amountMinor>0,'NOTHING_TO_REFUND','Nema neisporučene i nezaključane količine za povraćaj.',409);
 const reason=requiredString(input.reason,'reason',500),id=crypto.randomUUID();
 const guard=mutationGuard("NOT EXISTS(SELECT 1 FROM refund_requests WHERE order_id=? AND status IN ('requested','approved','processing','unknown')) AND NOT EXISTS(SELECT 1 FROM delivery_items di JOIN delivery_orders dor ON dor.id=di.delivery_order_id JOIN package_lines pl ON pl.id=di.package_line_id JOIN subscription_packages sp ON sp.id=pl.package_id WHERE sp.order_id=? AND dor.status='locked')",[orderId,orderId]);
 await batch([guard.check,{sql:"INSERT INTO refund_requests(id,order_id,customer_id,status,amount_minor,items_json,reason,idempotency_key) VALUES(?,?,?,'requested',?,?,?,?)",bindings:[id,orderId,String(preview.order.customer_id),preview.amountMinor,JSON.stringify(preview.lines),reason,key]},audit(customerId?'customer':'admin',customerId??'admin-panel','refund.requested','refund',id,null,{orderId,amountMinor:preview.amountMinor,reason}),guard.cleanup]);return first<Row>('SELECT * FROM refund_requests WHERE id=?',id);
}
export async function reviewRefund(input:Row){
 const id=requiredString(input.id,'id',100),action=enumValue(input.action,'action',['approve','reject','execute'] as const),version=positiveInt(input.expectedVersion,'expectedVersion');
 const before=await first<Row>('SELECT * FROM refund_requests WHERE id=?',id);assertDomain(before,'REFUND_NOT_FOUND','Zahtev nije pronađen.',404);
 assertDomain(Number(before.version)===version,'REFUND_VERSION_CONFLICT','Zahtev je promenjen. Osvežite prikaz.',409);
 const status=action==='approve'?'approved':action==='reject'?'rejected':'completed';
 assertDomain(action==='execute'?before.status==='approved':['requested','approved'].includes(String(before.status)),'REFUND_STATE_INVALID','Ovaj zahtev više ne može da se menja.',409);
 const guard=mutationGuard('EXISTS(SELECT 1 FROM refund_requests WHERE id=? AND version=? AND status=?)',[id,version,String(before.status)]);
 const statements: {sql:string;bindings?:SqlValue[]}[]=[guard.check];
 let paymentReference:string|null=null,fiscalReference:string|null=null;
 if(action==='execute'){
   assertDomain(env.APP_ENV==='local' && (env as Record<string,string|undefined>).PAYMENT_MODE==='mock','REFUND_PROVIDER_NOT_CONNECTED','Povraćaj je odobren. Izvršenje čeka povezivanje banke i fiskalne korekcije.',503);
   paymentReference=`MOCK-REFUND-${id}`;fiscalReference=`MOCK-FISCAL-REFUND-${id}`;
   const preview=await refundPreview(String(before.order_id));assertDomain(preview.amountMinor===Number(before.amount_minor),'REFUND_CHANGED','Isporuke su promenjene. Ponovo proverite zahtev.',409);
   for(const line of preview.lines)if(line.packageLine&&line.remaining)statements.push({sql:'UPDATE package_lines SET cancelled_quantity=cancelled_quantity+? WHERE id=?',bindings:[line.remaining,String(line.lineId)]});
   statements.push(...releaseInventory(String(before.order_id)),{sql:"UPDATE orders SET fulfillment_status='cancelled', payment_status=CASE WHEN total_minor=? THEN 'refunded' ELSE payment_status END,updated_at=? WHERE id=?",bindings:[Number(before.amount_minor),new Date().toISOString(),String(before.order_id)]},{sql:"UPDATE subscription_packages SET status='completed',completed_at=? WHERE order_id=?",bindings:[new Date().toISOString(),String(before.order_id)]},{sql:"UPDATE subscriptions SET renewal_enabled=0,status='cancelled',version=version+1 WHERE id=(SELECT subscription_id FROM orders WHERE id=?)",bindings:[String(before.order_id)]});
 }
 statements.push({sql:'UPDATE refund_requests SET status=?,payment_reference=?,fiscal_reference=?,version=version+1,updated_at=? WHERE id=?',bindings:[status,paymentReference,fiscalReference,new Date().toISOString(),id]},audit('admin','admin-panel',`refund.${action}`,'refund',id,{status:before.status},{status,paymentReference,fiscalReference}),guard.cleanup);
 await batch(statements);return first<Row>('SELECT * FROM refund_requests WHERE id=?',id);
}
export async function listRefunds(){return all<Row>('SELECT r.*,o.order_number,c.full_name FROM refund_requests r JOIN orders o ON o.id=r.order_id JOIN customers c ON c.id=r.customer_id ORDER BY r.created_at DESC LIMIT 200');}
