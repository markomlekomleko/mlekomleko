"use client";

import { useLocalize, useLocale } from "@/app/lib/i18n/client";
import { useRef, useState, type FormEvent } from "react";
import { fetchJson } from "../lib/frontend";

/**
 * The two B2B forms on the Mlekomati page (spec 19 Nov 2026, §9). Each request is stored
 * in the system (site_leads, listed in admin) and forwarded to the business email.
 * "mlekomat_space": someone has a space for our mlekomat. "mlekomat_rent": someone wants
 * their own mlekomat — renting is only being prepared, so the copy never sells it as live.
 */
export function LeadForm({ kind }: { kind: "mlekomat_space" | "mlekomat_rent" }) {
  const localize = useLocalize();
  const locale = useLocale();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const space = kind === "mlekomat_space";

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const value = (name: string) => String(data.get(name) ?? "").trim();
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      await fetchJson("/api/leads", {
        method: "POST",
        body: JSON.stringify({ kind, name: value("name"), phone: value("phone"), city: value("city"), address: value("address"), details: value("details"), website: value("website"), locale }),
      });
      form.reset();
      setSent(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Upit nije poslat. Pokušaj ponovo ili nas pozovi.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  if (sent) return localize((
    <div className="contact-success" role="status">
      <span className="contact-success-mark" aria-hidden="true">✓</span>
      <h4>Hvala na upitu.</h4>
      <p>Javićemo ti se na ostavljeni telefon.</p>
    </div>
  ));

  const id = (name: string) => `${kind}-${name}`;
  return localize((
    <form className="contact-form partner-form" onSubmit={submit} aria-busy={busy}>
      <div className="contact-form-row">
        <label className="field" htmlFor={id("name")}><span>Ime i prezime</span><input id={id("name")} name="name" autoComplete="name" maxLength={100} required /></label>
        <label className="field" htmlFor={id("phone")}><span>Telefon</span><input id={id("phone")} name="phone" type="tel" autoComplete="tel" minLength={6} maxLength={40} required /></label>
      </div>
      <div className="contact-form-row">
        <label className="field" htmlFor={id("city")}><span>Grad</span><input id={id("city")} name="city" autoComplete="address-level2" maxLength={80} required /></label>
        {space ? <label className="field" htmlFor={id("address")}><span>Adresa prostora</span><input id={id("address")} name="address" autoComplete="street-address" maxLength={200} required /></label> : null}
      </div>
      {space
        ? <label className="field" htmlFor={id("details")}><span>Opis prostora</span><textarea id={id("details")} name="details" placeholder="Koliko je mesta, ima li struje, kakav je promet…" rows={4} minLength={10} maxLength={3000} required /></label>
        : <label className="field" htmlFor={id("details")}><span>Napomena (opciono)</span><textarea id={id("details")} name="details" rows={3} maxLength={3000} /></label>}
      <div className="contact-trap" aria-hidden="true" data-no-translate><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <p className="contact-privacy">Podatke iz forme koristimo samo da odgovorimo na upit. Pročitaj <a href="/privatnost">politiku privatnosti</a>.</p>
      <div aria-live="polite">{error ? <p className="contact-form-error" role="alert">{error}</p> : null}</div>
      <button className="button contact-submit" type="submit" disabled={busy}>{busy ? "Šaljemo…" : space ? "Pošalji ponudu prostora" : "Javi mi kad krene"}<span aria-hidden="true">→</span></button>
    </form>
  ));
}
