import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySource, mergeTouch, sanitizeAnalyticsIdentity, ecommerceInvoiceItems } from '../integrations/marketing-attribution.mjs';
const touch = (parameters = {}, referrerHost) => ({ landingPath: '/', capturedAt: new Date().toISOString(), parameters, referrerHost });
test('last relevant campaign survives internal navigation and direct return; new campaign replaces only last touch', () => {
  const first = touch({ utm_source: 'instagram', utm_medium: 'paid_social', utm_campaign: 'leto' });
  let snapshot = mergeTouch(null, first);
  snapshot = mergeTouch(snapshot, touch());
  assert.deepEqual(snapshot, { firstTouch: first, lastTouch: first });
  const second = touch({ utm_source: 'newsletter', utm_medium: 'email', utm_campaign: 'jesen' });
  snapshot = mergeTouch(snapshot, second);
  assert.deepEqual(snapshot, { firstTouch: first, lastTouch: second });
});
test('organic, paid, QR, influencers, messaging, referral and direct remain distinct', () => {
  const scenarios = [
    [{ lastTouch: touch({}, 'www.google.rs') }, 'organic_search'],
    [{ lastTouch: touch({ utm_source: 'instagram', utm_medium: 'paid_social' }) }, 'paid_social'],
    [{ gclid: 'sample' }, 'paid_search'],
    [{ utm_source: 'pakovanje', utm_medium: 'qr' }, 'qr'],
    [{ utm_source: 'ana', utm_medium: 'influencer' }, 'influencer'],
    [{ utm_source: 'whatsapp' }, 'messaging'],
    [{ referrer_host: 'example.com' }, 'referral'],
    [{ utm_source: 'admin' }, 'manual'],
    [{}, 'direct'],
  ];
  for (const [source, channel] of scenarios) assert.equal(classifySource(source).channel, channel);
});
test('identity allowlist cannot carry customer data, URLs or nested objects', () => {
  assert.deepEqual(sanitizeAnalyticsIdentity({ anonymousId: 'a-123', sessionId: 's-456', gaClientId: '123.456', gaSessionId: '123456', email: 'private@example.test', token: 'secret' }), { anonymousId: 'a-123', sessionId: 's-456', gaClientId: '123.456', gaSessionId: '123456' });
  assert.deepEqual(sanitizeAnalyticsIdentity({ anonymousId: 'name@example.test', sessionId: 'https://x.test/?token=private', gaClientId: {} }), {});
});

test('monthly invoice items count billed occurrences and partial adjustments keep integer quantities', () => {
  const [monthly, adjustment] = ecommerceInvoiceItems([
    { product_id:'milk',product_name:'Mleko',unit_label:'1 L',quantity:2,unit_price_minor:25000,line_total_minor:250000 },
    { product_id:'adjust',product_name:'Korekcija',unit_label:'1 L',quantity:2,unit_price_minor:25000,line_total_minor:15000 },
  ]);
  assert.equal(monthly.quantity,10); assert.equal(monthly.price,250);
  assert.equal(adjustment.quantity,2); assert.equal(adjustment.price,75);
  assert.equal(adjustment.quantity * adjustment.price,150);
});
