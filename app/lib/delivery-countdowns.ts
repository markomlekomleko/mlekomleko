import { all } from "../../server/sql";
import { deliveryWeekdaysForCity, getBusinessSettings } from "../../server/settings";
import { addLocalDays, cutoffForDelivery, localDateAt, nextWeekday } from "../../server/time";

/** One change deadline: the delivery it belongs to and the instant changes close. */
export type CutoffSlot = { date: string; weekday: number; cutoffAt: string };
export type CityCutoffs = { city: string; slots: CutoffSlot[] };

/**
 * The top-bar countdowns (spec 19 Nov 2026, §1): per city, the next few deliveries whose
 * change deadline (cutoffHours before the route start) is still ahead, from the same
 * settings, holidays and locked routes the server enforces at checkout and in the account.
 * Several slots go to the browser so that when one deadline passes the bar moves on to
 * the next one without a reload.
 */
export async function upcomingCutoffs(now = new Date(), perCity = 4): Promise<CityCutoffs[]> {
  const settings = await getBusinessSettings();
  const closed = new Set((await all<{ delivery_date: string } & Record<string, unknown>>(
    "SELECT delivery_date FROM deliveries WHERE status != 'open' AND delivery_date >= ?", localDateAt(now),
  )).map((row) => row.delivery_date));
  return ["Beograd", "Novi Sad"].map((city) => {
    const slots: CutoffSlot[] = [];
    for (const weekday of deliveryWeekdaysForCity(settings, city)) {
      let date = nextWeekday(now, weekday);
      for (let guard = 0; slots.filter((slot) => slot.weekday === weekday).length < perCity && guard < 30; guard++, date = addLocalDays(date, 7)) {
        if (settings.holidays.includes(date) || closed.has(date)) continue;
        const cutoffAt = cutoffForDelivery(date, settings.cutoffHours, settings.deliveryLocalTime);
        if (Date.parse(cutoffAt) <= now.getTime()) continue;
        slots.push({ date, weekday, cutoffAt });
      }
    }
    slots.sort((a, b) => a.cutoffAt.localeCompare(b.cutoffAt));
    return { city, slots: slots.slice(0, perCity) };
  }).filter((entry) => entry.slots.length);
}
