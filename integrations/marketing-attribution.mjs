/** Last non-direct touch. All arguments are already bounded, non-contact metadata. */
export function classifySource(source = {}) {
  const touch = source.lastTouch ?? source;
  const p = touch.parameters ?? source;
  const name = String(p.utm_source ?? '').toLowerCase();
  const medium = String(p.utm_medium ?? '').toLowerCase();
  const referrer = String(touch.referrerHost ?? source.referrer_host ?? '').toLowerCase();
  let channel = 'direct';
  if (name === 'admin') channel = 'manual';
  else if (/qr/.test(medium) || name === 'qr') channel = 'qr';
  else if (/influencer|creator/.test(medium)) channel = 'influencer';
  else if (/email|newsletter/.test(medium) || /email|newsletter/.test(name)) channel = 'email';
  else if (/whatsapp|viber|telegram/.test(name) || /messaging/.test(medium)) channel = 'messaging';
  else if (p.gclid || /cpc|ppc|paid|display|cpm/.test(medium)) channel = /facebook|instagram|meta|tiktok/.test(name) ? 'paid_social' : 'paid_search';
  else if (/organic/.test(medium) || /(^|\.)(google\.[a-z.]+|bing.com|duckduckgo.com|search.yahoo.com)$/.test(referrer)) channel = 'organic_search';
  else if (/social/.test(medium) || /facebook|instagram|tiktok|linkedin|pinterest/.test(name || referrer)) channel = 'organic_social';
  else if (name || referrer) channel = 'referral';
  return { channel, source: name || referrer || '(direct)', medium: medium || channel, campaign: String(p.utm_campaign ?? '(bez kampanje)') };
}

export function mergeTouch(previous, touch) {
  const meaningful = Object.keys(touch.parameters ?? {}).length > 0 || Boolean(touch.referrerHost);
  return { firstTouch: previous?.firstTouch ?? touch, lastTouch: meaningful || !previous ? touch : previous.lastTouch };
}

export function sanitizeAnalyticsIdentity(value) {
  if (!value || typeof value !== 'object') return {};
  const result = {};
  for (const key of ['anonymousId', 'sessionId', 'gaClientId', 'gaSessionId']) {
    const text = String(value[key] ?? '');
    if (/^[a-zA-Z0-9._:-]{1,120}$/.test(text)) result[key] = text;
  }
  for (const key of ['fbp', 'fbc']) {
    const text = String(value[key] ?? '');
    if (/^fb\.\d+\.\d+\.[a-zA-Z0-9_-]{1,200}$/.test(text)) result[key] = text;
  }
  return result;
}

/** Invoice line_total includes all billed occurrences, quantity may be per delivery. */
export function ecommerceInvoiceItems(items) {
  return items.map(item => {
    const priceMinor = Number(item.unit_price_minor);
    const lineMinor = Number(item.line_total_minor);
    const billedUnits = priceMinor > 0 ? lineMinor / priceMinor : Number(item.quantity);
    const quantity = Number.isInteger(billedUnits) && billedUnits > 0 ? billedUnits : Math.max(1, Math.trunc(Number(item.quantity) || 1));
    return { item_id: String(item.product_id), item_name: String(item.product_name), item_variant: String(item.unit_label), price: lineMinor / quantity / 100, quantity };
  });
}
