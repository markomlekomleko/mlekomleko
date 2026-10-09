import { assertDomain, nonNegativeInt, optionalString } from './domain';
import type { Row, SqlValue } from './sql';

export function effectivePrice(row: Row, subscription = false, now = Date.now()) {
  const base = Number(subscription ? row.subscription_price_minor ?? row.price_minor : row.price_minor);
  const sale = subscription ? row.sale_subscription_price_minor : row.sale_price_minor;
  const active = (!row.sale_starts_at || Date.parse(String(row.sale_starts_at)) <= now) && (!row.sale_ends_at || Date.parse(String(row.sale_ends_at)) > now);
  return sale != null && active ? Math.min(base, Number(sale)) : base;
}
export function productDetails(input: Row, before: Row = {}) {
  const gallery = input.gallery === undefined ? JSON.parse(String(before.gallery_json ?? '[]')) : input.gallery;
  assertDomain(Array.isArray(gallery) && gallery.length <= 12 && gallery.every(x => typeof x === 'string' && x.length <= 1000 && (/^https:\/\//.test(x) || /^\/(?!\/)/.test(x))), 'VALIDATION_ERROR', 'Galerija prima najviše 12 fotografija sa lokalnom ili HTTPS adresom.', 422);
  const nutrition = input.nutrition === undefined ? JSON.parse(String(before.nutrition_json ?? '{}')) : input.nutrition;
  assertDomain(nutrition && typeof nutrition === 'object' && !Array.isArray(nutrition) && Object.entries(nutrition).length <= 20 && Object.entries(nutrition).every(([key,value]) => key.length <= 80 && typeof value === 'string' && value.length <= 80), 'VALIDATION_ERROR', 'Nutritivne vrednosti moraju imati naziv i vrednost.', 422);
  const result: Record<string, SqlValue> = { gallery_json: JSON.stringify(gallery), nutrition_json: JSON.stringify(nutrition) };
  for (const [key, column] of [['ingredients','ingredients'],['allergens','allergens'],['saleStartsAt','sale_starts_at'],['saleEndsAt','sale_ends_at']] as const) result[column] = input[key] === undefined ? before[column] as SqlValue ?? (key.startsWith('sale') ? null : '') : optionalString(input[key], key, 2000) ?? (key.startsWith('sale') ? null : '');
  for (const key of ['sale_starts_at','sale_ends_at']) if (result[key]) { assertDomain(Number.isFinite(Date.parse(String(result[key]))), 'VALIDATION_ERROR', 'Datum akcije nije ispravan.', 422); result[key] = new Date(String(result[key])).toISOString(); }
  assertDomain(!result.sale_starts_at || !result.sale_ends_at || result.sale_starts_at < result.sale_ends_at, 'VALIDATION_ERROR', 'Kraj akcije mora biti posle početka.', 422);
  for (const [key,column] of [['salePriceMinor','sale_price_minor'],['saleSubscriptionPriceMinor','sale_subscription_price_minor']] as const) result[column] = input[key] === undefined ? before[column] as SqlValue ?? null : input[key] == null || input[key] === '' ? null : nonNegativeInt(input[key],key);
  result.inventory_enabled = input.inventoryEnabled === undefined ? Number(before.inventory_enabled ?? 0) : input.inventoryEnabled === true ? 1 : 0;
  return result;
}
export function detailsStatement(id: string, details: Record<string, SqlValue>) {
  return { sql: `UPDATE products SET ${Object.keys(details).map(key => `${key} = ?`).join(', ')} WHERE id = ?`, bindings: [...Object.values(details), id] };
}
