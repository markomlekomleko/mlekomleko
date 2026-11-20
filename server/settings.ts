import type { ServiceRegion, DeliverySlot } from "./service-policy";
import { assertDomain } from "./domain";
import { all } from "./sql";
import { DELIVERY_CITIES, deliveryCityForPostalCode, deliveryCityKey, normalizeDeliveryCity } from "../app/lib/delivery-area";
import { addLocalDays, cutoffForDelivery, localDateAt, nextWeekday } from "./time";

export interface BusinessSettings {
  originCowImageUrl: string;
  originGoatImageUrl: string;
  /** Smallest amount of milk per delivery line, in litres; 0 switches the rule off. */
  minimumLitres: number;
  minimumOrderMinor: number; holidays: string[]; serviceRegions: ServiceRegion[]; deliverySlots: DeliverySlot[];
  timezone: "Europe/Belgrade";
  currency: "RSD";
  deliveryWeekday: number;
  deliveryWeekdays: number[];
  deliveryLocalTime: string;
  cutoffHours: number;
  storeName: string;
  announcementEnabled: boolean;
  announcementText: string;
  announcementTextEn: string;
  announcementTextRu: string;
  announcementTextSrCyrl: string;
  announcementLinkLabel: string;
  announcementUrl: string;
  heroEyebrow: string;
  heroTitle: string;
  heroSubtitle: string;
  heroPrimaryLabel: string;
  heroPrimaryUrl: string;
  heroSecondaryLabel: string;
  heroSecondaryUrl: string;
  serviceAreaTitle: string;
  serviceAreaNote: string;
  servicePostalCodes: string[];
  deliveryFeeMinor: number;
  freeDeliveryThresholdMinor: number;
  routeCapacity: number;
  estimatedDeliveryCostMinor: number;
  paymentFeeBps: number;
  guaranteeTitle: string;
  guaranteeText: string;
  trustItemOne: string;
  trustItemTwo: string;
  trustItemThree: string;
  storeDemoMode: boolean;
}

const defaults: BusinessSettings = {
  originCowImageUrl: "", originGoatImageUrl: "",
  minimumLitres: 0,
  minimumOrderMinor: 0, holidays: [], serviceRegions: [], deliverySlots: [],
  timezone: "Europe/Belgrade",
  currency: "RSD",
  deliveryWeekday: 5,
  deliveryWeekdays: [2, 5],
  deliveryLocalTime: "07:00",
  cutoffHours: 36,
  storeName: "Mleko i Mleko",
  announcementEnabled: false,
  announcementText: "",
  announcementTextEn: "",
  announcementTextRu: "",
  announcementTextSrCyrl: "",
  announcementLinkLabel: "Saznaj više",
  announcementUrl: "/prodavnica",
  heroEyebrow: "Dostava sa farme do vaših vrata",
  heroTitle: "Pravo mleko. Bez odlaska u nabavku.",
  heroSubtitle: "Jednom izaberite proizvode i ritam. Mi ih donosimo, a vi menjate, preskačete ili pauzirate kad god vam odgovara.",
  heroPrimaryLabel: "Sastavi moju dostavu",
  heroPrimaryUrl: "/prodavnica",
  heroSecondaryLabel: "Kako funkcioniše",
  heroSecondaryUrl: "/kako-funkcionise",
  serviceAreaTitle: "Proverite sledeću dostavu",
  serviceAreaNote: "Unesite poštanski broj da proverite dostupnost.",
  servicePostalCodes: [],
  deliveryFeeMinor: 0,
  freeDeliveryThresholdMinor: 0,
  routeCapacity: 0,
  estimatedDeliveryCostMinor: 0,
  paymentFeeBps: 0,
  guaranteeTitle: "Dostava bez rizika",
  guaranteeText: "Ako proizvod stigne oštećen ili isporuka ne ispuni dogovorene uslove, evidentiramo zamenu ili kredit.",
  trustItemOne: "Redovna dostava bez ugovorne obaveze",
  trustItemTwo: "Izmena i preskakanje do roka za dostavu",
  trustItemThree: "Plaćanje gotovinom pri dostavi",
  storeDemoMode: false,
};

/** Settings rows that are no longer used (the retired Inđija switch). They may still exist
 * in a database; they are never read or offered again. */
export const RETIRED_SETTINGS = ["indjijaEnabled", "indjijaDeliveryWeekdays"];
const isWeekday = (day: unknown) => Number.isInteger(day) && Number(day) >= 0 && Number(day) <= 6;

/** Stored cities added before they had their own weekdays keep the route days they used to get. */
function readServiceRegions(value: unknown, routeDays: number[]): ServiceRegion[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== "object" || typeof item.city !== "string" || !item.city.trim() || !Array.isArray(item.postalCodes)) return [];
    const postalCodes = item.postalCodes.filter((code: unknown): code is string => typeof code === "string" && /^\d{5}$/.test(code));
    const weekdays = Array.isArray(item.weekdays) && item.weekdays.length && item.weekdays.every(isWeekday) ? [...new Set(item.weekdays as number[])].sort() : [...routeDays];
    return [{ city: item.city.trim(), postalCodes, weekdays }];
  });
}

