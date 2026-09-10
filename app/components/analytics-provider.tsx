"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { captureAttribution } from "../lib/attribution";

type AnalyticsContextValue = {
  consent: { analytics: boolean; marketing: boolean } | null;
  track: (eventName: string, properties?: Record<string, string | number | boolean | null>, orderId?: string) => void;
  openSettings: () => void;
};

const AnalyticsContext = createContext<AnalyticsContextValue | null>(null);
const CONSENT_KEY = "mleko-i-mleko-analytics-consent";
const DEFAULT_CONSENT = { analytics: false, marketing: false };

function createId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const [consent, setConsent] = useState<AnalyticsContextValue["consent"]>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const anonymousId = useRef("");
  const sessionId = useRef("");

  const ensureIds = useCallback(() => {
    anonymousId.current ||= window.localStorage.getItem("mleko-i-mleko-anonymous-id") || createId();
    sessionId.current ||= window.sessionStorage.getItem("mleko-i-mleko-session-id") || createId();
    window.localStorage.setItem("mleko-i-mleko-anonymous-id", anonymousId.current);
    window.sessionStorage.setItem("mleko-i-mleko-session-id", sessionId.current);
  }, []);

  useEffect(() => {
    ensureIds();
    captureAttribution();
    const stored = window.localStorage.getItem(CONSENT_KEY);
    try {
      const parsed = JSON.parse(stored ?? "null") as { analytics?: boolean; marketing?: boolean } | null;
      if (parsed) queueMicrotask(() => setConsent({ analytics: parsed.analytics === true, marketing: parsed.marketing === true }));
      else if (stored === "accepted" || stored === "declined") queueMicrotask(() => setConsent({ analytics: stored === "accepted", marketing: false }));
    } catch { /* Corrupt preferences are treated as unset. */ }
  }, [ensureIds]);

  const track = useCallback((eventName: string, properties: Record<string, string | number | boolean | null> = {}, orderId?: string) => {
    let preferences: { analytics?: boolean } | null = null;
    try { preferences = JSON.parse(window.localStorage.getItem(CONSENT_KEY) ?? "null") as { analytics?: boolean } | null; } catch { return; }
    if (preferences?.analytics !== true) return;
    ensureIds();
    void fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        consent: true,
        eventName,
        anonymousId: anonymousId.current,
        sessionId: sessionId.current,
        orderId,
        path: window.location.pathname,
        properties,
      }),
    });
  }, [ensureIds]);

  useEffect(() => {
    if (consent?.analytics) track("page_view", { title: document.title });
  }, [consent, track]);

  const decide = (value: { analytics: boolean; marketing: boolean }) => {
    window.localStorage.setItem(CONSENT_KEY, JSON.stringify({ necessary: true, ...value, updatedAt: new Date().toISOString() }));
    setConsent(value);
    setSettingsOpen(false);
  };

  const value = useMemo(() => ({ consent, track, openSettings: () => setSettingsOpen(true) }), [consent, track]);
  return (
    <AnalyticsContext.Provider value={value}>
      {children}
      {consent === null || settingsOpen ? (
        <section className="consent-banner" aria-label="Podešavanja kolačića" role="dialog" aria-modal="true">
          <div>
            <strong>Privatnost je pod vašom kontrolom</strong>
            <p>Neophodni kolačići čuvaju korpu i prijavu. Analitika i marketing su odvojeni i ne pokreću se bez vaše dozvole.</p>
          </div>
          <div className="button-row compact">
            <button className="button secondary small" type="button" onClick={() => decide(DEFAULT_CONSENT)}>Samo neophodno</button>
            <button className="button secondary small" type="button" onClick={() => decide({ analytics: true, marketing: false })}>Dozvoli analitiku</button>
            <button className="button small" type="button" onClick={() => decide({ analytics: true, marketing: true })}>Dozvoli sve</button>
          </div>
          <a className="text-link small-text" href="/privatnost">Kako koristimo kolačiće</a>
        </section>
      ) : null}
    </AnalyticsContext.Provider>
  );
}

export function getConsentPreferences() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CONSENT_KEY) ?? "null") as { analytics?: boolean; marketing?: boolean } | null;
    return { analytics: parsed?.analytics === true, marketing: parsed?.marketing === true };
  } catch { return DEFAULT_CONSENT; }
}

export function CookieSettingsButton() {
  const { openSettings } = useAnalytics();
  return <button className="footer-cookie-button" type="button" onClick={openSettings}>Podešavanja kolačića</button>;
}

export function useAnalytics() {
  const value = useContext(AnalyticsContext);
  if (!value) throw new Error("useAnalytics mora biti korišćen unutar AnalyticsProvider-a.");
  return value;
}
