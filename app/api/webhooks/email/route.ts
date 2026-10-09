import { Webhook } from 'svix';
import { env } from '../../../../server/runtime';
import { assertDomain, jsonResponse, withRoute } from '../../../../server/domain';
import { batch, first, type Row } from '../../../../server/sql';
export function POST(request:Request){return withRoute(async()=>{
 const secret=(env as Record<string,string|undefined>).RESEND_WEBHOOK_SECRET;assertDomain(secret,'WEBHOOK_NOT_CONFIGURED','Potpis poruka nije podešen.',503);
 const body=await request.text();assertDomain(body.length<=100000,'PAYLOAD_TOO_LARGE','Poruka je prevelika.',413);
 const id=request.headers.get('svix-id')??'';let event:{type:string;created_at:string;data:{email_id:string}}|null=null;
 try{new Webhook(secret).verify(body,{'svix-id':id,'svix-timestamp':request.headers.get('svix-timestamp')??'','svix-signature':request.headers.get('svix-signature')??''});event=JSON.parse(body);}catch{/* reject invalid signature */}
 assertDomain(event,'WEBHOOK_SIGNATURE_INVALID','Potpis poruke nije ispravan.',401);
 const value=event as {type:string;created_at:string;data:{email_id:string}};
 const allowed=new Set(['email.sent','email.delivered','email.bounced','email.complained','email.delivery_delayed','email.failed','email.suppressed']);
 if(!allowed.has(value.type))return jsonResponse({ignored:true});
 assertDomain(value.data?.email_id && Number.isFinite(Date.parse(value.created_at)),'WEBHOOK_INVALID','Događaj nije ispravan.',422);
 if(await first<Row>('SELECT id FROM message_webhook_events WHERE id=?',id))return jsonResponse({replay:true});
 const timestamp=new Date(value.created_at).toISOString();
 await batch([{sql:'INSERT INTO message_webhook_events(id,provider_reference,event_type,event_at) VALUES(?,?,?,?) ON CONFLICT(id) DO NOTHING',bindings:[id,value.data.email_id,value.type,timestamp]},{sql:"UPDATE message_deliveries SET status=?,updated_at=? WHERE provider='resend' AND provider_reference=? AND NOT EXISTS(SELECT 1 FROM message_webhook_events WHERE provider_reference=? AND event_at>?)",bindings:[value.type.slice(6),timestamp,value.data.email_id,value.data.email_id,timestamp]}]);
 return jsonResponse({accepted:true});
});}
