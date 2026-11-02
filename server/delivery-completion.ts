import { consumeInventory } from "./inventory";
import { assertDomain, enumValue, nonNegativeInt, requiredString } from "./domain";
import { all, batch, first, type SqlValue } from "./sql";
import { mutationGuard } from "./mutation-guard";
import { audit, enqueueOnce } from "./outbox";
import { fiscommSelected } from "./fiscomm";
import { getBusinessSettings, getNextDeliveryWindow, deliveryWeekdaysForCity } from "./settings";
import { addLocalDays, localDateAt } from "./time";
import { cashCollectionStatements, deliveryPaymentOrders } from "./cash-collection";

/** Only an explicit successful handover consumes entitlements. Locking/packing never does. */
export async function completeDeliveryOrder(input: Record<string, unknown>) {
  const id = requiredString(input.id, "id", 100);
  const status = enumValue(input.status, "status", ["delivered", "failed"] as const);
  assertDomain(input.cashCollected === undefined || typeof input.cashCollected === "boolean", "VALIDATION_ERROR", "Potvrda gotovine nije ispravna.", 422);
  assertDomain(!input.cashCollected || status === "delivered", "VALIDATION_ERROR", "Gotovinu potvrdite uz uspešno uručenje ili u Porudžbinama.", 422);
  const before = await first<Record<string, unknown>>("SELECT dor.*, d.delivery_date, d.status AS route_status FROM delivery_orders dor JOIN deliveries d ON d.id = dor.delivery_id WHERE dor.id = ?", id);
  assertDomain(before, "DELIVERY_NOT_FOUND", "Dostava nije pronađena.", 404);
  if (input.date !== undefined) assertDomain(input.date === before.delivery_date, "DELIVERY_DATE_MISMATCH", "Dostava ne pripada izabranom datumu.", 409);
  const items = await all<Record<string, unknown>>("SELECT di.*, oi.order_id AS fiscal_order_id FROM delivery_items di LEFT JOIN order_items oi ON oi.id=di.order_item_id WHERE di.delivery_order_id = ?", id);
  assertDomain(input.items === undefined || (Array.isArray(input.items) && input.items.length === items.length), "INVALID_QUANTITIES", "Unesite uručenu količinu za svaku stavku.", 422);
  const supplied = input.items as { id: string; deliveredQuantity: number }[] | undefined;
  if (supplied) assertDomain(new Set(supplied.map(item => item.id)).size === items.length && supplied.every(item => items.some(row => row.id === item.id)), "INVALID_QUANTITIES", "Stavke dostave se ne poklapaju.", 422);
  const quantities = items.map(item => ({ id: String(item.id), quantity: status === "failed" ? 0 : nonNegativeInt(supplied?.find(row => row.id === item.id)?.deliveredQuantity ?? item.quantity, "deliveredQuantity", Number(item.quantity)) }));
  assertDomain(status !== "delivered" || quantities.some(item => item.quantity > 0), "INVALID_QUANTITIES", "Ako ništa nije uručeno, izaberite neuspešnu dostavu.", 422);
  if (before.status === status) {
    assertDomain(!supplied || items.every(item => Number(item.delivered_quantity ?? item.quantity) === quantities.find(row => row.id === item.id)?.quantity), "DELIVERY_ALREADY_CONFIRMED", "Dostava je potvrđena sa drugom količinom.", 409);
    return { id, status, replay: true };
  }
  const partial = status === "delivered" && quantities.some(item => item.quantity < Number(items.find(row => row.id === item.id)!.quantity));
  assertDomain(!partial || items.every(item => item.package_line_id || item.order_item_id), "PARTIAL_REQUIRES_PACKAGE", "Za delimičnu jednokratnu dostavu evidentirajte zamenu ili povraćaj pre potvrde.", 409);
  assertDomain(before.status === "locked" && before.route_status === "locked", "DELIVERY_STATE_INVALID", "Najpre završite pripremu. Potvrđena dostava ne može ponovo da se menja.", 409);
  assertDomain(String(before.delivery_date) <= localDateAt(), "DELIVERY_IN_FUTURE", "Buduća dostava ne može biti označena kao izvršena.", 409);
  const paymentOrders = status === "delivered" ? await deliveryPaymentOrders(id) : [];
  const outstanding = paymentOrders.filter(order => order.payment_status !== "paid" && order.is_package && items.some(item => item.fiscal_order_id === order.id && quantities.find(q => q.id === item.id)!.quantity > 0));
  assertDomain(outstanding.every(order => order.payment_method === "cash" && order.payment_status === "pending" && input.cashCollected === true), "PACKAGE_CASH_REQUIRED", "Pre prve isporuke potvrdite da je primljena gotovina za ceo paket.", 409);
  const collected = input.cashCollected === true ? paymentOrders.filter(order => order.payment_method === "cash" && order.payment_status === "pending") : [];
  const packageIds = await all<{package_id: string} & Record<string, unknown>>("SELECT DISTINCT pl.package_id FROM delivery_items di JOIN package_lines pl ON pl.id = di.package_line_id WHERE di.delivery_order_id = ?", id);
  const fiscalOrders = (status === "delivered" ? await all<Record<string, unknown>>(`SELECT DISTINCT oi.order_id FROM delivery_items di
    JOIN order_items oi ON oi.id=di.order_item_id WHERE di.delivery_order_id=? ${fiscommSelected() ? "" : "AND EXISTS(SELECT 1 FROM subscription_packages sp WHERE sp.order_id=oi.order_id)"}`, id) : []).filter(order => items.some(item => item.fiscal_order_id === order.order_id && quantities.find(row => row.id === item.id)!.quantity > 0));
  const now = new Date().toISOString();
  const guard = mutationGuard("EXISTS (SELECT 1 FROM delivery_orders WHERE id = ? AND status = 'locked')", [id]);
  const statements: Array<{sql: string; bindings?: SqlValue[]}> = [guard.check,
    ...collected.flatMap(cashCollectionStatements),
    {sql: "UPDATE delivery_orders SET status = ? WHERE id = ?", bindings: [status, id]},
    audit("admin", "admin-panel", `delivery.${status}`, "delivery_order", id, before, {status}),
  ];
  if (status === "delivered") statements.push(...await consumeInventory(id, quantities));
  for (const item of quantities) statements.push({ sql: "UPDATE delivery_items SET delivered_quantity = ? WHERE id = ?", bindings: [item.quantity, item.id] });
  if (before.source_order_id && status === "delivered" && !partial) {
    statements.push({sql: "UPDATE orders SET fulfillment_status = 'delivered', updated_at = ? WHERE id = ? AND NOT EXISTS (SELECT 1 FROM subscription_packages WHERE order_id = ?)", bindings: [now, String(before.source_order_id), String(before.source_order_id)]});
  }
  if ((partial || status === "failed") && before.source_order_id && items.every(item => !item.package_line_id)) {
    const settings = await getBusinessSettings();
    const snapshot = JSON.parse(String(before.customer_snapshot_json ?? "{}"));
    const city = String(snapshot.city ?? "");
    const routeDays = deliveryWeekdaysForCity(settings,city);
    let date = routeDays.length ? (await getNextDeliveryWindow(new Date(),city)).deliveryDate : addLocalDays(String(before.delivery_date),7);
    const allowedDays = routeDays.length ? routeDays : [new Date(`${before.delivery_date}T12:00:00Z`).getUTCDay()];
    while (date <= String(before.delivery_date) || !allowedDays.includes(new Date(`${date}T12:00:00Z`).getUTCDay()) || settings.holidays.includes(date)) date = addLocalDays(date,1);
    statements.push({sql:"UPDATE orders SET fulfillment_status='planned',delivery_date=?,updated_at=? WHERE id=?",bindings:[date,now,String(before.source_order_id)]});
  }
  for (const item of items.filter(item=>item.source_type === "next_only" && item.order_item_id)) {
    const handed = quantities.find(row=>row.id===item.id)!.quantity;
    const remaining = Number(item.quantity) - handed;
    if (remaining > 0) {
      statements.push({sql:"UPDATE next_delivery_addons SET consumed_at=NULL,quantity=?,delivery_date=(SELECT next_delivery_date FROM subscriptions WHERE id=next_delivery_addons.subscription_id) WHERE order_id=(SELECT order_id FROM order_items WHERE id=?)",bindings:[remaining,String(item.order_item_id)]});
      statements.push({sql:"UPDATE orders SET fulfillment_status='planned',delivery_date=(SELECT next_delivery_date FROM subscriptions WHERE id=orders.subscription_id),updated_at=? WHERE id=(SELECT order_id FROM order_items WHERE id=?)",bindings:[now,String(item.order_item_id)]});
    }
  }

  for (const order of fiscalOrders) {
    const ordinaryCashOrder = !partial && before.source_order_id === order.order_id && collected.some(row => row.id === order.order_id && !row.is_package) ? String(order.order_id) : null;
    // SQL computes each range in the same atomic transaction as the handover.
    // The unique offset also protects concurrent confirmations of the same item.
    for (const item of items.filter(item => item.order_item_id)) {
      const quantity = quantities.find(row => row.id === item.id)!.quantity;
      if (!quantity) continue;
      statements.push({sql:`INSERT INTO fiscal_delivery_allocations(delivery_order_id,order_item_id,quantity,unit_offset,prepaid)
        SELECT ?, oi.id, ?, COALESCE((SELECT SUM(a.quantity) FROM fiscal_delivery_allocations a WHERE a.order_item_id=oi.id),0) + COALESCE((SELECT pl.imported_delivered_quantity FROM package_lines pl WHERE pl.order_item_id=oi.id),0), CASE WHEN o.id=? THEN 0 WHEN o.payment_status='paid' THEN 1 ELSE 0 END
        FROM order_items oi JOIN orders o ON o.id=oi.order_id WHERE oi.id=? AND oi.order_id=?`, bindings:[id,quantity,ordinaryCashOrder,String(item.order_item_id),String(order.order_id)]});
    }
    if (items.some(item => quantities.find(row => row.id === item.id)!.quantity > 0 && item.order_item_id))
      statements.push(enqueueOnce("fiscal.delivery.requested", "order", String(order.order_id), {deliveryOrderId:id}, `delivery-fiscal:${order.order_id}:${id}`));
  }

  for (const {package_id: packageId} of packageIds) {
    if (status !== "delivered") continue;
    // Recheck inside the transaction: racing confirmations can complete the package only once.
    statements.push({sql: "UPDATE subscription_packages SET status = 'completed', completed_at = ? WHERE id = ? AND status = 'open' AND NOT EXISTS (SELECT 1 FROM package_lines pl WHERE pl.package_id = ? AND (SELECT COALESCE(SUM(COALESCE(di.delivered_quantity, di.quantity)),0) FROM delivery_items di JOIN delivery_orders dor ON dor.id = di.delivery_order_id WHERE di.package_line_id = pl.id AND dor.status = 'delivered') + pl.cancelled_quantity + pl.imported_delivered_quantity < pl.required_deliveries * (SELECT quantity FROM order_items WHERE id = pl.order_item_id))", bindings: [now, packageId, packageId]});
    statements.push({sql: "UPDATE orders SET fulfillment_status = 'delivered', updated_at = ? WHERE id = (SELECT order_id FROM subscription_packages WHERE id = ? AND status = 'completed')", bindings: [now, packageId]});
    statements.push({sql: "UPDATE subscriptions SET status = 'cancelled', cancelled_at = ?, version = version + 1 WHERE renewal_enabled = 0 AND id = (SELECT subscription_id FROM subscription_packages WHERE id = ? AND status = 'completed')", bindings: [now, packageId]});
  }
  statements.push({sql: "UPDATE deliveries SET status = 'completed' WHERE id = ? AND NOT EXISTS (SELECT 1 FROM delivery_orders WHERE delivery_id = ? AND status NOT IN ('delivered','failed','cancelled'))", bindings: [String(before.delivery_id), String(before.delivery_id)]});
  statements.push(guard.cleanup);
  try { await batch(statements); }
  catch (error) {
    const current = await first<Record<string, unknown>>("SELECT status FROM delivery_orders WHERE id = ?", id);
    if (current?.status === status) return {id, status, replay: true};
    if (collected.length) assertDomain(!(await deliveryPaymentOrders(id)).some(order => collected.some(row=>row.id===order.id) && order.payment_status !== "pending"), "CASH_PAYMENT_CHANGED", "Naplata se u međuvremenu promenila. Osvežite spisak pa potvrdite uručenje.", 409);
    throw error;
  }
  return {id, status, orderIds: [...new Set([...fiscalOrders.map(row => String(row.order_id)), ...collected.map(row => String(row.id))])], cashCollectedMinor: collected.reduce((sum,row) => sum + Number(row.total_minor), 0)};
}
