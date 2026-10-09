import { assertDomain, requiredString } from './domain';
import { all, batch, first, run, type Row } from './sql';
import { localPaymentGateway } from './integrations';
import { mutationGuard } from './mutation-guard';
import { audit, enqueueOnce } from './outbox';
import { activatePaidPackage } from './packages';
import { env } from './runtime';
export async function queuePaymentRetry(orderId:string){
 const order=await first<Row>('SELECT * FROM orders WHERE id=?',orderId);assertDomain(order && order.payment_method==='card' && ['failed','pending'].includes(String(order.payment_status)) && order.fulfillment_status!=='cancelled','PAYMENT_NOT_RETRYABLE','Ova porudžbina ne može ponovo da se naplati.',409);
 const old=await first<Row>("SELECT * FROM payment_attempts WHERE order_id=? AND status IN ('pending','processing','unknown')",orderId);if(old)return old;
 const id=crypto.randomUUID(),guard=mutationGuard("NOT EXISTS(SELECT 1 FROM payment_attempts WHERE order_id=? AND status IN ('pending','processing','unknown'))",[orderId]);
 await batch([guard.check,{sql:"INSERT INTO payment_attempts(id,order_id,operation,status,amount_minor,provider,idempotency_key,next_attempt_at) VALUES(?,?,'charge','pending',?,'configured',?,?)",bindings:[id,orderId,Number(order.total_minor),`retry:${id}`,new Date().toISOString()]},audit('admin','admin-panel','payment.retry_queued','order',orderId,null,{attemptId:id}),guard.cleanup]);return first<Row>('SELECT * FROM payment_attempts WHERE id=?',id);
}
export async function processPaymentRetries(){
 const config=env as Record<string,string|undefined>;
 if(config.APP_ENV!=='local'||config.PAYMENT_MODE!=='mock')return {processed:0,waitingForProvider:true};
 const rows=await all<Row>("SELECT a.*,o.payment_status,o.fulfillment_status,s.payment_provider_ref AS token FROM payment_attempts a JOIN orders o ON o.id=a.order_id LEFT JOIN subscriptions s ON s.id=o.subscription_id WHERE a.status='pending' AND a.next_attempt_at<=? ORDER BY a.created_at LIMIT 25",new Date().toISOString());
 const results=[];
 for(const row of rows){
  if(row.payment_status==='paid'||row.fulfillment_status==='cancelled'){await run("UPDATE payment_attempts SET status='failed',last_error='order_not_payable' WHERE id=?",String(row.id));continue;}
  const claimed=await run("UPDATE payment_attempts SET status='processing',attempts=attempts+1 WHERE id=? AND status='pending'",String(row.id));if(!Number(claimed.meta?.changes))continue;
  try{
   const activation=await activatePaidPackage(String(row.order_id));
   const payment=await localPaymentGateway.authorize({idempotencyKey:String(row.idempotency_key),orderId:String(row.order_id),amountMinor:Number(row.amount_minor),currency:'RSD',method:'card',paymentToken:row.token?String(row.token):undefined});
   if(payment.status==='paid'){
    const guard=mutationGuard("EXISTS(SELECT 1 FROM orders WHERE id=? AND payment_status IN ('pending','failed') AND fulfillment_status!='cancelled')",[String(row.order_id)]);
    await batch([guard.check,...(activation?.statements??[]),{sql:"UPDATE orders SET payment_status='paid',payment_provider_ref=?,updated_at=? WHERE id=?",bindings:[payment.providerReference,new Date().toISOString(),String(row.order_id)]},{sql:"UPDATE payment_attempts SET status='paid',provider_reference=?,updated_at=? WHERE id=?",bindings:[payment.providerReference,new Date().toISOString(),String(row.id)]},enqueueOnce('fiscal.receipt.requested','order',String(row.order_id),{},`retry-fiscal:${row.order_id}`),enqueueOnce('payment.captured','order',String(row.order_id),{},`retry-paid:${row.order_id}`),guard.cleanup]);
   }else{
    const terminal=Number(row.attempts)>=2;
    await run('UPDATE payment_attempts SET status=?,next_attempt_at=?,last_error=? WHERE id=?',terminal?'failed':'pending',new Date(Date.now()+86400000*(Number(row.attempts)+1)).toISOString(),'payment_declined',String(row.id));
   }
   results.push({id:row.id,status:payment.status});
  }catch(error){await run("UPDATE payment_attempts SET status='unknown',last_error=?,updated_at=? WHERE id=?",error instanceof Error?error.message.slice(0,200):'payment_unknown',new Date().toISOString(),String(row.id));results.push({id:row.id,status:'unknown'});}
 }
 return {processed:results.length,results};
}
export async function listPaymentAttempts(){return all<Row>('SELECT a.*,o.order_number FROM payment_attempts a JOIN orders o ON o.id=a.order_id ORDER BY a.created_at DESC LIMIT 100');}
export async function paymentAction(input:Row){return input.action==='process'?processPaymentRetries():queuePaymentRetry(requiredString(input.orderId,'orderId',100));}
