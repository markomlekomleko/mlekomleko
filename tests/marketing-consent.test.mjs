import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { mergeTouch } from '../integrations/marketing-attribution.mjs';

function runtime(env = {}, blockedStorage = false) {
  const storage = () => { const values = new Map(); return {
    getItem(key) { if (blockedStorage) throw Error('blocked'); return values.get(key) ?? null; },
    setItem(key, value) { if (blockedStorage) throw Error('blocked'); values.set(key, value); },
    removeItem(key) { if (blockedStorage) throw Error('blocked'); values.delete(key); }, values,
  }; };
  const scripts = [], deletedCookies = [];
  const location = new URL('https://www.mleko.test/prodavnica?gclid=ad-click&wbraid=braid&email=private%40example.test');
  const window = { localStorage: storage(), sessionStorage: storage(), location };
  const document = {
    referrer: 'https://search.test/search?email=private@example.test',
    get cookie() { return '_ga=123; _gcl_aw=456; session=necessary'; },
    set cookie(value) { deletedCookies.push(value); },
    getElementById(id) { return scripts.find(script => script.id === id); },
    createElement() { return {}; }, head: { appendChild(node) { scripts.push(node); } },
  };
  const ctx = vm.createContext({ window, document, location, URL, crypto, Date, process: { env } });
  function load(file, dependencies) {
    const exports = {};
    ctx.exports = exports; ctx.require = id => dependencies[id];
    vm.runInContext(ts.transpileModule(readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, ctx);
    return exports;
  }
  const attribution = load('app/lib/attribution.ts', { '../../integrations/marketing-attribution.mjs': { mergeTouch } });
  const tags = load('app/lib/marketing-tags.ts', { './attribution': attribution });
  return { ...tags, attribution, scripts, window, deletedCookies, commands: () => (window.dataLayer ?? []).filter(value => 'length' in value).map(value => Array.from(value)) };
}
const direct = { NEXT_PUBLIC_GA4_MEASUREMENT_ID: 'G-TEST', NEXT_PUBLIC_GOOGLE_ADS_ID: 'AW-123', NEXT_PUBLIC_META_PIXEL_ID: '123' };
const denied = { analytics: false, marketing: false };

test('denied default precedes commands and no vendor script loads without consent', () => {
  const r = runtime(direct);
  r.trackMarketingEvent('page_view', {}, denied);
  assert.equal(r.scripts.length, 0);
  assert.equal(r.commands()[0][0], 'consent');
  assert.equal(r.commands()[0][1], 'default');
  assert.equal(r.commands()[0][2].ad_user_data, 'denied');
  assert.equal(r.commands().filter(command => command[0] === 'event').length, 0);
  assert.equal(r.window.localStorage.values.size, 0);
});
test('analytics only excludes advertising scripts, click ids and private URL/referrer parameters', () => {
  const r = runtime(direct), consent = { analytics: true, marketing: false };
  r.attribution.saveConsentPreferences(consent);
  r.trackMarketingEvent('page_view', {}, consent);
  assert.deepEqual(r.scripts.map(script => script.id), ['mleko-ga']);
  const event = r.commands().find(command => command[0] === 'event');
  assert.equal(event[2].send_to, 'G-TEST');
  assert.doesNotMatch(JSON.stringify(r.commands()), /private|ad-click|braid/);
});
test('marketing only supports Ads click ids without analytics identifiers; later GA uses same loader', () => {
  const r = runtime(direct), consent = { analytics: false, marketing: true };
  r.attribution.saveConsentPreferences(consent);
  r.trackMarketingEvent('page_view', {}, consent);
  assert.deepEqual(r.scripts.map(script => script.id), ['mleko-ads', 'mleko-meta']);
  assert.equal(r.window.localStorage.values.has('mleko-i-mleko-anonymous-id'), false);
  const config = r.commands().find(command => command[0] === 'config');
  assert.match(config[2].page_location, /gclid=ad-click/);
  assert.match(config[2].page_location, /wbraid=braid/);
  assert.doesNotMatch(config[2].page_location, /email/);
  r.attribution.saveConsentPreferences({ analytics: true, marketing: true });
  r.trackMarketingEvent('page_view', {}, { analytics: true, marketing: true });
  assert.equal(r.scripts.filter(script => script.src.includes('/gtag/js')).length, 1);
});
test('revocation updates Google and Meta then removes cookies from parent domains', () => {
  const r = runtime(direct), consent = { analytics: true, marketing: true };
  r.attribution.saveConsentPreferences(consent); r.setupMarketingTags(consent);
  r.attribution.saveConsentPreferences(denied); r.updateMarketingConsent(denied); r.attribution.clearAnalyticsStorage();
  const update = r.commands().filter(command => command[0] === 'consent').at(-1);
  assert.equal(update[2].analytics_storage, 'denied'); assert.equal(update[2].ad_personalization, 'denied');
  assert.equal(r.window.fbq.queue.at(-1)[1], 'revoke');
  assert.ok(r.deletedCookies.some(cookie => cookie.includes('domain=.mleko.test')));
  assert.ok(r.deletedCookies.every(cookie => !cookie.startsWith('session=')));
});
test('blocked storage still allows and revokes a choice without crashing', () => {
  const r = runtime({}, true);
  assert.equal(r.attribution.readStoredConsent(), null);
  r.attribution.saveConsentPreferences({ analytics: true, marketing: false });
  assert.equal(r.attribution.getConsentPreferences().analytics, true);
  r.attribution.clearAnalyticsStorage();
  r.attribution.saveConsentPreferences(denied);
  assert.equal(r.attribution.getConsentPreferences().analytics, false);
});
test('GTM stays exclusive and requires both permissions for an unaudited container', () => {
  const r = runtime({ ...direct, NEXT_PUBLIC_GTM_CONTAINER_ID: 'GTM-TEST' });
  r.setupMarketingTags({ analytics: true, marketing: false });
  assert.equal(r.scripts.length, 0);
  r.attribution.saveConsentPreferences({ analytics: true, marketing: true });
  r.trackMarketingEvent('add_to_cart', { valueRsd: 250 }, { analytics: true, marketing: true });
  assert.deepEqual(r.scripts.map(script => script.id), ['mleko-gtm']);
  assert.equal(r.window.dataLayer.at(-1).ecommerce.currency, 'RSD');
  assert.equal(r.window.dataLayer.at(-1).ecommerce.value, 250);
});
