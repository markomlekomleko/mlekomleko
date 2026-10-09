import { assertDomain, optionalString, requiredString } from './domain';
import type { Row } from './sql';

export function shippingSnapshot(row: Row) {
  let saved: Record<string, unknown> = {};
  try { saved = JSON.parse(String(row.shipping_json ?? '{}')); } catch { /* legacy profile fallback */ }
  return { fullName: row.full_name, email: row.email, phone: row.phone, addressLine1: row.address_line_1, addressLine2: row.address_line_2, city: row.city, postalCode: row.postal_code, deliveryNote: row.delivery_note, deliverySlot: null as string | null, ...saved };
}
export function applyShippingSnapshot(row: Row) {
  const saved = shippingSnapshot(row);
  return { ...row, full_name: saved.fullName, phone: saved.phone, address_line_1: saved.addressLine1, address_line_2: saved.addressLine2, city: saved.city, postal_code: saved.postalCode, delivery_note: saved.deliveryNote };
}
export function billingSnapshot(value: unknown, shipping: Record<string, unknown>) {
  if (value == null) return { ...shipping, companyName: null, taxId: null };
  assertDomain(typeof value === 'object' && !Array.isArray(value), 'VALIDATION_ERROR', 'Podaci za račun nisu ispravni.', 422);
  const data = value as Record<string, unknown>;
  const companyName = optionalString(data.companyName, 'companyName', 200);
  const taxId = optionalString(data.taxId, 'taxId', 20);
  assertDomain(!companyName || (taxId && /^\d{9}$/.test(taxId)), 'INVALID_TAX_ID', 'Unesite PIB firme (9 cifara).', 422);
  return { ...shipping, companyName, taxId, addressLine1: requiredString(data.addressLine1 ?? shipping.addressLine1, 'billing.addressLine1', 200), city: requiredString(data.city ?? shipping.city, 'billing.city', 100), postalCode: requiredString(data.postalCode ?? shipping.postalCode, 'billing.postalCode', 20) };
}
