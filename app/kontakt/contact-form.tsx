"use client";

import { useRef, useState, type FormEvent } from "react";
import { fetchJson } from "../lib/frontend";

export function ContactForm() {
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const submitting = useRef(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current) return;
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form));
    submitting.current = true;
    setBusy(true);
    setError("");
    try {
      await fetchJson("/api/contact", { method: "POST", body: JSON.stringify(values) });
      form.reset();
      setSent(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Poruka nije poslata. Pokušaj ponovo ili nas pozovi.");
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }

  if (sent) return (
    <div className="contact-success" role="status">
      <span className="contact-success-mark" aria-hidden="true">✓</span>
      <h3>Hvala što si nam pisao/la.</h3>
      <p>Poruka je poslata. Odgovorićemo ti na email koji si ostavio/la.</p>
      <button type="button" className="button secondary" onClick={() => setSent(false)}>Nova poruka</button>
    </div>
  );

  return (
    <form className="contact-form" onSubmit={submit} aria-busy={busy}>
      <div className="contact-form-row">
        <label className="field"><span>Ime</span><input name="name" autoComplete="given-name" placeholder="Tvoje ime" maxLength={100} required /></label>
        <label className="field"><span>Email</span><input name="email" type="email" autoComplete="email" placeholder="tvoj@email.rs" maxLength={254} required /></label>
      </div>
      <div className="contact-form-row">
        <label className="field"><span id="contact-topic-label">Tema</span><select name="topic" aria-labelledby="contact-topic-label" defaultValue="" required>
          <option value="" disabled>O čemu želiš da nam pišeš?</option>
          <option>Proizvodi</option><option>Dostava</option><option>Moja porudžbina</option><option>Saradnja</option><option>Nešto drugo</option>
        </select></label>
        <label className="field"><span>Broj porudžbine <small>(opciono)</small></span><input name="orderNumber" placeholder="Ako ga imaš pri ruci" maxLength={80} /></label>
      </div>
      <label className="field"><span>Poruka</span><textarea name="message" placeholder="Kako možemo da pomognemo?" rows={6} minLength={10} maxLength={5000} required /></label>
      <div className="contact-trap" aria-hidden="true"><label>Website<input name="website" tabIndex={-1} autoComplete="off" /></label></div>
      <p className="contact-privacy">Podatke iz forme koristimo da odgovorimo na tvoj upit. Pročitaj <a href="/privatnost">politiku privatnosti</a>.</p>
      <div aria-live="polite">{error ? <p className="contact-form-error" role="alert">{error} Možeš nas pozvati na <a href="tel:+381605022323">060 502 23 23</a>.</p> : null}</div>
      <button className="button contact-submit" type="submit" disabled={busy}>{busy ? "Šaljemo…" : "Pošalji poruku"}<span aria-hidden="true">→</span></button>
    </form>
  );
}
