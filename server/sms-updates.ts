import { env } from './runtime';
import { batch, first, run, type Row } from './sql';
import { enqueueOnce } from './outbox';
import { assertDomain } from './domain';
import { sendSmsMessage } from './messaging';
export async function queueSmsUpdate(row:Row,payload:Row){
 const config=env as Record<string,string|undefined>;if(!['provider','mock'].includes(config.SMS_MODE??''))return;
 if(!['email.delivery_reminder.requested','email.order_confirmation.requested'].includes(String(row.topic))&&!String(row.topic).startsWith('subscription.'))return;
 const table={order:'orders',subscription:'subscriptions',delivery_order:'delivery_orders'}[String(row.aggregate_type)];if(!table)return;
 const recipient=await first<Row>(`SELECT a.customer_id,a.whatsapp_phone AS phone FROM customer_credentials a JOIN ${table} x ON x.customer_id=a.customer_id WHERE x.id=? AND a.sms_notifications_at IS NOT NULL AND a.whatsapp_verified_at IS NOT NULL`,String(row.aggregate_id));
 if(!recipient)return;
 await batch([enqueueOnce('sms.account_update',String(row.aggregate_type),String(row.aggregate_id),{customerId:recipient.customer_id,sourceTopic:row.topic,deliveryDate:payload.nextDeliveryDate??payload.deliveryDate},`sms:${row.id}`)]);
}
export async function deliverSms(row:Row,payload:Row){
 const customer=await first<Row>('SELECT whatsapp_phone AS phone,sms_notifications_at,whatsapp_verified_at FROM customer_credentials WHERE customer_id=?',String(payload.customerId));
 if(!customer?.sms_notifications_at||!customer.whatsapp_verified_at)return `suppressed:${row.id}`;
 const saved=await first<Row>('SELECT * FROM message_deliveries WHERE id=?',String(row.id));
 if(saved?.provider_reference)return String(saved.provider_reference);
 assertDomain(!saved,'SMS_RECONCILIATION_REQUIRED','Pre ponovnog SMS slanja proverite prethodni ishod.',503);
 const text=`Mleko i Mleko: ${payload.sourceTopic==='email.delivery_reminder.requested'?'podsetnik na dostavu':'vaša porudžbina ili pretplata je ažurirana'}${payload.deliveryDate?` (${payload.deliveryDate})`:''}. Detalji su na vašem nalogu.`;
 const claim=await run("INSERT INTO message_deliveries(id,outbox_id,channel,recipient,subject,provider,status) VALUES(?,?,'sms',?,?,'infobip','sending') ON CONFLICT(id) DO NOTHING",String(row.id),String(row.id),String(customer.phone),text);
 assertDomain(Number(claim.meta?.changes)===1,'SMS_RECONCILIATION_REQUIRED','Poruka se već šalje.',409);
 try{const config=env as Record<string,string|undefined>;const mock=config.APP_ENV==='local'&&config.SMS_MODE==='mock';const ref=mock?`mock-sms:${row.id}`:await sendSmsMessage(String(customer.phone),text,String(row.id));await run('UPDATE message_deliveries SET provider_reference=?,status=?,updated_at=? WHERE id=?',ref,mock?'simulated':'accepted',new Date().toISOString(),String(row.id));return ref;}catch(error){await run("UPDATE message_deliveries SET status='unknown',last_error='SMS_OUTCOME_UNKNOWN' WHERE id=?",String(row.id));throw error;}
}
