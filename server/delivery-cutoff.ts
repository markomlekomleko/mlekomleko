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
  if (deadline.locked) {
    const { generateDelivery } = await import("./deliveries");
    await generateDelivery(deadline.date, `deadline:${deadline.date}`);
  }
  assertBeforeCutoff(deadline.cutoffAt, deadline.locked ? "locked" : null);
  return deadline;
}
