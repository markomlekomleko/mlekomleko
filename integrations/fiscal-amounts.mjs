/** Split a discounted line into cent-priced units; quantities and integer total remain exact. */
function pricedUnits(sku, quantity, totalMinor) {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || !Number.isSafeInteger(totalMinor) || totalMinor < 0) throw new Error('Fiskalne količine i iznosi nisu ispravni.');
  const price = Math.floor(totalMinor / quantity), remainder = totalMinor % quantity;
  return [
    ...(quantity > remainder ? [{ sku, quantity: quantity - remainder, unitPrice: price / 100 }] : []),
    ...(remainder ? [{ sku, quantity: remainder, unitPrice: (price + 1) / 100 }] : []),
  ];
}

/** No global discount: Badi applies that to delivery too and rounds each line independently. */
export function fiscalAmounts(items, totalMinor, deliveryFeeMinor, deliverySku, adjustmentSku) {
  if (!Number.isSafeInteger(totalMinor) || totalMinor < 0 || !Number.isSafeInteger(deliveryFeeMinor) || deliveryFeeMinor < 0) throw new Error('Fiskalni iznos nije ispravan.');
  const original = items.reduce((sum, item) => sum + item.line_total_minor, 0);
  const deliveryTarget = Math.min(deliveryFeeMinor, totalMinor);
  const productTarget = totalMinor - deliveryTarget;
  const allocatedTarget = Math.min(original, productTarget);
  const allocated = items.map(item => original ? Math.floor(allocatedTarget * item.line_total_minor / original) : 0);
  let remaining = allocatedTarget - allocated.reduce((sum, amount) => sum + amount, 0);
  const ranked = items.map((item, index) => ({ index, remainder: original ? (allocatedTarget * item.line_total_minor) % original : 0 })).sort((a,b) => b.remainder - a.remainder || a.index - b.index);
  for (const {index} of ranked) { if (!remaining) break; allocated[index]++; remaining--; }
  const lines = items.flatMap((item,index) => {
    const quantity = item.unit_price_minor > 0 ? item.line_total_minor / item.unit_price_minor : item.quantity;
    return pricedUnits(item.badi_sku, quantity, allocated[index]);
  });
  if (productTarget > original) {
    if (!adjustmentSku) throw new Error('Za fiskalizaciju doplate je potreban BADI_ADJUSTMENT_SKU.');
    lines.push({ sku: adjustmentSku, quantity: 1, unitPrice: (productTarget-original)/100 });
  }
  if (deliveryTarget > 0) {
    if (!deliverySku) throw new Error('Za fiskalizaciju dostave je potreban BADI_DELIVERY_SKU.');
    lines.push({ sku: deliverySku, quantity: 1, unitPrice: deliveryTarget/100 });
  }
  const sum = lines.reduce((value,line) => value + Math.round(line.unitPrice*100) * line.quantity,0);
  if (sum !== totalMinor) throw new Error('Zbir fiskalnih stavki se ne poklapa sa naplatom.');
  return lines;
}
