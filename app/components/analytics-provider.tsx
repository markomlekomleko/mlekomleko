"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { analyticsIdentity, captureAttribution, clearAnalyticsStorage, CONSENT_KEY, getConsentPreferences, readStoredConsent, saveConsentPreferences, syncStoredConsent } from "../lib/attribution";
import { trackMarketingEvent, updateMarketingConsent } from "../lib/marketing-tags";
export { getConsentPreferences } from "../lib/attribution";

type AnalyticsContextValue = {
  consent: { analytics: boolean; marketing: boolean } | null;
  track: (eventName: string, properties?: Record<string, unknown>, orderId?: string) => void;
  openSettings: () => void;
};

const AnalyticsContext = createContext<AnalyticsContextValue | null>(null);
const DEFAULT_CONSENT = { analytics: false, marketing: false };

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const [consent, setConsent] = useState<AnalyticsContextValue["consent"]>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selection, setSelection] = useState(DEFAULT_CONSENT);
  const pathname = usePathname();
  const lastPageView = useRef("");

  useEffect(() => {
    updateMarketingConsent(getConsentPreferences());
    const stored = readStoredConsent();
    if (stored) queueMicrotask(() => setConsent(stored));
    const synchronize = (event: StorageEvent) => {
      if (event.key !== CONSENT_KEY && event.key !== null) return;
      const next = syncStoredConsent();
      updateMarketingConsent(next ?? DEFAULT_CONSENT);
      if (!next?.analytics || !next?.marketing) clearAnalyticsStorage();
      // Removes already loaded vendor listeners in this tab after changes elsewhere.
      window.location.reload();
    };
    window.addEventListener("storage", synchronize);
    return () => window.removeEventListener("storage", synchronize);
  }, []);

  const track = useCallback((eventName: string, properties: Record<string, unknown> = {}, orderId?: string) => {
    const preferences = getConsentPreferences();
    if (!preferences.analytics && !preferences.marketing) return;
    const attribution = captureAttribution();
    trackMarketingEvent(eventName, properties, preferences);
    const identity = analyticsIdentity();
    if (!preferences.analytics || !identity) return;
    void fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        consent: true,
        eventName,
        anonymousId: identity.anonymousId,
        sessionId: identity.sessionId,
        orderId,
        path: window.location.pathname,
        properties: { ...properties, attribution },
      }),
    }).catch(() => { /* Analytics must never block shopping. */ });
  }, []);

  useEffect(() => {
    const key = `${pathname}:${consent?.analytics}:${consent?.marketing}`;
    if ((consent?.analytics || consent?.marketing) && lastPageView.current !== key) { lastPageView.current = key; track("page_view", { title: document.title }); }
  }, [consent, pathname, track]);

  const decide = (value: { analytics: boolean; marketing: boolean }) => {
    const previous = getConsentPreferences();
    if ((previous.analytics && !value.analytics) || (previous.marketing && !value.marketing) || (!value.analytics && !value.marketing)) clearAnalyticsStorage();
    saveConsentPreferences(value);
    updateMarketingConsent(value);
    setConsent(value);
    setSettingsOpen(false);
    // Reload removes listeners installed by previously allowed vendor scripts.
    if ((previous.analytics && !value.analytics) || (previous.marketing && !value.marketing)) window.location.reload();
  };

  const value = useMemo(() => ({ consent, track, openSettings: () => { setSelection(getConsentPreferences()); setSettingsOpen(true); } }), [consent, track]);
  return (
    <AnalyticsContext.Provider value={value}>
      {children}
      {consent === null || settingsOpen ? (
        <section className="consent-banner" aria-label="Podešavanja kolačića" role="dialog" aria-modal="false">
          <div>
            <strong id="consent-heading">Privatnost je pod vašom kontrolom</strong>
            <p>Neophodni kolačići čuvaju korpu i prijavu. Analitika i marketing su odvojeni i ne pokreću se bez vaše dozvole.</p>
          </div>
          {settingsOpen ? (
            <fieldset className="consent-options">
              <legend>Izaberite dozvole</legend>
              <label><input type="checkbox" checked disabled /> Neophodni kolačići — uvek uključeni</label>
              <label><input type="checkbox" checked={selection.analytics} onChange={event => setSelection(previous => ({ ...previous, analytics: event.target.checked }))} /> Analitika — posete i korišćenje prodavnice</label>
              <label><input type="checkbox" checked={selection.marketing} onChange={event => setSelection(previous => ({ ...previous, marketing: event.target.checked }))} /> Marketing — merenje i personalizacija oglasa</label>
              <button className="button secondary small" type="button" onClick={() => decide(selection)}>Sačuvaj izbor</button>
            </fieldset>
          ) : null}
          <div className="button-row compact">
            <button className="button secondary small" type="button" onClick={() => decide(DEFAULT_CONSENT)}>Samo neophodno</button>
            <button className="button secondary small" type="button" onClick={() => decide({ analytics: true, marketing: false })}>Dozvoli analitiku</button>
            <button className="button small" type="button" onClick={() => decide({ analytics: true, marketing: true })}>Dozvoli sve</button>
          </div>
          {!settingsOpen ? <button className="footer-cookie-button" type="button" onClick={() => { setSelection(consent ?? DEFAULT_CONSENT); setSettingsOpen(true); }}>Prilagodi izbor</button> : consent !== null ? <button className="footer-cookie-button" type="button" onClick={() => setSettingsOpen(false)}>Zatvori podešavanja</button> : null}
          <a className="text-link small-text" href="/privatnost">Kako koristimo kolačiće</a>
        </section>
      ) : null}
    </AnalyticsContext.Provider>
  );
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
