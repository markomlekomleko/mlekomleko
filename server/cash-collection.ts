import { assertDomain } from "./domain";
import { all, type Row, type SqlValue } from "./sql";
import { mutationGuard } from "./mutation-guard";
import { audit, enqueueOnce } from "./outbox";
import { purchaseAnalyticsEvent } from "./analytics";
import { actorContext } from "./staff";

/** The first cash visit may be packed, but another route must wait for its outcome. */
export function packagePaymentEligibleSql(dateSql: string) {
  return `(o.payment_status = 'paid' OR (o.payment_method = 'cash' AND o.payment_status = 'pending'
    AND o.fulfillment_status != 'cancelled'
    AND NOT EXISTS (SELECT 1 FROM package_lines cp JOIN subscription_packages csp ON csp.id=cp.package_id
      WHERE csp.order_id=o.id AND (cp.imported_delivered_quantity > 0 OR EXISTS
        (SELECT 1 FROM delivery_items ci JOIN delivery_orders cr ON cr.id=ci.delivery_order_id
         WHERE ci.package_line_id=cp.id AND cr.status='delivered' AND COALESCE(ci.delivered_quantity,ci.quantity)>0)))
    AND NOT EXISTS (SELECT 1 FROM delivery_items ci JOIN delivery_orders cr ON cr.id=ci.delivery_order_id
      JOIN deliveries cd ON cd.id=cr.delivery_id JOIN package_lines cp ON cp.id=ci.package_line_id
      JOIN subscription_packages csp ON csp.id=cp.package_id
      WHERE csp.order_id=o.id AND cr.status='locked' AND cd.delivery_date != ${dateSql})))`;
}

export async function deliveryPaymentOrders(deliveryOrderId: string, previewItems: string[] = [], sourceOrderId?: string | null) {
  return all<Row>(`SELECT o.id, o.order_number, o.total_minor, o.payment_method, o.payment_status, o.updated_at,
    CASE WHEN EXISTS(SELECT 1 FROM subscription_packages sp WHERE sp.order_id=o.id) THEN 1 ELSE 0 END AS is_package
    FROM orders o WHERE o.fulfillment_status != 'cancelled' AND o.id IN (
      SELECT oi.order_id FROM delivery_items di JOIN order_items oi ON oi.id=di.order_item_id WHERE di.delivery_order_id=?
      UNION SELECT source_order_id FROM delivery_orders WHERE id=? AND source_order_id IS NOT NULL
      UNION SELECT order_id FROM order_items WHERE id IN (${previewItems.length ? previewItems.map(()=>"?").join(",") : "NULL"})
      UNION SELECT id FROM orders WHERE id=?
    ) ORDER BY o.id`, deliveryOrderId, deliveryOrderId, ...previewItems, sourceOrderId ?? null);
}

export function cashCollectionStatements(order: Row): Array<{sql: string; bindings?: SqlValue[]}> {
  const role = actorContext.getStore()?.role;
  assertDomain(!role || role === "owner" || role === "manager", "ROLE_FORBIDDEN", "Vaša uloga ne može da potvrdi naplatu gotovine.", 403);
  assertDomain(order.payment_method === "cash" && order.payment_status === "pending", "CASH_PAYMENT_REQUIRED", "Za ovu porudžbinu nema gotovine za naplatu.", 409);
  const id = String(order.id), now = new Date(Math.max(Date.now(), Date.parse(String(order.updated_at)) + 1)).toISOString();
  const guard = mutationGuard("EXISTS(SELECT 1 FROM orders WHERE id=? AND payment_method='cash' AND payment_status='pending' AND fulfillment_status!='cancelled' AND updated_at=?)", [id, String(order.updated_at)]);
  return [guard.check,
    {sql: "UPDATE orders SET payment_status='paid', updated_at=? WHERE id=?", bindings: [now,id]},
    audit("admin", "admin-panel", "cash.collected", "order", id, {paymentStatus: "pending"}, {paymentStatus: "paid", amountMinor: order.total_minor}),
    enqueueOnce("fiscal.receipt.requested", "order", id, {orderId:id,source:"cash-on-delivery"}, `cash-fiscal:${id}`),
    enqueueOnce("email.receipt.requested", "order", id, {orderId:id}, `cash-receipt:${id}`),
    purchaseAnalyticsEvent(id, String(order.order_number), "cash-on-delivery"),
    guard.cleanup,
  ];
}
