import { applyShippingSnapshot } from "./address-snapshot";
import { all, first, type Row } from "./sql";
import { assertDomain } from "./domain";
import { deliveryDeadline } from "./delivery-cutoff";

export async function orderDetail(id: string, customerId?: string) {
  let order = await first<Row>(
    `SELECT o.*, c.full_name, c.phone, c.address_line_1, c.address_line_2, c.city, c.postal_code FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = ?${customerId ? " AND o.customer_id = ?" : ""}`,
    id,
    ...(customerId ? [customerId] : []),
  );
  assertDomain(order, "ORDER_NOT_FOUND", "Porudžbina nije pronađena.", 404);
  order = applyShippingSnapshot(order);
  const { cutoffAt, locked } = await deliveryDeadline(order.delivery_date);
  const editable =
    order.kind === "one_time" &&
    order.payment_status === "pending" &&
    order.fulfillment_status === "planned" &&
    !locked && !await first("SELECT di.id FROM delivery_items di JOIN delivery_orders dor ON dor.id=di.delivery_order_id JOIN order_items oi ON oi.id=di.order_item_id WHERE oi.order_id=? AND dor.status='delivered' LIMIT 1",id);
  const items = await all<Row>(
    "SELECT id, product_id, product_name, unit_label, quantity, unit_price_minor, line_total_minor, purchase_type, cadence FROM order_items WHERE order_id = ?",
    id,
  );
  // Customer responses contain no attribution, payment provider tokens or internal cost data.
  const visibleOrder = customerId
    ? Object.fromEntries(
        [
          "id",
          "order_number",
          "kind",
          "payment_status",
          "fulfillment_status",
          "delivery_date",
          "subtotal_minor",
          "discount_minor",
          "delivery_fee_minor",
          "total_minor",
          "customer_note",
          "promo_code",
          "city",
          "postal_code",
          "updated_at",
        ].map((key) => [key, order[key]]),
      )
    : order;
  return {
    order: visibleOrder,
    items,
    editable,
    cutoffAt,
    editReason: editable
      ? ""
      : locked
        ? "Rok za izmenu i otkazivanje ove dostave je istekao."
        : "Samostalna izmena je dostupna za nenaplaćene jednokratne porudžbine koje čekaju pripremu. Za plaćenu porudžbinu javite nam se radi korekcije ili povraćaja.",
  };
}
