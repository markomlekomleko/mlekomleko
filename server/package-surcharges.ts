import { assertDomain } from "./domain";
import { effectivePrice } from "./product-details";
import type { ProductRow } from "./products";
import { all, first, type Row } from "./sql";

export type SurchargeScope = "next_only" | "regular";

/**
 * Deliveries of the open (paid up-front) package: purchased = the package's visit count (4 weekly,
 * 2 legacy biweekly), realized = confirmed handovers of its lines. A skipped or paused slot creates no
 * handover, so it never consumes a paid delivery.
 */
export async function packageDeliverySummary(subscriptionId: string) {
  const row = await first<Row>(`SELECT sp.id AS package_id, sp.order_id, o.payment_status,
      MAX(CASE WHEN oi.purchase_type = 'subscription' THEN pl.required_deliveries ELSE 0 END) AS purchased,
      MIN(CASE WHEN oi.purchase_type = 'subscription' AND oi.cadence = 'biweekly' THEN 14 ELSE 7 END) AS interval_days,
      MAX(pl.imported_delivered_quantity / oi.quantity) AS imported_visits,
      (SELECT COUNT(DISTINCT dor.id) FROM delivery_orders dor JOIN delivery_items di ON di.delivery_order_id = dor.id JOIN package_lines x ON x.id = di.package_line_id
        WHERE x.package_id = sp.id AND dor.status = 'delivered' AND COALESCE(di.delivered_quantity, di.quantity) > 0) AS realized,
      (SELECT COUNT(DISTINCT dor.id) FROM delivery_orders dor JOIN delivery_items di ON di.delivery_order_id = dor.id JOIN package_lines x ON x.id = di.package_line_id
        WHERE x.package_id = sp.id AND dor.status = 'locked') AS packed
    FROM subscription_packages sp JOIN orders o ON o.id = sp.order_id JOIN package_lines pl ON pl.package_id = sp.id JOIN order_items oi ON oi.id = pl.order_item_id
    WHERE sp.subscription_id = ? AND sp.status = 'open' GROUP BY sp.id, sp.order_id, o.payment_status`, subscriptionId);
  if (!row) return null;
  const purchased = Number(row.purchased) || 1;
  const realized = Math.min(purchased, Number(row.realized ?? 0) + Number(row.imported_visits ?? 0));
  // A visit that is already packed (locked) can no longer take an addition.
  const open = Math.max(0, purchased - realized - Number(row.packed ?? 0));
  return { packageId: String(row.package_id), orderId: String(row.order_id), paymentStatus: String(row.payment_status), purchased, realized, remaining: Math.max(0, purchased - realized), open, intervalDays: Number(row.interval_days) === 14 ? 14 : 7 };
}

/**
 * Surcharge for adding `quantity` units: unit (subscription) price × quantity for one delivery,
 * times the remaining paid deliveries of the package for a regular addition. Integer minor units.
 */
export async function quoteSurcharge(subscriptionId: string, product: ProductRow, quantity: number, scope: SurchargeScope, currentQuantity: number) {
  const summary = await packageDeliverySummary(subscriptionId);
  const unitPriceMinor = effectivePrice(product, Boolean(product.allow_subscription));
  const deliveries = scope === "next_only" ? 1 : summary?.open ?? 0;
  const perDeliveryMinor = unitPriceMinor * quantity;
  const amountMinor = perDeliveryMinor * deliveries;
  assertDomain(Number.isSafeInteger(amountMinor), "AMOUNT_OVERFLOW", "Iznos doplate je prevelik.", 422);
  return {
    productId: product.id, productName: product.name, unitLabel: product.unit_label, scope,
    currentQuantity, addedQuantity: quantity, newQuantity: currentQuantity + quantity,
    unitPriceMinor, perDeliveryMinor, deliveries, amountMinor, currency: "RSD" as const,
    packageRemaining: summary?.open ?? 0, packagePurchased: summary?.purchased ?? 0, packageRealized: summary?.realized ?? 0,
    intervalDays: summary?.intervalDays ?? 7, packageId: summary?.packageId ?? null,
  };
}

/** Bookkeeping view for the account: every surcharge with its order and payment state. */
export async function customerSurcharges(customerId: string) {
  return all<Row>(`SELECT ps.id, ps.subscription_id, ps.scope, ps.quantity_per_delivery, ps.deliveries, ps.unit_price_minor, ps.amount_minor, ps.status, ps.created_at,
      o.id AS order_id, o.order_number, o.payment_status, o.payment_method, oi.product_name, oi.unit_label,
      (SELECT COALESCE(SUM(COALESCE(di.delivered_quantity, di.quantity)), 0) FROM delivery_items di JOIN delivery_orders dor ON dor.id = di.delivery_order_id
        WHERE dor.status = 'delivered' AND (di.package_surcharge_id = ps.id OR (ps.scope = 'next_only' AND di.order_item_id = ps.order_item_id))) AS delivered_units
    FROM package_surcharges ps JOIN orders o ON o.id = ps.order_id JOIN order_items oi ON oi.id = ps.order_item_id
    WHERE ps.customer_id = ? ORDER BY ps.created_at DESC`, customerId);
}
