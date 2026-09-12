"use client";

import { useEffect, useState, type FormEvent } from "react";
import { fetchJson } from "../lib/frontend";
import { CodeEntry, type CodeChallenge } from "../prijava/code-entry";

type Settings = { registered: boolean; email: string; whatsappPhone: string | null; whatsappVerified: boolean; whatsappAvailable: boolean; notifications: boolean };

export function LoginSettings() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [challenge, setChallenge] = useState<CodeChallenge | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  async function load() {
    try { setSettings(await fetchJson<Settings>("/api/account/login-settings")); }
    catch (error) { setError(error instanceof Error ? error.message : "Podešavanja nisu dostupna."); }
  }
  useEffect(() => { queueMicrotask(() => void load()); }, []);
  async function requestCode(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    try { setChallenge(await fetchJson<CodeChallenge>("/api/account/whatsapp", { method: "POST", body: JSON.stringify({ phone, consent }) })); }
    catch (error) { setError(error instanceof Error ? error.message : "Kod nije moguće poslati."); }
    finally { setBusy(false); }
  }
  async function update(body: Record<string, unknown>) {
    setBusy(true); setError(""); setNotice("");
    try {
      setSettings(await fetchJson<Settings>("/api/account/login-settings", { method: "PATCH", body: JSON.stringify(body) }));
      setNotice(body.action === "disconnect" ? "WhatsApp broj je uklonjen. I dalje možete da se prijavite email kodom." : "Podešavanja obaveštenja su sačuvana.");
    } catch (error) { setError(error instanceof Error ? error.message : "Podešavanja nisu sačuvana."); }
    finally { setBusy(false); }
  }
  return <section className="card form-stack" aria-labelledby="login-settings-title">
    <h2 id="login-settings-title">Prijava i WhatsApp</h2>
    {error ? <p className="notice error" role="alert">{error}</p> : null}
    {notice ? <p className="notice success" role="status">{notice}</p> : null}
    {!settings ? <p>Učitavamo podešavanja…</p> : !settings.registered ? <p>Za prijavu kodom prvo <a href="/prijava">napravite nalog</a> sa email adresom {settings.email}.</p> : <>
      <p>Email za prijavu: <strong>{settings.email}</strong></p>
      {settings.whatsappVerified ? <>
        <p>Potvrđen WhatsApp broj: <strong>{settings.whatsappPhone}</strong></p>
        <label className="checkbox"><input type="checkbox" checked={settings.notifications} disabled={busy} onChange={event => void update({ notifications: event.target.checked })} /> Želim WhatsApp obaveštenja o svojim porudžbinama i dostavama.</label>
        <button className="button secondary" disabled={busy} onClick={() => void update({ action: "disconnect" })}>Ukloni WhatsApp broj</button>
      </> : challenge ? <CodeEntry challenge={challenge} onBack={() => setChallenge(null)} onVerified={() => { setChallenge(null); setNotice("WhatsApp broj je potvrđen. Sada možete da primate kodove za prijavu."); void load(); }} /> : settings.whatsappAvailable ? <form className="form-stack" onSubmit={requestCode}>
        <p>Povežite svoj broj za prijavu putem WhatsApp-a. Broj za dostavu ne povezujemo automatski.</p>
        <label className="field"><span>WhatsApp broj</span><input type="tel" autoComplete="tel" placeholder="+381601234567" maxLength={40} value={phone} onChange={event => setPhone(event.target.value)} required /></label>
        <label className="checkbox"><input type="checkbox" checked={consent} onChange={event => setConsent(event.target.checked)} required /> Želim da primam tražene kodove za prijavu na ovaj WhatsApp broj.</label>
        <button className="button" disabled={busy || !consent}>{busy ? "Šaljemo kod…" : "Potvrdi WhatsApp broj"}</button>
      </form> : <p>WhatsApp povezivanje uskoro će biti dostupno. Za prijavu koristite kod putem emaila.</p>}
    </>}
  </section>;
}
