import { all, first, type SqlValue } from "./sql";
import { addLocalDays, daysBetween, localDateAt } from "./time";
import { assertDomain } from "./domain";
import { deliveryDeadline } from "./delivery-cutoff";
import { mutationGuard } from "./mutation-guard";

export function packageOccurrences(cadence: "weekly" | "biweekly") { return cadence === "weekly" ? 4 : 2; }
export function packageDates(firstDate: string, cadence: "weekly" | "biweekly", holidays: string[] = []) {
  const dates: string[] = []; let date = firstDate;
  while (dates.length < packageOccurrences(cadence)) { if (!holidays.includes(date)) dates.push(date); date = addLocalDays(date, cadence === "weekly" ? 7 : 14); }
  return dates;
}
export function maximumPauseDate(from: string) {
  const [year, month, day] = from.split("-").map(Number);
  const end = new Date(Date.UTC(year, month + 2, 1));
  const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
  end.setUTCDate(Math.min(day, lastDay));
  return end.toISOString().slice(0, 10);
}
export function createPackageStatements(orderId: string, subscriptionId: string, date: string): Array<{sql: string; bindings: SqlValue[]}> {
  return [
    { sql: "INSERT INTO subscription_packages (id, order_id, subscription_id) VALUES (?, ?, ?)", bindings: [orderId, orderId, subscriptionId] },
    { sql: "INSERT INTO package_lines (id, package_id, order_item_id, required_deliveries, anchor_date) SELECT id, ?, id, CASE WHEN purchase_type = 'one_time' THEN 1 WHEN cadence = 'weekly' THEN 4 ELSE 2 END, ? FROM order_items WHERE order_id = ?", bindings: [orderId, date, orderId] },
  ];
}
export async function openPackage(subscriptionId: string) {
  return first<Record<string, unknown>>("SELECT sp.*, o.payment_status FROM subscription_packages sp JOIN orders o ON o.id = sp.order_id WHERE sp.subscription_id = ? AND sp.status = 'open'", subscriptionId);
}
/** A late first payment moves the entire unused entitlement to an editable slot. */
export async function activatePaidPackage(orderId: string) {
  const row = await first<Record<string, unknown>>(`SELECT sp.id, sp.status AS package_status, s.id AS subscription_id, s.status, s.version, s.next_delivery_date, s.pause_until,
    o.fulfillment_status, MIN(pl.anchor_date) AS anchor_date, MIN(CASE WHEN oi.cadence = 'weekly' THEN 7 ELSE 14 END) AS interval_days
    FROM subscription_packages sp JOIN subscriptions s ON s.id = sp.subscription_id JOIN orders o ON o.id = sp.order_id
    JOIN package_lines pl ON pl.package_id = sp.id JOIN order_items oi ON oi.id = pl.order_item_id
    WHERE sp.order_id = ? GROUP BY sp.id, sp.status, s.id, s.status, s.version, s.next_delivery_date, s.pause_until, o.fulfillment_status`, orderId);
  if (!row) return null;
  assertDomain(row.package_status === "open" && row.status !== "cancelled" && row.fulfillment_status !== "cancelled", "PACKAGE_CANCELLED", "Otkazan paket ne može da se naplati. Napravite novu porudžbinu.", 409);
  const anchor = String(row.anchor_date), interval = Number(row.interval_days);
  const earliest = [anchor, String(row.next_delivery_date), localDateAt(), String(row.pause_until ?? "")].sort().at(-1)!;
  let date = addLocalDays(anchor, Math.ceil(daysBetween(anchor, earliest) / interval) * interval);
  while ((await deliveryDeadline(date)).locked) date = addLocalDays(date, interval);
  const guard = mutationGuard("EXISTS (SELECT 1 FROM subscriptions WHERE id = ? AND version = ? AND status != 'cancelled') AND EXISTS (SELECT 1 FROM subscription_packages WHERE id = ? AND status = 'open') AND NOT EXISTS (SELECT 1 FROM deliveries WHERE delivery_date = ? AND status != 'open')", [String(row.subscription_id), Number(row.version), String(row.id), date]);
  return { date, statements: [guard.check,
    {sql: "UPDATE subscriptions SET next_delivery_date = ?, version = version + 1 WHERE id = ?", bindings: [date, String(row.subscription_id)]},
    {sql: "UPDATE package_lines SET anchor_date = ? WHERE package_id = ?", bindings: [date, String(row.id)]},
    {sql: "UPDATE orders SET delivery_date = ? WHERE id = ?", bindings: [date, orderId]},
    {sql: "UPDATE deliveries SET generation_key = ? WHERE delivery_date IN (?, ?) AND status = 'open'", bindings: [`payment:${crypto.randomUUID()}`, anchor, date]},
    guard.cleanup,
  ] };
}
export async function packageProgress(subscriptionId?: string) {
  return all<Record<string, unknown>>(`SELECT sp.id, sp.order_id, sp.subscription_id, sp.status, o.order_number, o.payment_status, o.total_minor, c.full_name, s.next_delivery_date, s.pause_until, s.renewal_enabled,
    pl.id AS line_id, pl.anchor_date, oi.product_name, oi.unit_label, oi.quantity, oi.purchase_type, oi.cadence, pl.required_deliveries,
    pl.cancelled_quantity, oi.quantity * pl.required_deliveries AS required_units, (SELECT COALESCE(SUM(COALESCE(di.delivered_quantity,di.quantity)),0) FROM delivery_items di JOIN delivery_orders dor ON dor.id = di.delivery_order_id WHERE di.package_line_id = pl.id AND dor.status = 'delivered') + pl.imported_delivered_quantity AS delivered_units, (SELECT (COALESCE(SUM(COALESCE(di.delivered_quantity,di.quantity)),0) + pl.imported_delivered_quantity) * 1.0 / oi.quantity FROM delivery_items di JOIN delivery_orders dor ON dor.id = di.delivery_order_id WHERE di.package_line_id = pl.id AND dor.status = 'delivered') AS delivered
    FROM subscription_packages sp JOIN orders o ON o.id = sp.order_id JOIN customers c ON c.id = o.customer_id
    JOIN subscriptions s ON s.id = sp.subscription_id JOIN package_lines pl ON pl.package_id = sp.id JOIN order_items oi ON oi.id = pl.order_item_id
    ${subscriptionId ? "WHERE sp.subscription_id = ?" : "WHERE sp.status = 'open'"} ORDER BY sp.created_at DESC, oi.product_name`, ...(subscriptionId ? [subscriptionId] : []));
}
// Use the purchased snapshot until it is fulfilled; catalog/renewal edits cannot change it.
export async function packageSchedule(subscriptionId: string) {
  return all<{cadence: "weekly" | "biweekly"; cadence_anchor_date: string} & Record<string, unknown>>("SELECT oi.cadence, pl.anchor_date AS cadence_anchor_date FROM package_lines pl JOIN subscription_packages sp ON sp.id = pl.package_id JOIN order_items oi ON oi.id = pl.order_item_id WHERE sp.subscription_id = ? AND sp.status = 'open' AND oi.purchase_type = 'subscription'", subscriptionId);
}
