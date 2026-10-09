import { assertDomain, nonNegativeInt, requiredString } from './domain';
import { all, batch, first, type Row, type SqlValue } from './sql';
import { audit } from './outbox';
import { assertLocalDate } from './time';
import { assertDeliveryEditable } from './delivery-cutoff';
import { createPackageStatements } from './packages';
import { mutationGuard } from './mutation-guard';
export async function legacyOrders(){return all<Row>("SELECT o.id,o.order_number,o.subscription_id,o.total_minor,c.full_name FROM orders o JOIN customers c ON c.id=o.customer_id WHERE o.kind='subscription_invoice' AND o.payment_status='paid' AND NOT EXISTS(SELECT 1 FROM subscription_packages sp WHERE sp.order_id=o.id) ORDER BY o.created_at DESC LIMIT 100");}
export async function legacyPreview(orderId:string){const order=await first<Row>("SELECT * FROM orders WHERE id=? AND kind='subscription_invoice'",orderId);assertDomain(order,'ORDER_NOT_FOUND','Stara pretplata nije pronađena.',404);return {order,lines:await all<Row>('SELECT id,product_name,quantity,cadence,line_total_minor FROM order_items WHERE order_id=?',orderId)};}
export async function reconcileLegacy(input:Row){
 const id=requiredString(input.orderId,'orderId',100),date=assertLocalDate(input.nextDeliveryDate);await assertDeliveryEditable(date);
 const {order,lines}=await legacyPreview(id);assertDomain(order.payment_status==='paid' && order.subscription_id,'LEGACY_NOT_PAID','Najpre usaglasite uplatu.',409);
 assertDomain(input.confirmed===true && Array.isArray(input.lines) && input.lines.length===lines.length,'RECONCILIATION_REQUIRED','Potvrdite dokument i količinu za svaku stavku.',422);
 const invoice=requiredString(input.advanceInvoiceNumber,'advanceInvoiceNumber',100),time=requiredString(input.advanceTime,'advanceTime',40);assertDomain(Number.isFinite(Date.parse(time)),'VALIDATION_ERROR','Datum avansa nije ispravan.',422);
 assertDomain(!await first("SELECT id FROM fiscal_receipts WHERE order_id=? AND status='issued' AND kind IN ('normal','final')",id),'LEGACY_ALREADY_FINAL','Postoji konačni račun. Potrebna je finansijska korekcija pre migracije.',409);
 const guard=mutationGuard("NOT EXISTS(SELECT 1 FROM subscription_packages WHERE subscription_id=?) AND NOT EXISTS(SELECT 1 FROM delivery_orders WHERE subscription_id=? AND status='locked')",[String(order.subscription_id),String(order.subscription_id)]);
 const statements:{sql:string;bindings?:SqlValue[]}[]=[guard.check,...createPackageStatements(id,String(order.subscription_id),date)];
 const seen=new Set<string>();
 for(const line of input.lines as Row[]){const saved=lines.find(row=>row.id===line.id);assertDomain(saved && !seen.has(String(line.id)),'INVALID_LINES','Stavke se ne poklapaju.',422);seen.add(String(line.id));const delivered=nonNegativeInt(line.deliveredQuantity,'deliveredQuantity',Number(saved.quantity)*(saved.cadence==='weekly'?4:2));statements.push({sql:'UPDATE package_lines SET imported_delivered_quantity=? WHERE order_item_id=?',bindings:[delivered,String(line.id)]});}
 const key=`receipt:${id}:advance`;
 statements.push({sql:"INSERT INTO fiscal_receipts(id,order_id,operation_key,kind,status,provider,invoice_number,provider_reference,pfr_time,issued_at) VALUES(?,?,?,'advance','issued','fiscomm',?,?,?,?) ON CONFLICT(operation_key) DO NOTHING",bindings:[key,id,key,invoice,invoice,time,time]}, {sql:"UPDATE subscriptions SET next_delivery_date=?,status='active',version=version+1 WHERE id=?",bindings:[date,String(order.subscription_id)]},{sql:'INSERT INTO legacy_reconciliations(id,order_id,subscription_id,details_json,actor_id) VALUES(?,?,?,?,?)',bindings:[crypto.randomUUID(),id,String(order.subscription_id),JSON.stringify({lines:input.lines,invoice,time}),'admin-panel']},audit('admin','admin-panel','legacy.reconciled','order',id,null,{lines:input.lines,invoice,time,date}),guard.cleanup);
 await batch(statements);return {reconciled:true,orderId:id};
}
