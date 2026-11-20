// Since the final specification (19 Nov 2026) only weekly subscriptions can be bought, but
// biweekly packages sold earlier keep running until they end. Tests that exercise those legacy
// packages buy weekly lines and rewrite them into the exact rows the former biweekly checkout
// produced: 2 deliveries per line, line totals, delivery visits and the order total.
export function legacyBiweekly(raw, orderId, lines) {
 const setting = key => { const row = raw.prepare('SELECT value_json FROM settings WHERE key = ?').get(key); return row ? Number(JSON.parse(row.value_json)) : 0; };
 const order = raw.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
 for (const line of lines) {
  const { productId, quantity } = typeof line === 'string' ? { productId: line } : line;
  const item = raw.prepare(`SELECT * FROM order_items WHERE order_id = ? AND product_id = ? AND purchase_type = 'subscription' AND cadence = 'weekly' ${quantity ? 'AND quantity = ?' : ''} ORDER BY rowid LIMIT 1`).get(orderId, productId, ...(quantity ? [quantity] : []));
  raw.prepare("UPDATE order_items SET cadence = 'biweekly', line_total_minor = unit_price_minor * quantity * 2, total_cost_minor = (unit_cost_minor + unit_packaging_cost_minor) * quantity * 2 WHERE id = ?").run(item.id);
  raw.prepare('UPDATE package_lines SET required_deliveries = 2 WHERE order_item_id = ?').run(item.id);
  if (order.subscription_id) raw.prepare(`UPDATE subscription_items SET cadence = 'biweekly' WHERE id = (SELECT id FROM subscription_items WHERE subscription_id = ? AND product_id = ? AND cadence = 'weekly' AND quantity = ? ORDER BY rowid LIMIT 1)`).run(order.subscription_id, productId, item.quantity);
 }
 const orderLines = raw.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
 const subtotal = orderLines.reduce((sum, line) => sum + line.line_total_minor, 0);
 const visits = Math.max(1, ...orderLines.map(line => line.purchase_type === 'one_time' ? 1 : line.cadence === 'biweekly' ? 2 : 4));
 const fee = setting('deliveryFeeMinor'), threshold = setting('freeDeliveryThresholdMinor');
 const deliveryFee = fee > 0 && !(threshold > 0 && subtotal >= threshold) ? fee * visits : 0;
 raw.prepare('UPDATE orders SET subtotal_minor = ?, delivery_fee_minor = ?, total_minor = ? WHERE id = ?').run(subtotal, deliveryFee, subtotal - order.discount_minor + deliveryFee - order.credit_applied_minor, orderId);
 return raw.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
}

/** Checkout items as the API accepts them now: biweekly lines are bought weekly, then rewritten. */
export function weeklyItems(items) {
 return items.map(item => item.cadence === 'biweekly' ? { ...item, cadence: 'weekly' } : item);
}
export function biweeklyProducts(items) {
 return items.filter(item => item.purchaseType === 'subscription' && item.cadence === 'biweekly').map(item => ({ productId: item.productId, quantity: item.quantity }));
}
