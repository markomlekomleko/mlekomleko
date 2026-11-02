import { fiscalAmounts } from './fiscal-amounts.mjs';

// Integer allocations are frozen once. Partial deliveries take disjoint unit ranges,
// so discounts and delivery fees add up exactly even after a pause or a retry.
export function buildFiscalSnapshot(items, totalMinor, deliveryFeeMinor, deliveryLabel, paymentTiming = 'advance') {
  const mapped = items.map((item, i) => ({...item, quantity: item.purchased_quantity, badi_sku: i + 1}));
  const amounts = fiscalAmounts(mapped, totalMinor, deliveryFeeMinor, items.length + 1, null);
  const deliveryTotal = Math.min(deliveryFeeMinor, totalMinor);
  const weights = items.map(item => item.line_total_minor);
  if (!weights.some(Boolean)) weights.splice(0, weights.length, ...items.map(item => item.purchased_quantity));
  const weightTotal = weights.reduce((a, b) => a + b, 0);
  let priorWeight = 0;
  return {version: 1, paymentTiming, totalMinor, deliveryLabel, lines: items.map((item, index) => {
    const priced = amounts.filter(line => line.sku === index + 1);
    const productMinor = priced.reduce((sum, line) => sum + Math.round(line.unitPrice * 100) * line.quantity, 0);
    const quantity = priced.reduce((sum, line) => sum + line.quantity, 0);
    if (quantity !== item.purchased_quantity) throw new Error('Kupljene i fiskalne količine se ne poklapaju.');
    const before = Math.floor(deliveryTotal * priorWeight / weightTotal);
    priorWeight += weights[index];
    return {orderItemId: item.id, name: item.product_name, label: item.tax_label, quantity, productMinor,
      deliveryMinor: Math.floor(deliveryTotal * priorWeight / weightTotal) - before};
  })};
}

function units(total, quantity, offset, count) {
  const low = Math.floor(total / quantity), lowCount = quantity - total % quantity;
  const n = Math.max(0, Math.min(offset + count, lowCount) - offset);
  return [...(n ? [{quantity:n, minor:low}] : []), ...(count > n ? [{quantity:count-n, minor:low+1}] : [])];
}

export function fiscalDeliveryItems(snapshot, allocations = snapshot.lines.map(line => ({order_item_id:line.orderItemId, unit_offset:0, quantity:line.quantity}))) {
  let deliveryMinor = 0;
  const items = allocations.flatMap(allocation => {
    const line = snapshot.lines.find(row => row.orderItemId === allocation.order_item_id);
    const offset = Number(allocation.unit_offset), count = Number(allocation.quantity);
    if (!line || !Number.isSafeInteger(offset) || !Number.isSafeInteger(count) || offset < 0 || count < 1 || offset + count > line.quantity) throw new Error('Isporuka prelazi kupljenu fiskalnu količinu.');
    deliveryMinor += units(line.deliveryMinor, line.quantity, offset, count).reduce((sum, part) => sum + part.quantity * part.minor, 0);
    return units(line.productMinor, line.quantity, offset, count).map(part => ({name:line.name, quantity:part.quantity, unitPrice:part.minor/100, totalAmount:part.minor*part.quantity/100, labels:[line.label]}));
  });
  if (deliveryMinor) items.push({name:'Dostava', quantity:1, unitPrice:deliveryMinor/100, totalAmount:deliveryMinor/100, labels:[snapshot.deliveryLabel]});
  return {items, totalMinor:items.reduce((sum, item) => sum + Math.round(item.totalAmount*100), 0)};
}
