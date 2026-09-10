import { generateMonthlyBilling } from "./billing";
import { generateDelivery } from "./deliveries";
import { processOutbox, queueDeliveryReminders } from "./integration-jobs";
import { getNextDeliveryWindow } from "./settings";
import { addLocalDays } from "./time";

export async function runScheduledJobs(timestamp = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Belgrade", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(timestamp));
  const date = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const today = `${date.year}-${date.month}-${date.day}`;
  const nextWindow = await getNextDeliveryWindow(new Date(timestamp));
  await generateDelivery(nextWindow.deliveryDate, `cron-delivery:${today}:${nextWindow.deliveryDate}`);
  await queueDeliveryReminders(addLocalDays(today, 1));
  if (today.endsWith("-01")) await generateMonthlyBilling(today.slice(0, 7), `cron-billing:${today.slice(0, 7)}`);
  await processOutbox(100);
  return { date: today, deliveryDate: nextWindow.deliveryDate };
}
