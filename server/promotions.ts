import { assertDomain, optionalString, positiveInt } from './domain';
import { first, type Row, type SqlValue } from './sql';
import { mutationGuard } from './mutation-guard';

export function promoRules(input: Row, previous: Row = {}) {
  const limit = input.perCustomerLimit === undefined ? previous.per_customer_limit ?? null : input.perCustomerLimit;
  return { sql: 'UPDATE promo_codes SET first_purchase_only = ?, per_customer_limit = ?, stackable = ? WHERE id = ?', bindings: [input.firstPurchaseOnly === undefined ? Number(previous.first_purchase_only ?? 0) : Number(input.firstPurchaseOnly === true), limit == null || limit === '' ? null : positiveInt(limit, 'perCustomerLimit', 10000), input.stackable === undefined ? Number(previous.stackable ?? 0) : Number(input.stackable === true)] as SqlValue[] };
}
export async function resolvePromotions(raw: unknown, subtotal: number, email?: string) {
  const codes = [...new Set((Array.isArray(raw) ? raw : (optionalString(raw,'promoCode',204) ?? '').split(',')).map(code => String(code).trim().toUpperCase()).filter(Boolean))];
  assertDomain(codes.length <= 5 && codes.every(code => /^[A-Z0-9_-]{1,40}$/.test(code)), 'PROMO_INVALID','Unesite najviše pet važećih promo kodova.',422);
  const customer = email ? await first<Row>('SELECT id FROM customers WHERE email = ?', email.toLowerCase()) : null;
  let remaining = subtotal;
  const promos: (Row & { discount: number })[] = [];
  for (const code of codes) {
    const row = await first<Row>('SELECT * FROM promo_codes WHERE code = ?',code);
    assertDomain(row && row.is_active && (!row.starts_at || Date.parse(String(row.starts_at)) <= Date.now()) && (!row.ends_at || Date.parse(String(row.ends_at)) >= Date.now()) && (row.usage_limit == null || Number(row.times_used) < Number(row.usage_limit)) && subtotal >= Number(row.minimum_order_minor), 'PROMO_INVALID','Promo kod nije važeći ili uslovi nisu ispunjeni.',422);
    assertDomain(codes.length === 1 || row.stackable, 'PROMO_NOT_STACKABLE','Ovi kodovi se ne mogu kombinovati.',422);
    if (customer) {
      const orders = await first<Row>("SELECT COUNT(*) n FROM orders WHERE customer_id = ? AND fulfillment_status != 'cancelled'",String(customer.id));
      assertDomain(!row.first_purchase_only || !Number(orders?.n), 'PROMO_FIRST_PURCHASE','Kod važi samo za prvu kupovinu.',422);
      const usage = await first<Row>('SELECT COUNT(*) n FROM order_promotions WHERE customer_id = ? AND promo_id = ?',String(customer.id),String(row.id));
      assertDomain(row.per_customer_limit == null || Number(usage?.n) < Number(row.per_customer_limit),'PROMO_CUSTOMER_LIMIT','Iskorišćen je dozvoljeni broj upotreba ovog koda.',422);
    }
    const discount = row.discount_type === 'percent' ? Math.floor(remaining * Number(row.discount_value) / 100) : Math.min(remaining,Number(row.discount_value));
    remaining -= discount; promos.push({...row,discount});
  }
  return { promos, code: codes.join(',') || null, discountMinor: subtotal-remaining };
}
export function reservePromotions(promos: (Row & {discount: number})[], orderId: string, customerId: string) {
  return promos.flatMap(promo => {
    const guard = mutationGuard("EXISTS (SELECT 1 FROM promo_codes p WHERE id = ? AND is_active = 1 AND (usage_limit IS NULL OR times_used < usage_limit) AND (per_customer_limit IS NULL OR (SELECT COUNT(*) FROM order_promotions WHERE promo_id = p.id AND customer_id = ?) < per_customer_limit) AND (first_purchase_only = 0 OR NOT EXISTS (SELECT 1 FROM orders WHERE customer_id = ? AND id != ? AND fulfillment_status != 'cancelled')))", [String(promo.id),customerId,customerId,orderId]);
    return [guard.check,{sql:'INSERT INTO order_promotions (order_id,promo_id,customer_id,discount_minor) VALUES (?,?,?,?)',bindings:[orderId,String(promo.id),customerId,promo.discount]},{sql:'UPDATE promo_codes SET times_used = times_used + 1 WHERE id = ?',bindings:[String(promo.id)]},guard.cleanup];
  });
}
