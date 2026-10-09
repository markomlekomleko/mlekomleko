import { assertDomain, optionalString, requiredString } from './domain';
import { all, batch, first, type Row, type SqlValue } from './sql';
import { shippingSnapshot } from './address-snapshot';
import { getBusinessSettings } from './settings';
import { serviceCity } from './service-policy';
import { assertDeliveryEditable } from './delivery-cutoff';
import { audit } from './outbox';
import { mutationGuard } from './mutation-guard';
export async function updateProfile(customerId:string,input:Row){
 const before=await first<Row>('SELECT * FROM customers WHERE id=?',customerId);assertDomain(before,'CUSTOMER_NOT_FOUND','Kupac nije pronađen.',404);
 const saved=shippingSnapshot(before);const next={...saved};
 for(const key of ['fullName','phone','addressLine1','city','postalCode'])next[key as keyof typeof next]=requiredString(input[key]??saved[key as keyof typeof saved],key,200);
 for(const key of ['addressLine2','deliveryNote'])if(input[key]!==undefined)next[key as keyof typeof next]=optionalString(input[key],key,500);
 const city=serviceCity(await getBusinessSettings(),String(next.city),String(next.postalCode));assertDomain(city,'DELIVERY_AREA_UNAVAILABLE','Adresa nije u zoni dostave.',422);next.city=city;
 const statements: {sql:string;bindings:SqlValue[]}[]=[{sql:'UPDATE customers SET full_name=?,phone=?,address_line_1=?,address_line_2=?,city=?,postal_code=?,delivery_note=?,updated_at=? WHERE id=?',bindings:[String(next.fullName),String(next.phone),String(next.addressLine1),next.addressLine2 as string|null,city,String(next.postalCode),next.deliveryNote as string|null,new Date().toISOString(),customerId]}];
 if(input.smsNotifications!==undefined){
  if(input.smsNotifications===true)assertDomain(await first("SELECT customer_id FROM customer_credentials WHERE customer_id=? AND whatsapp_verified_at IS NOT NULL",customerId),'PHONE_NOT_VERIFIED','Najpre potvrdite broj u podešavanjima prijave.',409);
  statements.push({sql:'UPDATE customer_credentials SET sms_notifications_at=? WHERE customer_id=?',bindings:[input.smsNotifications===true?new Date().toISOString():null,customerId]});
 }
 if(input.applyToSubscriptions===true){
  const subs=await all<Row>("SELECT * FROM subscriptions WHERE customer_id=? AND status!='cancelled'",customerId);
  for(const sub of subs){await assertDeliveryEditable(String(sub.next_delivery_date));const guard=mutationGuard('EXISTS(SELECT 1 FROM subscriptions WHERE id=? AND version=?)',[String(sub.id),Number(sub.version)]);statements.push(guard.check,{sql:'UPDATE subscriptions SET shipping_json=?,version=version+1 WHERE id=?',bindings:[JSON.stringify(next),String(sub.id)]},guard.cleanup);}
 }
 statements.push(audit('customer',customerId,'profile.updated','customer',customerId,null,{...next,applyToSubscriptions:input.applyToSubscriptions===true}));await batch(statements);return {customer:next};
}
