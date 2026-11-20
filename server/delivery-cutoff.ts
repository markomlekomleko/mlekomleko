import { first, type Row } from "./sql";
import { getBusinessSettings } from "./settings";
import { assertBeforeCutoff, assertLocalDate, cutoffForDelivery } from "./time";

/** A stored deadline belongs to that delivery; locked snapshots never reopen. */
export async function deliveryDeadline(rawDate: unknown) {
  const date = assertLocalDate(rawDate);
  const settings = await getBusinessSettings();
  const delivery = await first<Row>("SELECT * FROM deliveries WHERE delivery_date = ?", date);
  const cutoffAt = String(delivery?.cutoff_at ?? cutoffForDelivery(date, settings.cutoffHours, settings.deliveryLocalTime));
  return { date, cutoffAt, locked: Boolean(delivery && delivery.status !== "open") || Date.now() >= Date.parse(cutoffAt) };
}

export async function assertDeliveryEditable(rawDate: unknown) {
  const deadline = await deliveryDeadline(rawDate);
  // Lazily lock only a real route day: one with a stored route or something planned for it
  // (the same candidates the daily job locks). A refused request for an arbitrary past date
  // must not leave a row behind.
  if (deadline.locked && await hasRouteWork(deadline.date)) {
    const { generateDelivery } = await import("./deliveries");
    await generateDelivery(deadline.date, `deadline:${deadline.date}`);
  }
  assertBeforeCutoff(deadline.cutoffAt, deadline.locked ? "locked" : null);
  return deadline;
}

async function hasRouteWork(date: string) {
  return Boolean(await first<Row>(
    "SELECT 1 AS found WHERE EXISTS (SELECT 1 FROM deliveries WHERE delivery_date = ?) OR EXISTS (SELECT 1 FROM orders WHERE delivery_date = ? AND fulfillment_status = 'planned') OR EXISTS (SELECT 1 FROM subscriptions WHERE next_delivery_date = ? AND status IN ('active', 'paused'))",
    date, date, date,
  ));
}