export async function getBusinessSettings(): Promise<BusinessSettings> {
  const rows = await all<{ key: string; value_json: string }>("SELECT key, value_json FROM settings");
  const values = Object.fromEntries(rows.filter((row) => !RETIRED_SETTINGS.includes(row.key)).map((row) => {
    try { return [row.key, JSON.parse(row.value_json)]; } catch { return [row.key, row.value_json]; }
  }));
  const servicePostalCodes = Array.isArray(values.servicePostalCodes)
    ? values.servicePostalCodes.filter((value): value is string => typeof value === "string")
    : defaults.servicePostalCodes;
  const deliveryWeekdays = Array.isArray(values.deliveryWeekdays) && values.deliveryWeekdays.length && values.deliveryWeekdays.every(isWeekday) ? values.deliveryWeekdays : defaults.deliveryWeekdays;
  return {
    ...defaults,
    ...values,
    servicePostalCodes,
    deliveryWeekdays,
    serviceRegions: readServiceRegions(values.serviceRegions, deliveryWeekdays),
    timezone: "Europe/Belgrade",
    currency: "RSD",
  } as BusinessSettings;
}

/** The admin-added city a typed name refers to (either script, any case, diacritics optional). */
export function serviceRegionForCity(settings: BusinessSettings, city: string) {
  const key = deliveryCityKey(city);
  return key ? settings.serviceRegions.find((region) => deliveryCityKey(region.city) === key) : undefined;
}

/** Route days of an admin-added city: its own weekdays, limited to the days the route runs. */
function regionWeekdays(settings: BusinessSettings, region: ServiceRegion) {
  return region.weekdays.filter((day) => settings.deliveryWeekdays.includes(day));
}

/** Every city we deliver to: the built-in cities, then the cities added in the admin. */
export function deliveryCityNames(settings: BusinessSettings): string[] {
  return [...DELIVERY_CITIES, ...settings.serviceRegions.map((region) => region.city)];
}

/** Canonical name of a delivery city (built-in alias or admin-added name), or null. */
export function deliveryCityName(settings: BusinessSettings, city: string): string | null {
  return normalizeDeliveryCity(city) ?? serviceRegionForCity(settings, city)?.city ?? null;
}

/** The delivery city a postal code belongs to, built-in or admin-added, or null. */
export function deliveryCityForPostal(settings: BusinessSettings, postalCode: string): string | null {
  const code = postalCode.trim();
  return deliveryCityForPostalCode(code) ?? settings.serviceRegions.find((region) => region.postalCodes.includes(code))?.city ?? null;
}

export function allDeliveryWeekdays(settings: BusinessSettings) {
  return [...new Set([...settings.deliveryWeekdays, ...settings.serviceRegions.flatMap((region) => regionWeekdays(settings, region))])].sort();
}

/** The Novi Sad route runs Fridays only; Belgrade uses the configured route days
 * (confirmed against the shop linked by mlekoimleko.rs: https://take.app/mlekoimleko).
 * An admin-added city uses its own weekdays. A city we do not serve has no days. */
export function deliveryWeekdaysForCity(settings: BusinessSettings, city = "") {
  if (!city.trim()) return allDeliveryWeekdays(settings);
  const builtIn = normalizeDeliveryCity(city);
  if (builtIn === "Novi Sad") return settings.deliveryWeekdays.filter((day) => day === 5);
  if (builtIn === "Beograd") return [...settings.deliveryWeekdays];
  const region = serviceRegionForCity(settings, city);
  return region ? regionWeekdays(settings, region) : [];
}

export async function getNextDeliveryWindow(now = new Date(), city = "") {
  const settings = await getBusinessSettings();
  // A route locked ahead of its formal cutoff (admin force-lock, a temporary cutoff change)
  // can no longer accept orders; offering it only produces DELIVERY_LOCKED at checkout.
  const closed = new Set((await all<{ delivery_date: string } & Record<string, unknown>>("SELECT delivery_date FROM deliveries WHERE status != 'open' AND delivery_date >= ?", localDateAt(now))).map((row) => row.delivery_date));
  const candidates = deliveryWeekdaysForCity(settings, city).map((weekday) => {
    let date = nextWeekday(now, weekday);
    while (settings.holidays.includes(date) || closed.has(date) || now.getTime() >= Date.parse(cutoffForDelivery(date, settings.cutoffHours, settings.deliveryLocalTime))) date = addLocalDays(date, 7);
    return date;
  }).sort();
  assertDomain(candidates.length, "DELIVERY_UNAVAILABLE", "Trenutno nema dostupnih dana dostave za izabrani grad.", 422);
  const deliveryDate = candidates[0];
  const cutoffAt = cutoffForDelivery(deliveryDate, settings.cutoffHours, settings.deliveryLocalTime);
  return {
    deliveryDate,
    billingMonth: deliveryDate.slice(0, 7),
    deliveryLocalTime: settings.deliveryLocalTime,
    cutoffAt,
    cutoffHours: settings.cutoffHours,
    deliveryFeeMinor: settings.deliveryFeeMinor,
    freeDeliveryThresholdMinor: settings.freeDeliveryThresholdMinor,
    remainingOccurrences: {
      weekly: 4,
      biweekly: 2,
    },
  };
}

export function isServiceablePostalCode(settings: BusinessSettings, postalCode: string) {
  const normalized = postalCode.trim();
  const region = settings.serviceRegions.find((entry) => entry.postalCodes.includes(normalized));
  if (region) return regionWeekdays(settings, region).length > 0;
  if (!deliveryCityForPostalCode(normalized)) return false;
  if (settings.servicePostalCodes.length === 0) return true;
  return settings.servicePostalCodes.some((entry) => {
    const prefix = entry.trim().replace(/\*$/, "");
    return /^\d{1,5}$/.test(prefix) && normalized.startsWith(prefix);
  });
}
