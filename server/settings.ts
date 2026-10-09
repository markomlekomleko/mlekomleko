import type { ServiceRegion, DeliverySlot } from "./service-policy";
import { assertDomain } from "./domain";
import { all } from "./sql";
import { deliveryCityForPostalCode, normalizeDeliveryCity } from "../app/lib/delivery-area";
import { addLocalDays, cutoffForDelivery, nextWeekday } from "./time";

export interface BusinessSettings {
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
  minimumOrderMinor: 0, holidays: [], serviceRegions: [], deliverySlots: [],
  timezone: "Europe/Belgrade",
  currency: "RSD",
  deliveryWeekday: 5,
  deliveryWeekdays: [2, 5],
  deliveryLocalTime: "08:00",
  cutoffHours: 24,
  storeName: "Mleko i Mleko",
  announcementEnabled: false,
  announcementText: "",
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

export async function getBusinessSettings(): Promise<BusinessSettings> {
  const rows = await all<{ key: string; value_json: string }>("SELECT key, value_json FROM settings");
  const values = Object.fromEntries(rows.map((row) => {
    try { return [row.key, JSON.parse(row.value_json)]; } catch { return [row.key, row.value_json]; }
  }));
  const servicePostalCodes = Array.isArray(values.servicePostalCodes)
    ? values.servicePostalCodes.filter((value): value is string => typeof value === "string")
    : defaults.servicePostalCodes;
  return {
    ...defaults,
    ...values,
    servicePostalCodes,
    deliveryWeekdays: Array.isArray(values.deliveryWeekdays) && values.deliveryWeekdays.length && values.deliveryWeekdays.every((day: unknown) => Number.isInteger(day) && Number(day) >= 0 && Number(day) <= 6) ? values.deliveryWeekdays : defaults.deliveryWeekdays,
    timezone: "Europe/Belgrade",
    currency: "RSD",
  } as BusinessSettings;
}

/** The Novi Sad route runs Fridays only; Belgrade uses the configured route days.
 * Confirmed against the shop linked by mlekoimleko.rs: https://take.app/mlekoimleko. */
export function deliveryWeekdaysForCity(settings: BusinessSettings, city = "") {
  return settings.deliveryWeekdays.filter(day => normalizeDeliveryCity(city) !== "Novi Sad" || day === 5);
}

export async function getNextDeliveryWindow(now = new Date(), city = "") {
  const settings = await getBusinessSettings();
  const candidates = deliveryWeekdaysForCity(settings, city).map((weekday) => {
    let date = nextWeekday(now, weekday);
    while (settings.holidays.includes(date) || now.getTime() >= Date.parse(cutoffForDelivery(date, settings.cutoffHours, settings.deliveryLocalTime))) date = addLocalDays(date, 7);
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
    remainingOccurrences: {
      weekly: 4,
      biweekly: 2,
    },
  };
}

export function isServiceablePostalCode(settings: BusinessSettings, postalCode: string) {
  const normalized = postalCode.trim();
  if (settings.serviceRegions.some(region => region.postalCodes.includes(normalized))) return true;
  if (!deliveryCityForPostalCode(normalized)) return false;
  if (settings.servicePostalCodes.length === 0) return true;
  return settings.servicePostalCodes.some((entry) => {
    const prefix = entry.trim().replace(/\*$/, "");
    return /^\d{1,5}$/.test(prefix) && normalized.startsWith(prefix);
  });
}
