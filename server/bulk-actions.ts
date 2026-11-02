import { assertDomain, DomainError, requiredString } from "./domain";
import { first, run, type Row } from "./sql";
import { stableJsonHash } from "./crypto";
import { updateOrder } from "./admin";
import { completeDeliveryOrder } from "./delivery-completion";
import { processOutboxFor } from "./integration-jobs";
import { assertLocalDate } from "./time";

type BulkResult = {id: string; success: boolean; replay?: boolean; code?: string; message?: string};

async function executeBulk(namespace: string, input: Row, key: string | null, items: Row[], action: (item: Row) => Promise<{replay?: boolean}>) {
  const idempotencyKey = requiredString(key, "Idempotency-Key", 200);
  assertDomain(idempotencyKey.length >= 8, "IDEMPOTENCY_KEY_REQUIRED", "Potreban je ključ grupne potvrde.", 422);
  assertDomain(input.confirmed === true, "CONFIRMATION_REQUIRED", "Potvrdite izabrane stavke pre čuvanja.", 422);
  assertDomain(items.length > 0 && items.length <= 100, "INVALID_SELECTION", "Izaberite od 1 do 100 stavki.", 422);
  const ids = items.map(item => requiredString(item.id, "id", 100));
  assertDomain(new Set(ids).size === ids.length, "INVALID_SELECTION", "Ista stavka ne može biti izabrana dva puta.", 422);
  const hash = await stableJsonHash(input);
  const lease = JSON.stringify({token:crypto.randomUUID(),leaseUntil:new Date(Date.now()+5*60_000).toISOString()});
  const claim = await run("INSERT INTO idempotency_keys(id,namespace,key,request_hash,response_json,status_code,expires_at) VALUES(?,?,?,?,?,200,?) ON CONFLICT(namespace,key) DO NOTHING", crypto.randomUUID(),namespace,idempotencyKey,hash,lease,new Date(Date.now()+30*86400000).toISOString());
  const saved = await first<Row>("SELECT request_hash,response_json FROM idempotency_keys WHERE namespace=? AND key=?", namespace,idempotencyKey);
  assertDomain(saved?.request_hash === hash, "IDEMPOTENCY_CONFLICT", "Ovaj ključ je već korišćen za drugi izbor.", 409);
  const cached = JSON.parse(String(saved.response_json));
  if (cached.completed) return cached;
  if (Number(claim.meta?.changes ?? 0) !== 1) {
    assertDomain(Date.parse(cached.leaseUntil ?? "1970-01-01") <= Date.now(), "BULK_IN_PROGRESS", "Ova grupna potvrda se još obrađuje. Sačekajte i proverite spisak pre ponavljanja.", 409);
    const resumed = await run("UPDATE idempotency_keys SET response_json=? WHERE namespace=? AND key=? AND request_hash=? AND response_json=?",lease,namespace,idempotencyKey,hash,String(saved.response_json));
    assertDomain(Number(resumed.meta?.changes ?? 0) === 1, "BULK_IN_PROGRESS", "Grupna potvrda je već nastavljena u drugom zahtevu.", 409);
  }
  const results: BulkResult[] = [];
  for (const item of items) {
    try { results.push({id:String(item.id),success:true,...await action(item)}); }
    catch (error) {
      results.push({id:String(item.id),success:false,code:error instanceof DomainError ? error.code : "INTERNAL_ERROR",message:error instanceof DomainError ? error.message : "Stavka nije sačuvana. Osvežite prikaz i pokušajte ponovo."});
    }
  }
  const response = {completed:true,results,succeeded:results.filter(r=>r.success).length,failed:results.filter(r=>!r.success).length};
  const savedResult=await run("UPDATE idempotency_keys SET response_json=? WHERE namespace=? AND key=? AND request_hash=? AND response_json=?", JSON.stringify(response),namespace,idempotencyKey,hash,lease);
  assertDomain(Number(savedResult.meta?.changes ?? 0) === 1,"BULK_IN_PROGRESS","Obrada je nastavljena drugim zahtevom. Osvežite spisak i proverite rezultate.",409);
  return response;
}

export async function bulkCashPayment(input: Row, key: string | null) {
  assertDomain(Array.isArray(input.orders) && input.orders.every(item=>item && typeof item === "object" && !Array.isArray(item)), "INVALID_SELECTION", "Izaberite porudžbine za naplatu.", 422);
  const orders = input.orders as Row[];
  for (const order of orders) requiredString(order.expectedUpdatedAt, "expectedUpdatedAt", 80);
  return executeBulk("bulk-cash-payment", input, key, orders, async item => {
    const order = await first<Row>("SELECT * FROM orders WHERE id=?", String(item.id));
    assertDomain(order, "ORDER_NOT_FOUND", "Porudžbina nije pronađena.", 404);
    assertDomain(order.payment_method === "cash" && order.fulfillment_status !== "cancelled", "CASH_PAYMENT_REQUIRED", "Možete potvrditi samo gotovinsku porudžbinu koja nije otkazana.", 409);
    if (order.payment_status === "paid") return {replay:true};
    assertDomain(order.payment_status === "pending", "CASH_PAYMENT_REQUIRED", "Porudžbina nije na čekanju za gotovinu.", 409);
    await updateOrder({id:item.id,paymentStatus:"paid",expectedUpdatedAt:item.expectedUpdatedAt});
    await processOutboxFor("order",String(item.id));
    return {};
  });
}

export async function bulkCompleteDelivery(input: Row, key: string | null) {
  const date = assertLocalDate(input.date);
  assertDomain(Array.isArray(input.deliveryOrderIds), "INVALID_SELECTION", "Izaberite dostave za potvrdu.", 422);
  const items = input.deliveryOrderIds.map(id=>({id}));
  return executeBulk("bulk-delivery-complete", input, key, items, async item => {
    const row = await first<Row>("SELECT d.delivery_date FROM delivery_orders dor JOIN deliveries d ON d.id=dor.delivery_id WHERE dor.id=?", String(item.id));
    assertDomain(row?.delivery_date === date, "DELIVERY_DATE_MISMATCH", "Dostava ne pripada izabranom datumu.", 409);
    const result = await completeDeliveryOrder({id:item.id,date,status:"delivered",cashCollected:input.cashCollected === true});
    for (const id of result.orderIds ?? []) await processOutboxFor("order",id);
    return {replay: result.replay};
  });
}
