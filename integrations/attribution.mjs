import { ANALYTICS_EVENTS } from "./contracts.mjs";

const UTM_KEYS = Object.freeze([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "fbclid",
]);
const PII_KEYS = new Set([
  "email",
  "e_mail",
  "phone",
  "telephone",
  "name",
  "first_name",
  "last_name",
  "full_name",
  "address",
  "street",
  "postal_code",
  "zip",
  "customer_email",
  "customer_phone",
  "customer_name",
  "shipping_address",
  "billing_address",
]);

function clean(value, maxLength = 200) {
  if (typeof value !== "string") return null;
  const normalized = Array.from(value)
    .filter((character) => {
      const codePoint = character.codePointAt(0) ?? 0;
      return codePoint > 31 && codePoint !== 127;
    })
    .join("")
    .trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

function parseLandingUrl(rawUrl) {
  try {
    return new URL(rawUrl, "http://local.invalid");
  } catch {
    throw new TypeError("landingUrl must be a valid absolute or relative URL.");
  }
}

function sourceFrom(url, referrer) {
  const explicit = clean(url.searchParams.get("utm_source"));
  if (explicit) return explicit;
  if (url.searchParams.has("gclid")) return "google";
  if (url.searchParams.has("fbclid")) return "facebook";
  if (referrer) {
    try {
      return new URL(referrer).hostname.slice(0, 200);
    } catch {
      return "referral";
    }
  }
  return "direct";
}

function mediumFrom(url, referrer) {
  const explicit = clean(url.searchParams.get("utm_medium"));
  if (explicit) return explicit;
  if (url.searchParams.has("gclid")) return "cpc";
  if (url.searchParams.has("fbclid")) return "paid_social";
  return referrer ? "referral" : "none";
}

/** Captures first/last touch without collecting contact or checkout fields. */
export function captureAttribution({
  landingUrl,
  referrer = "",
  previous = null,
  now = new Date().toISOString(),
}) {
  const url = parseLandingUrl(landingUrl);
  const parameters = {};
  for (const key of UTM_KEYS) {
    const value = clean(url.searchParams.get(key));
    if (value) parameters[key] = value;
  }
  const touch = Object.freeze({
    source: sourceFrom(url, referrer),
    medium: mediumFrom(url, referrer),
    campaign: clean(url.searchParams.get("utm_campaign")),
    // The complete query can contain checkout PII. Keep the path and only the
    // explicitly allowlisted campaign parameters above.
    landingPath: clean(url.pathname, 500),
    referrerHost: (() => {
      try {
        return referrer ? clean(new URL(referrer).hostname) : null;
      } catch {
        return null;
      }
    })(),
    parameters: Object.freeze(parameters),
    capturedAt: now,
  });
  return Object.freeze({
    firstTouch: previous?.firstTouch ?? touch,
    lastTouch: touch,
  });
}

export function normalizeConsent(consent = {}) {
  return Object.freeze({
    necessary: true,
    analytics: consent.analytics === true,
    marketing: consent.marketing === true,
  });
}

export function canDispatchTo(destination, consent) {
  const current = normalizeConsent(consent);
  if (destination === "necessary") return true;
  if (["ga4", "gtm"].includes(destination)) return current.analytics;
  if (["google_ads", "meta"].includes(destination)) return current.marketing;
  return false;
}

function scrubPii(value, depth = 0) {
  if (depth > 5) return null;
  if (Array.isArray(value)) return value.slice(0, 100).map((item) => scrubPii(item, depth + 1));
  if (!value || typeof value !== "object") {
    if (typeof value === "string") return clean(value, 500);
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !PII_KEYS.has(key.toLowerCase()))
      .map(([key, item]) => [key, scrubPii(item, depth + 1)]),
  );
}

/** Produces a consent-gated, PII-scrubbed e-commerce event. */
export function buildAnalyticsEvent(name, payload, consent) {
  if (!ANALYTICS_EVENTS.includes(name)) {
    throw new TypeError(`Unsupported analytics event: ${name}.`);
  }
  if (!canDispatchTo("ga4", consent)) return null;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new TypeError("Analytics payload must be an object.");
  }
  return Object.freeze({
    name,
    payload: Object.freeze(scrubPii(payload)),
  });
}

export const ATTRIBUTION_KEYS = UTM_KEYS;
