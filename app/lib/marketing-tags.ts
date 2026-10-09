import { analyticsIdentity, getAttributionSnapshot, getConsentPreferences, type Consent } from "./attribution";
type TagWindow = Window & { dataLayer?: unknown[]; gtag?: (...args: unknown[]) => void; fbq?: FacebookQueue; _fbq?: FacebookQueue };
type FacebookQueue = ((...args: unknown[]) => void) & { queue: unknown[][]; callMethod?: (...args: unknown[]) => void; loaded: boolean; version: string; push?: FacebookQueue };
let started = false;
let adsConfigured = false;
let gaConfigured = false;
let lastConsent = "";
const gtm = process.env.NEXT_PUBLIC_GTM_CONTAINER_ID ?? "";
const ga = process.env.NEXT_PUBLIC_GA4_MEASUREMENT_ID ?? "";
const meta = process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "";
const ads = process.env.NEXT_PUBLIC_GOOGLE_ADS_ID ?? "";
function measurementLocation() {
  const url = new URL(location.pathname, location.origin);
  for (const [key, value] of Object.entries(getAttributionSnapshot()?.lastTouch.parameters ?? {})) if (value) url.searchParams.set(key, value);
  if (getConsentPreferences().marketing) {
    const current = new URL(location.href);
    for (const key of ["gclid", "gbraid", "wbraid"]) {
      const value = current.searchParams.get(key)?.slice(0, 200);
      if (value) url.searchParams.set(key, value);
    }
  }
  return url.href;
}
function safeReferrer() {
  try { return document.referrer ? new URL(document.referrer).origin : ""; } catch { return ""; }
}
function script(id: string, src: string) { if (document.getElementById(id)) return; const node = document.createElement("script"); node.id = id; node.async = true; node.src = src; document.head.appendChild(node); }
// Queue the denied default locally; this makes no request to Google.
export function updateMarketingConsent(consent: Consent) {
  const w = window as TagWindow;
  w.dataLayer ??= [];
  // Google expects IArguments, not an Array, in its command queue.
  // eslint-disable-next-line prefer-rest-params
  w.gtag ??= function () { w.dataLayer!.push(arguments); };
  if (!lastConsent) {
    w.gtag("consent", "default", { analytics_storage: "denied", ad_storage: "denied", ad_user_data: "denied", ad_personalization: "denied" });
    w.gtag("set", "ads_data_redaction", true);
    w.gtag("set", "url_passthrough", false);
  }
  const key = `${consent.analytics}:${consent.marketing}`;
  if (lastConsent !== key) {
    w.gtag("consent", "update", { analytics_storage: consent.analytics ? "granted" : "denied", ad_storage: consent.marketing ? "granted" : "denied", ad_user_data: consent.marketing ? "granted" : "denied", ad_personalization: consent.marketing ? "granted" : "denied" });
    w.fbq?.("consent", consent.marketing ? "grant" : "revoke");
    // Update a previously configured tag when marketing permission changes.
    if (gaConfigured) w.gtag("config", ga, { send_page_view: false, allow_google_signals: consent.marketing, allow_ad_personalization_signals: consent.marketing });
    lastConsent = key;
  }
}
export function setupMarketingTags(consent: Consent) {
  updateMarketingConsent(consent);
  const w = window as TagWindow;
  if (!consent.analytics && !consent.marketing) return;
  if (gtm) {
    // A container can run arbitrary third-party tags. Load only after BOTH permissions;
    // container tags must also use consent checks. Never initialize direct vendor tags.
    if (consent.analytics && consent.marketing && /^GTM-[A-Z0-9]+$/.test(gtm) && !started) {
      w.dataLayer!.push({ "gtm.start": Date.now(), event: "gtm.js", analytics_identity: analyticsIdentity() });
      script("mleko-gtm", `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(gtm)}`);
      started = true;
    }
    return;
  }
  if (!started) { w.gtag!("js", new Date()); started = true; }
  const identity = analyticsIdentity();
  if (consent.analytics && /^G-[A-Z0-9]+$/.test(ga) && !gaConfigured) {
    gaConfigured = true;
    w.gtag!("config", ga, { send_page_view: false, client_id: identity?.gaClientId, session_id: Number(identity?.gaSessionId), allow_google_signals: consent.marketing, allow_ad_personalization_signals: consent.marketing, page_referrer: safeReferrer(), page_location: measurementLocation() });
    if (!document.getElementById("mleko-ads")) script("mleko-ga", `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ga)}`);
  }
  if (consent.marketing && /^AW-\d+$/.test(ads) && !adsConfigured) {
    adsConfigured = true;
    w.gtag!("config", ads, { send_page_view: false, page_location: measurementLocation() });
    if (!document.getElementById("mleko-ga")) script("mleko-ads", `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ads)}`);
  }
  if (consent.marketing && /^\d+$/.test(meta) && !w.fbq) {
    const fb: FacebookQueue = Object.assign(function (...args: unknown[]) { if (fb.callMethod) fb.callMethod(...args); else fb.queue.push(args); }, { queue: [] as unknown[][], loaded: true, version: "2.0" });
    fb.push = fb; w.fbq = fb; w._fbq = fb;
    fb("consent", "grant"); fb("init", meta); script("mleko-meta", "https://connect.facebook.net/en_US/fbevents.js");
  }
}
export function trackMarketingEvent(name: string, properties: Record<string, unknown>, consent: Consent) {
  setupMarketingTags(consent);
  if (!consent.analytics && !consent.marketing) return;
  const w = window as TagWindow;
  const attribution = getAttributionSnapshot();
  const campaign = attribution?.lastTouch.parameters;
  const payload: Record<string, unknown> = { ...properties, page_location: measurementLocation(), page_path: location.pathname, page_referrer: safeReferrer() };
  if (campaign) Object.assign(payload, { campaign_source: campaign.utm_source, campaign_medium: campaign.utm_medium, campaign_name: campaign.utm_campaign, campaign_term: campaign.utm_term, campaign_content: campaign.utm_content, ...(consent.marketing ? { gclid: campaign.gclid } : {}) });
  if (typeof payload.valueRsd === "number") { payload.value = payload.valueRsd; payload.currency = "RSD"; delete payload.valueRsd; }
  if (!payload.items && payload.productId) payload.items = [{ item_id: payload.productId, item_name: payload.productName, quantity: payload.quantity ?? 1 }];
  if (gtm) {
    if (consent.analytics && consent.marketing) { w.dataLayer?.push({ ecommerce: null }); w.dataLayer?.push({ event: name, ecommerce: payload, analytics_identity: analyticsIdentity() }); }
    return;
  }
  if (consent.analytics && /^G-[A-Z0-9]+$/.test(ga)) w.gtag?.("event", name, { ...payload, send_to: ga });
  if (consent.marketing && /^\d+$/.test(meta)) {
    const map: Record<string, string> = { page_view: "PageView", view_item: "ViewContent", add_to_cart: "AddToCart", begin_checkout: "InitiateCheckout", add_payment_info: "AddPaymentInfo", subscription_activated: "Subscribe" };
    w.fbq?.(map[name] ? "track" : "trackCustom", map[name] ?? name, { ...payload, content_ids: properties.productId ? [properties.productId] : undefined, content_type: "product" });
  }
}
