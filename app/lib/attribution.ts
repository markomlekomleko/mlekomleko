const STORAGE_KEY = "mleko-i-mleko-attribution-v1";
const CAMPAIGN_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid"] as const;

export type AttributionTouch = {
  landingPath: string;
  referrerHost?: string;
  capturedAt: string;
  parameters: Partial<Record<(typeof CAMPAIGN_KEYS)[number], string>>;
};

export type AttributionSnapshot = { firstTouch: AttributionTouch; lastTouch: AttributionTouch };

function safeTouch(): AttributionTouch {
  const url = new URL(window.location.href);
  const parameters: AttributionTouch["parameters"] = {};
  for (const key of CAMPAIGN_KEYS) {
    const value = url.searchParams.get(key)?.trim().slice(0, 200);
    if (value) parameters[key] = value;
  }
  let referrerHost: string | undefined;
  try { referrerHost = document.referrer ? new URL(document.referrer).hostname.slice(0, 253) : undefined; } catch { /* Ignore invalid browser referrers. */ }
  return { landingPath: url.pathname.slice(0, 200), referrerHost, capturedAt: new Date().toISOString(), parameters };
}

function storedSnapshot(): AttributionSnapshot | null {
  try {
    const parsed = JSON.parse(window.sessionStorage.getItem(STORAGE_KEY) ?? "null") as AttributionSnapshot | null;
    return parsed?.firstTouch && parsed?.lastTouch ? parsed : null;
  } catch { return null; }
}

export function captureAttribution(): AttributionSnapshot {
  const previous = storedSnapshot();
  const touch = safeTouch();
  const snapshot = { firstTouch: previous?.firstTouch ?? touch, lastTouch: touch };
  window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  return snapshot;
}

export function getAttributionSnapshot(): AttributionSnapshot {
  return storedSnapshot() ?? captureAttribution();
}
