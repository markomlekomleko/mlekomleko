import { processPaymentRetries } from "./payment-attempts";
import { generateMonthlyBilling } from "./billing";
import { generateDelivery, lockOverdueDeliveries } from "./deliveries";
import { processOutbox, queueDeliveryReminders } from "./integration-jobs";
import { getBusinessSettings, getNextDeliveryWindow } from "./settings";
import { addLocalDays, cutoffForDelivery } from "./time";

export async function runScheduledJobs(timestamp = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Belgrade", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const date = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const today = `${date.year}-${date.month}-${date.day}`;
  const nextWindow = await getNextDeliveryWindow(new Date(timestamp));
  const settings = await getBusinessSettings();
  await processOutbox(100);
  const lockedDates = await lockOverdueDeliveries();
  const tomorrow = addLocalDays(today, 1);
  // Booking cutoff can move the checkout window past tomorrow. Still prepare tomorrow's route.
  const dates = new Set([nextWindow.deliveryDate]);
  if (settings.deliveryWeekdays.includes(new Date(`${tomorrow}T12:00:00Z`).getUTCDay())) dates.add(tomorrow);
  // Daily cron scans the next cutoff window, including policies up to seven days before delivery.
  const deadlines = new Set<string>();
  for (let offset = 0; offset <= 9; offset++) {
    const candidate = addLocalDays(today, offset);
    if (!settings.deliveryWeekdays.includes(new Date(`${candidate}T12:00:00Z`).getUTCDay())) continue;
    const cutoff = Date.parse(cutoffForDelivery(candidate, settings.cutoffHours, settings.deliveryLocalTime));
    if (cutoff > timestamp && cutoff <= timestamp + 24 * 60 * 60 * 1000) { dates.add(candidate); deadlines.add(candidate); }
  }
  for (const deliveryDate of dates) await generateDelivery(deliveryDate, `cron-delivery:${timestamp}:${deliveryDate}`);
  const localHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Belgrade", hour: "2-digit", hourCycle: "h23" }).format(new Date(timestamp)));
  if (localHour >= 9 && localHour < 21) {
    for (const deliveryDate of deadlines) await queueDeliveryReminders(deliveryDate, "deadline");
    await queueDeliveryReminders(tomorrow);
  }
  await processPaymentRetries();
  await generateMonthlyBilling(today.slice(0, 7), `cron-billing:${today}`);
  await processOutbox(100);
  return { date: today, deliveryDate: nextWindow.deliveryDate, lockedDates };
}
