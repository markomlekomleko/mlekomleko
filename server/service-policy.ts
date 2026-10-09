import { deliveryAddressError, normalizeDeliveryCity } from '../app/lib/delivery-area';
import { assertDomain, nonNegativeInt, requiredString } from './domain';
import { assertLocalDate } from './time';
import { first, type Row } from './sql';
import { mutationGuard } from './mutation-guard';
import type { BusinessSettings } from './settings';

export type ServiceRegion = { city: string; postalCodes: string[] };
export type DeliverySlot = { id: string; label: string; capacity: number };
export function validatePolicy(key: string, value: unknown) {
  if (key === 'minimumOrderMinor') return nonNegativeInt(value,key);
  assertDomain(Array.isArray(value) && value.length <= 366,'VALIDATION_ERROR','Unesite ispravnu listu podešavanja.',422);
  if (key === 'holidays') return [...new Set(value.map(date => assertLocalDate(date)))];
  if (key === 'serviceRegions') return value.map(item => {
    assertDomain(item && typeof item === 'object','VALIDATION_ERROR','Zona nije ispravna.',422);
    const city = requiredString(item.city,'city',100);
    assertDomain(Array.isArray(item.postalCodes) && item.postalCodes.length && item.postalCodes.every((code: unknown)=> typeof code==='string' && /^\d{5}$/.test(code)), 'VALIDATION_ERROR','Zona mora sadržati poštanske brojeve od pet cifara.',422);
    return {city,postalCodes:[...new Set(item.postalCodes)]};
  });
  const slots = value.map(item => ({ id: requiredString(item.id,'slot.id',40), label: requiredString(item.label,'slot.label',100), capacity: nonNegativeInt(item.capacity,'slot.capacity',10000) }));
  assertDomain(new Set(slots.map(slot=>slot.id)).size === slots.length,'VALIDATION_ERROR','Oznake termina moraju biti jedinstvene.',422);
  return slots;
}
export function serviceCity(settings: BusinessSettings, city: string, postalCode: string) {
  const extra = settings.serviceRegions.find(region => region.postalCodes.includes(postalCode) && region.city.toLocaleLowerCase('sr') === city.trim().toLocaleLowerCase('sr'));
  return extra?.city ?? (deliveryAddressError(city,postalCode) === null ? normalizeDeliveryCity(city) : null);
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
