"use client";

import { useLocalize, useLocale } from "@/app/lib/i18n/client";
import { useRef, useState, type FormEvent } from "react";
import { fetchJson } from "../lib/frontend";
import { ProductCarousel } from "./product-carousel";

/**
 * Goat milk is not on sale right now (spec 19 Nov 2026, §5). Its card stays in the shop,
 * in the goat colours, and collects an email for a note when it is available again.
 * When the owner re-activates the goat product in admin, the shop shows the normal
 * purchase card instead and this one disappears.
 */
export function GoatWaitlistCard() {
  const localize = useLocalize();
  const locale = useLocale();
  const [state, setState] = useState<"idle" | "busy" | "sent">("idle");
  const [error, setError] = useState("");
  const submitting = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const data = new FormData(event.currentTarget);
    submitting.current = true;
    setState("busy");
    setError("");
    try {
      await fetchJson("/api/leads", { method: "POST", body: JSON.stringify({ kind: "goat_waitlist", email: String(data.get("email") ?? ""), website: String(data.get("website") ?? ""), locale }) });
      setState("sent");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Prijava nije poslata. Pokušaj ponovo.");
      setState("idle");
    } finally {
      submitting.current = false;
    }
  }

  return localize((
    <article className="configurator configurator-card goat-waitlist" data-kind="goat" data-available="false">
      <ProductCarousel kind="goat" name="Kozje mleko" />
      <div className="configurator-body">
        <div className="configurator-head">
          <h3 className="configurator-title">Kozje mleko</h3>
          <p className="goat-waitlist-badge">Sezonski nedostupno</p>
        </div>
        <p className="configurator-note">Kozje mleko je trenutno nedostupno zbog sezone jarenja. Ostavi nam svoj mejl i obavestićemo te čim ponovo bude dostupno.</p>
        {state === "sent" ? (
          <p className="goat-waitlist-done" role="status">✓ Hvala! Javićemo ti se čim kozje mleko bude dostupno.</p>
        ) : (
          <form className="goat-waitlist-form" onSubmit={submit} aria-busy={state === "busy"}>
            <label className="field"><span>Tvoj email</span><input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
            <div className="contact-trap" aria-hidden="true" data-no-translate><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
            <div aria-live="polite">{error ? <p className="configurator-error" role="alert">{error}</p> : null}</div>
            <button className="button" type="submit" disabled={state === "busy"}>{state === "busy" ? "Šaljemo…" : "Obavesti me"}</button>
          </form>
        )}
      </div>
    </article>
  ));
}
