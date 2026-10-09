import { consumeInventory } from "./inventory";
import { assertDomain, enumValue, nonNegativeInt, requiredString } from "./domain";
import { all, batch, first, type SqlValue } from "./sql";
import { mutationGuard } from "./mutation-guard";
import { audit } from "./outbox";
import { getBusinessSettings, getNextDeliveryWindow } from "./settings";
import { addLocalDays, localDateAt } from "./time";

/** Only an explicit successful handover consumes entitlements. Locking/packing never does. */
export async function completeDeliveryOrder(input: Record<string, unknown>) {
  const id = requiredString(input.id, "id", 100);
  const status = enumValue(input.status, "status", ["delivered", "failed"] as const);
  const before = await first<Record<string, unknown>>("SELECT dor.*, d.delivery_date, d.status AS route_status FROM delivery_orders dor JOIN deliveries d ON d.id = dor.delivery_id WHERE dor.id = ?", id);
  assertDomain(before, "DELIVERY_NOT_FOUND", "Dostava nije pronađena.", 404);
  const items = await all<Record<string, unknown>>("SELECT * FROM delivery_items WHERE delivery_order_id = ?", id);
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
  const packageIds = await all<{package_id: string} & Record<string, unknown>>("SELECT DISTINCT pl.package_id FROM delivery_items di JOIN package_lines pl ON pl.id = di.package_line_id WHERE di.delivery_order_id = ?", id);
  const now = new Date().toISOString();
  const guard = mutationGuard("EXISTS (SELECT 1 FROM delivery_orders WHERE id = ? AND status = 'locked')", [id]);
  const statements: Array<{sql: string; bindings?: SqlValue[]}> = [guard.check,
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
    let date = (await getNextDeliveryWindow()).deliveryDate;
    while (date <= String(before.delivery_date) || !settings.deliveryWeekdays.includes(new Date(`${date}T12:00:00Z`).getUTCDay()) || settings.holidays.includes(date)) date = addLocalDays(date,1);
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

  for (const {package_id: packageId} of packageIds) {
    if (status !== "delivered") continue;
    // Recheck inside the transaction: racing confirmations can complete the package only once.
    statements.push({sql: "UPDATE subscription_packages SET status = 'completed', completed_at = ? WHERE id = ? AND status = 'open' AND NOT EXISTS (SELECT 1 FROM package_lines pl WHERE pl.package_id = ? AND (SELECT COALESCE(SUM(COALESCE(di.delivered_quantity, di.quantity)),0) FROM delivery_items di JOIN delivery_orders dor ON dor.id = di.delivery_order_id WHERE di.package_line_id = pl.id AND dor.status = 'delivered') + pl.cancelled_quantity + pl.imported_delivered_quantity < pl.required_deliveries * (SELECT quantity FROM order_items WHERE id = pl.order_item_id))", bindings: [now, packageId, packageId]});
    statements.push({sql: "UPDATE orders SET fulfillment_status = 'delivered', updated_at = ? WHERE id = (SELECT order_id FROM subscription_packages WHERE id = ? AND status = 'completed')", bindings: [now, packageId]});
    statements.push({sql: "UPDATE subscriptions SET status = 'cancelled', cancelled_at = ?, version = version + 1 WHERE renewal_enabled = 0 AND id = (SELECT subscription_id FROM subscription_packages WHERE id = ? AND status = 'completed')", bindings: [now, packageId]});
    statements.push({sql: "INSERT INTO outbox (id, topic, aggregate_type, aggregate_id, payload_json, idempotency_key, available_at) SELECT ?, 'fiscal.final.requested', 'order', order_id, '{}', ?, ? FROM subscription_packages WHERE id = ? AND status = 'completed' ON CONFLICT(idempotency_key) DO NOTHING", bindings: [crypto.randomUUID(), `package-final:${packageId}`, now, packageId]});
  }
  statements.push({sql: "UPDATE deliveries SET status = 'completed' WHERE id = ? AND NOT EXISTS (SELECT 1 FROM delivery_orders WHERE delivery_id = ? AND status NOT IN ('delivered','failed','cancelled'))", bindings: [String(before.delivery_id), String(before.delivery_id)]});
  statements.push(guard.cleanup);
  try { await batch(statements); }
  catch (error) {
    const current = await first<Record<string, unknown>>("SELECT status FROM delivery_orders WHERE id = ?", id);
    if (current?.status === status) return {id, status, replay: true};
    throw error;
  }
  return {id, status, orderIds: packageIds.map(row => row.package_id)};
}
