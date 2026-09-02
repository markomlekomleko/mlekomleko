"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

type AnalyticsContextValue = {
  consent: "accepted" | "declined" | "unset";
  track: (eventName: string, properties?: Record<string, string | number | boolean | null>, orderId?: string) => void;
};

const AnalyticsContext = createContext<AnalyticsContextValue | null>(null);
const CONSENT_KEY = "mleko-i-mleko-analytics-consent";

function createId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function AnalyticsProvider({ children }: { children: ReactNode }) {
  const [consent, setConsent] = useState<AnalyticsContextValue["consent"]>("unset");
  const anonymousId = useRef("");
  const sessionId = useRef("");

  useEffect(() => {
    anonymousId.current = window.localStorage.getItem("mleko-i-mleko-anonymous-id") || createId();
    sessionId.current = window.sessionStorage.getItem("mleko-i-mleko-session-id") || createId();
    window.localStorage.setItem("mleko-i-mleko-anonymous-id", anonymousId.current);
    window.sessionStorage.setItem("mleko-i-mleko-session-id", sessionId.current);
    const stored = window.localStorage.getItem(CONSENT_KEY);
    if (stored === "accepted" || stored === "declined") queueMicrotask(() => setConsent(stored));
  }, []);

  const track = useCallback((eventName: string, properties: Record<string, string | number | boolean | null> = {}, orderId?: string) => {
    if (window.localStorage.getItem(CONSENT_KEY) !== "accepted") return;
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
  }, []);

  useEffect(() => {
    if (consent === "accepted") track("page_view", { title: document.title });
  }, [consent, track]);

  const decide = (value: "accepted" | "declined") => {
    window.localStorage.setItem(CONSENT_KEY, value);
    setConsent(value);
  };

  const value = useMemo(() => ({ consent, track }), [consent, track]);
  return (
    <AnalyticsContext.Provider value={value}>
      {children}
      {consent === "unset" ? (
        <section className="consent-banner" aria-label="Podešavanja analitike">
          <div>
            <strong>Privatnost je pod vašom kontrolom</strong>
            <p>Anonimna analitika nam pomaže da poboljšamo kupovinu. Ne pokrećemo je bez vaše dozvole.</p>
          </div>
          <div className="button-row compact">
            <button className="button secondary small" type="button" onClick={() => decide("declined")}>Samo neophodno</button>
            <button className="button small" type="button" onClick={() => decide("accepted")}>Dozvoli analitiku</button>
          </div>
        </section>
      ) : null}
    </AnalyticsContext.Provider>
  );
}

export function useAnalytics() {
  const value = useContext(AnalyticsContext);
  if (!value) throw new Error("useAnalytics mora biti korišćen unutar AnalyticsProvider-a.");
  return value;
}
