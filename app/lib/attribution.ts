import { mergeTouch } from "../../integrations/marketing-attribution.mjs";
export const CONSENT_KEY = "mleko-i-mleko-analytics-consent";
const STORAGE_KEY = "mleko-i-mleko-attribution-v2";
const CAMPAIGN_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid"] as const;
export type Consent = { analytics: boolean; marketing: boolean };
export type AttributionTouch = { landingPath: string; referrerHost?: string; capturedAt: string; parameters: Partial<Record<(typeof CAMPAIGN_KEYS)[number], string>> };
export type AnalyticsIdentity = { anonymousId: string; sessionId: string; gaClientId: string; gaSessionId: string; fbp?: string; fbc?: string };
export type AttributionSnapshot = { firstTouch: AttributionTouch; lastTouch: AttributionTouch; identity?: AnalyticsIdentity };
let currentConsent: Consent | null = null;
export function readStoredConsent(): Consent | null {
  try {
    const raw = window.localStorage.getItem(CONSENT_KEY);
    // Preserve the older analytics-only choice, without granting marketing.
    if (raw === "accepted" || raw === "declined") return { analytics: raw === "accepted", marketing: false };
    const value = JSON.parse(raw ?? "null");
    if (typeof value?.analytics !== "boolean" || typeof value?.marketing !== "boolean") return null;
    return { analytics: value.analytics, marketing: value.marketing };
  } catch { return null; }
}
export function getConsentPreferences(): Consent {
  return currentConsent ?? readStoredConsent() ?? { analytics: false, marketing: false };
}
export function saveConsentPreferences(value: Consent) {
  currentConsent = value;
  try { window.localStorage.setItem(CONSENT_KEY, JSON.stringify({ necessary: true, ...value, updatedAt: new Date().toISOString(), version: 1 })); }
  catch { /* A choice still works for this page when browser storage is unavailable. */ }
}
export function syncStoredConsent() { currentConsent = readStoredConsent(); return currentConsent; }
export function analyticsIdentity(): AnalyticsIdentity | undefined {
  if (!getConsentPreferences().analytics) return undefined;
  try {
    const anonymousId = window.localStorage.getItem("mleko-i-mleko-anonymous-id") || crypto.randomUUID();
    const activeAt = Number(window.sessionStorage.getItem("mleko-i-mleko-session-active-at") || 0);
    const expired = Date.now() - activeAt > 30 * 60_000;
    const sessionId = (!expired && window.sessionStorage.getItem("mleko-i-mleko-session-id")) || crypto.randomUUID();
    const gaSessionId = (!expired && window.sessionStorage.getItem("mleko-i-mleko-ga-session-id")) || String(Math.floor(Date.now() / 1000));
    window.sessionStorage.setItem("mleko-i-mleko-session-active-at", String(Date.now()));
    window.localStorage.setItem("mleko-i-mleko-anonymous-id", anonymousId);
    window.sessionStorage.setItem("mleko-i-mleko-session-id", sessionId);
    window.sessionStorage.setItem("mleko-i-mleko-ga-session-id", gaSessionId);
    const marketing: { fbp?: string; fbc?: string } = {};
    if (getConsentPreferences().marketing) {
      for (const name of ["fbp", "fbc"] as const) {
        const raw = document.cookie.split(";").map(part => part.trim()).find(part => part.startsWith(`_${name}=`))?.slice(name.length + 2);
        if (raw && /^fb\.\d+\.\d+\.[a-zA-Z0-9_-]{1,200}$/.test(raw)) marketing[name] = raw;
      }
    }
    return { anonymousId, sessionId, gaClientId: anonymousId, gaSessionId, ...marketing };
  } catch { return undefined; }
}
function storedSnapshot(): AttributionSnapshot | null {
  try {
    const value = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? "null") as AttributionSnapshot | null;
    return value?.firstTouch && value?.lastTouch && Date.now() - Date.parse(value.lastTouch.capturedAt) < 90 * 86400000 ? value : null;
  } catch { return null; }
}
export function captureAttribution(): AttributionSnapshot | undefined {
  const consent = getConsentPreferences();
  if (!consent.analytics) return undefined;
  const url = new URL(window.location.href);
  const parameters: AttributionTouch["parameters"] = {};
  for (const key of CAMPAIGN_KEYS) {
    if ((key === "gclid" || key === "fbclid") && !consent.marketing) continue;
    const value = url.searchParams.get(key)?.trim().slice(0, 200);
    if (value) parameters[key] = value;
  }
  let referrerHost: string | undefined;
  // document.referrer persists through SPA navigation. It is an entrance only once per document.
  if (!entryCaptured) {
    try { const host = document.referrer ? new URL(document.referrer).hostname : ""; if (host && host !== url.hostname) referrerHost = host.slice(0, 253); } catch { /* Invalid referrer. */ }
  }
  entryCaptured = true;
  const snapshot = mergeTouch(storedSnapshot(), { landingPath: url.pathname.slice(0, 200), referrerHost, capturedAt: new Date().toISOString(), parameters }) as AttributionSnapshot;
  try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot)); } catch { /* Storage may be disabled. */ }
  return { ...snapshot, identity: analyticsIdentity() };
}
let entryCaptured = false;
export function getAttributionSnapshot() { return captureAttribution(); }
export function clearAnalyticsStorage() {
  for (const storageName of ["localStorage", "sessionStorage"] as const) {
    try {
      const storage = window[storageName];
      for (const key of [STORAGE_KEY, "mleko-i-mleko-attribution-v1", "mleko-i-mleko-anonymous-id", "mleko-i-mleko-session-id", "mleko-i-mleko-ga-session-id", "mleko-i-mleko-session-active-at"]) storage.removeItem(key);
    } catch { /* Storage may be blocked by browser privacy settings. */ }
  }
  // Remove first-party cookies left by previously consented vendors as well.
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.split("=")[0].trim();
    if (/^(_ga|_gid|_gat|_gcl_|_fbp|_fbc)/.test(name)) {
      for (const domain of ["", ...window.location.hostname.split(".").map((_, index, parts) => `; domain=.${parts.slice(index).join(".")}`)]) document.cookie = `${name}=; max-age=0; path=/${domain}`;
    }
  }
  entryCaptured = false;
}
