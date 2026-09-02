import { all } from "./sql";
import { addLocalDays, cutoffForDelivery, nextWeekday } from "./time";

export interface BusinessSettings {
  timezone: "Europe/Belgrade";
  currency: "RSD";
  deliveryWeekday: number;
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
  timezone: "Europe/Belgrade",
  currency: "RSD",
  deliveryWeekday: 5,
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
  trustItemThree: "Plaćanje karticom ili gotovinom",
  storeDemoMode: true,
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
    timezone: "Europe/Belgrade",
    currency: "RSD",
  } as BusinessSettings;
}

export async function getNextDeliveryWindow(now = new Date()) {
  const settings = await getBusinessSettings();
  let deliveryDate = nextWeekday(now, settings.deliveryWeekday);
  let cutoffAt = cutoffForDelivery(deliveryDate, settings.cutoffHours, settings.deliveryLocalTime);
  if (now.getTime() >= Date.parse(cutoffAt)) {
    deliveryDate = addLocalDays(deliveryDate, 7);
    cutoffAt = cutoffForDelivery(deliveryDate, settings.cutoffHours, settings.deliveryLocalTime);
  }
  return {
    deliveryDate,
    deliveryLocalTime: settings.deliveryLocalTime,
    cutoffAt,
    cutoffHours: settings.cutoffHours,
  };
}

export function isServiceablePostalCode(settings: BusinessSettings, postalCode: string) {
  if (settings.servicePostalCodes.length === 0) return true;
  return settings.servicePostalCodes.includes(postalCode.trim());
}
