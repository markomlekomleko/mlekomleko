"use client";

import { useLocalize } from "@/app/lib/i18n/client";
import { useRef, useState, type FormEvent } from "react";
import { fetchJson } from "../lib/frontend";

/**
 * B2B inquiry for hosting a mlekomat (meeting 17 Nov 2026). It goes through the existing
 * contact endpoint under the "Saradnja" topic, so it lands in the same inbox with the
 * same rate limits and spam trap; the partner details are folded into the message body.
 */
export function PartnerForm() {
  const localize = useLocalize();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const value = (name: string) => String(data.get(name) ?? "").trim();
    const message = [
      "Upit za partnerstvo — mlekomat",
      `Firma / objekat: ${value("company")}`,
      `Lokacija prostora: ${value("location")}`,
      `Vrsta prostora: ${value("space")}`,
      `Telefon: ${value("phone")}`,
      "",
      value("note"),
    ].join("\n");
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      await fetchJson("/api/contact", {
        method: "POST",
        body: JSON.stringify({ name: value("name"), email: value("email"), topic: "Saradnja", message, website: value("website") }),
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
      <h3>Hvala na upitu.</h3>
      <p>Javićemo ti se na ostavljeni email da se dogovorimo oko lokacije.</p>
    </div>
  ));

  return localize((
    <form className="contact-form partner-form" onSubmit={submit} aria-busy={busy}>
      <div className="contact-form-row">
        <label className="field"><span>Ime i prezime</span><input name="name" autoComplete="name" maxLength={100} required /></label>
        <label className="field"><span>Email</span><input name="email" type="email" autoComplete="email" maxLength={254} required /></label>
      </div>
      <div className="contact-form-row">
        <label className="field"><span>Firma ili objekat</span><input name="company" autoComplete="organization" maxLength={120} required /></label>
        <label className="field"><span>Telefon</span><input name="phone" type="tel" autoComplete="tel" maxLength={40} /></label>
      </div>
      <div className="contact-form-row">
        <label className="field"><span>Gde je prostor?</span><input name="location" placeholder="Grad, ulica ili pijaca" maxLength={160} required /></label>
        <label className="field"><span id="partner-space-label">Vrsta prostora</span><select name="space" aria-labelledby="partner-space-label" defaultValue="" required>
          <option value="" disabled>Izaberi</option>
          <option>Pijaca</option><option>Tržni centar</option><option>Prodavnica ili market</option><option>Benzinska pumpa</option><option>Nešto drugo</option>
        </select></label>
      </div>
      <label className="field"><span>Napomena</span><textarea name="note" placeholder="Koliko je mesta, ima li struje, kakav je promet…" rows={4} minLength={10} maxLength={3000} required /></label>
      <div className="contact-trap" aria-hidden="true" data-no-translate><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <p className="contact-privacy">Podatke iz forme koristimo samo da odgovorimo na upit. Pročitaj <a href="/privatnost">politiku privatnosti</a>.</p>
      <div aria-live="polite">{error ? <p className="contact-form-error" role="alert">{error}</p> : null}</div>
      <button className="button contact-submit" type="submit" disabled={busy}>{busy ? "Šaljemo…" : "Postani partner"}<span aria-hidden="true">→</span></button>
    </form>
  ));
}
