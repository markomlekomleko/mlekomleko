import { generateMonthlyBilling } from "./billing";
import { generateDelivery } from "./deliveries";
import { processOutbox, queueDeliveryReminders } from "./integration-jobs";
import { getBusinessSettings, getNextDeliveryWindow } from "./settings";
import { addLocalDays } from "./time";

export async function runScheduledJobs(timestamp = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Belgrade", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const date = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const today = `${date.year}-${date.month}-${date.day}`;
  const nextWindow = await getNextDeliveryWindow(new Date(timestamp));
  const settings = await getBusinessSettings();
  const tomorrow = addLocalDays(today, 1);
  // Booking cutoff can move the checkout window past tomorrow. Still prepare tomorrow's route.
  const dates = new Set([nextWindow.deliveryDate]);
  if (settings.deliveryWeekdays.includes(new Date(`${tomorrow}T12:00:00Z`).getUTCDay())) dates.add(tomorrow);
  for (const deliveryDate of dates) await generateDelivery(deliveryDate, `cron-delivery:${timestamp}:${deliveryDate}`);
  const localHour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Belgrade", hour: "2-digit", hourCycle: "h23" }).format(new Date(timestamp)));
  if (localHour >= 9 && localHour < 21) await queueDeliveryReminders(tomorrow);
  if (today.endsWith("-01")) await generateMonthlyBilling(today.slice(0, 7), `cron-billing:${today.slice(0, 7)}`);
  await processOutbox(100);
  return { date: today, deliveryDate: nextWindow.deliveryDate };
}
