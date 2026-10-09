import { assertDomain, jsonResponse, requiredString, withRoute } from "../../../server/domain";
import { serviceCity } from "../../../server/service-policy";
import { deliveryWeekdaysForCity, getBusinessSettings, isServiceablePostalCode } from "../../../server/settings";
import { all } from "../../../server/sql";
import { addLocalDays, cutoffForDelivery, localDateAt } from "../../../server/time";

export function GET(request: Request) {
  return withRoute(async () => {
    const params = new URL(request.url).searchParams;
    const city = requiredString(params.get("city"), "city", 100);
    const postalCode = requiredString(params.get("postalCode"), "postalCode", 20);
    const settings = await getBusinessSettings();
    const normalizedCity = serviceCity(settings, city, postalCode);
    assertDomain(normalizedCity && isServiceablePostalCode(settings, postalCode), "DELIVERY_AREA_UNAVAILABLE", "Proveri grad i poštanski broj. Adresa nije u zoni dostave.", 422);
    const weekdays = deliveryWeekdaysForCity(settings, normalizedCity);
    const now = new Date();
    const today = localDateAt(now);
    const end = addLocalDays(today, 180);
    const closed = await all<{ delivery_date: string }>("SELECT delivery_date FROM deliveries WHERE delivery_date >= ? AND delivery_date <= ? AND status != 'open'", today, end);
    const unavailable = new Set([...settings.holidays, ...closed.map(row => row.delivery_date)]);
    const dates = Array.from({ length: 180 }, (_, index) => addLocalDays(today, index + 1)).filter(date =>
      weekdays.includes(new Date(`${date}T12:00:00Z`).getUTCDay()) &&
      !unavailable.has(date) &&
      now.getTime() < Date.parse(cutoffForDelivery(date, settings.cutoffHours, settings.deliveryLocalTime)),
    );
    return jsonResponse({ city: normalizedCity, weekdays, dates, cutoffHours: settings.cutoffHours });
  });
}
