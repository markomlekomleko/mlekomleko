import { deliveryAddressError, deliveryCityForPostalCode, deliveryCityKey, normalizeDeliveryCity } from '../app/lib/delivery-area';
import { assertDomain, nonNegativeInt, requiredString } from './domain';
import { assertLocalDate } from './time';
import { first, type Row } from './sql';
import { mutationGuard } from './mutation-guard';
import type { BusinessSettings } from './settings';

/** A delivery city the owner added in the admin: its name, postal codes and route weekdays
 * (a subset of the configured route days, 0 = Sunday … 6 = Saturday). */
export type ServiceRegion = { city: string; postalCodes: string[]; weekdays: number[] };
export type DeliverySlot = { id: string; label: string; capacity: number };
export function validatePolicy(key: string, value: unknown) {
  if (key === 'minimumOrderMinor') return nonNegativeInt(value,key);
  assertDomain(Array.isArray(value) && value.length <= 366,'VALIDATION_ERROR','Unesite ispravnu listu podešavanja.',422);
  if (key === 'holidays') return [...new Set(value.map(date => assertLocalDate(date)))];
  if (key === 'serviceRegions') {
    assertDomain(value.length <= 50,'VALIDATION_ERROR','Najviše 50 dodatnih gradova.',422);
    const regions = value.map(item => {
      assertDomain(item && typeof item === 'object','VALIDATION_ERROR','Grad za dostavu nije ispravan.',422);
      const city = requiredString(item.city,'city',100).replace(/\s+/g,' ');
      assertDomain(!normalizeDeliveryCity(city),'VALIDATION_ERROR',`${city} je već u zoni dostave. Ovde dodajte samo novi grad.`,422,{field:'serviceRegions'});
      assertDomain(Array.isArray(item.postalCodes) && item.postalCodes.length && item.postalCodes.every((code: unknown)=> typeof code==='string' && /^\d{5}$/.test(code)), 'VALIDATION_ERROR',`${city}: unesite poštanske brojeve od pet cifara, odvojene zarezom.`,422,{field:'serviceRegions'});
      const postalCodes = [...new Set(item.postalCodes as string[])];
      const builtIn = postalCodes.find(code => deliveryCityForPostalCode(code));
      assertDomain(!builtIn,'VALIDATION_ERROR',`${city}: poštanski broj ${builtIn} već pripada gradu ${builtIn ? deliveryCityForPostalCode(builtIn) : ''}.`,422,{field:'serviceRegions'});
      assertDomain(Array.isArray(item.weekdays) && item.weekdays.length && item.weekdays.every((day: unknown) => Number.isInteger(day) && Number(day) >= 0 && Number(day) <= 6),'VALIDATION_ERROR',`${city}: izaberite bar jedan dan dostave.`,422,{field:'serviceRegions'});
      return { city, postalCodes, weekdays: [...new Set(item.weekdays as number[])].sort() };
    });
    const keys = regions.map(region => deliveryCityKey(region.city));
    assertDomain(new Set(keys).size === keys.length,'VALIDATION_ERROR','Isti grad je dodat dva puta.',422,{field:'serviceRegions'});
    const codes = regions.flatMap(region => region.postalCodes);
    const repeated = codes.find((code, index) => codes.indexOf(code) !== index);
    assertDomain(!repeated,'VALIDATION_ERROR',`Poštanski broj ${repeated} je upisan kod dva grada.`,422,{field:'serviceRegions'});
    return regions;
  }
  const slots = value.map(item => ({ id: requiredString(item.id,'slot.id',40), label: requiredString(item.label,'slot.label',100), capacity: nonNegativeInt(item.capacity,'slot.capacity',10000) }));
  assertDomain(new Set(slots.map(slot=>slot.id)).size === slots.length,'VALIDATION_ERROR','Oznake termina moraju biti jedinstvene.',422);
  return slots;
}
/** The delivery city (its canonical name) for a typed city and postal code, or null when the
 * pair is outside the delivery zone: built-in cities by name, aliases and exact postal codes;
 * admin-added cities by name in either script and one of their postal codes. */
export function serviceCity(settings: BusinessSettings, city: string, postalCode: string) {
  const code = postalCode.trim();
  const extra = settings.serviceRegions.find(region => region.postalCodes.includes(code) && deliveryCityKey(region.city) === deliveryCityKey(city));
  return extra?.city ?? (deliveryAddressError(city,code) === null ? normalizeDeliveryCity(city) : null);
}
export function assertSaleDate(settings: BusinessSettings, date: string) {
  assertDomain(!settings.holidays.includes(date),'DELIVERY_HOLIDAY','Tog datuma nema dostave. Izaberite sledeći termin.',422);
}
export async function selectSlot(settings: BusinessSettings, date: string, raw: unknown) {
  if (!settings.deliverySlots.length) return null;
  const id = requiredString(raw,'slotId',40);
  const slot = settings.deliverySlots.find(slot=>slot.id===id);
  assertDomain(slot,'INVALID_SLOT','Izaberite termin dostave.',422);
  const row = await first<Row>("SELECT COUNT(*) n FROM orders WHERE delivery_date = ? AND slot_id = ? AND fulfillment_status != 'cancelled'",date,id);
  assertDomain(!slot.capacity || Number(row?.n) < slot.capacity,'SLOT_FULL','Termin je popunjen. Izaberite drugi.',409);
  return slot;
}
export function slotGuard(date: string, slot: DeliverySlot) {
  return mutationGuard("(SELECT COUNT(*) FROM orders WHERE delivery_date = ? AND slot_id = ? AND fulfillment_status != 'cancelled') <= ?",[date,slot.id,slot.capacity]);
}
