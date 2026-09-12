"use client";

import { useEffect, useState, type FormEvent } from "react";
import { fetchJson } from "../lib/frontend";
import { CodeEntry, type CodeChallenge } from "./code-entry";

export function LoginForm() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [channel, setChannel] = useState("email");
  const [options, setOptions] = useState<{ email: boolean; whatsapp: boolean } | null>(null);
  const [challenge, setChallenge] = useState<CodeChallenge | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetchJson<{ email: boolean; whatsapp: boolean }>("/api/auth/code").then(setOptions).catch(() => setError("Prijava trenutno nije dostupna. Osvežite stranicu."));
  }, []);
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const result = await fetchJson<CodeChallenge>(mode === "register" ? "/api/auth/register" : "/api/auth/code", {
        method: "POST", body: JSON.stringify(mode === "register" ? { email, password } : { email, channel }),
      });
      setChallenge(result); setPassword("");
    } catch (error) { setError(error instanceof Error ? error.message : "Kod trenutno nije moguće poslati."); }
    finally { setBusy(false); }
  }
  return <div className="page-shell narrow" style={{ maxWidth: "760px" }}>
    <header className="page-heading"><p className="eyebrow">Korisnički nalog</p><h1 style={{ fontSize: "clamp(2.5rem, 5vw, 3.5rem)", lineHeight: 1.1 }}>{mode === "register" ? "Napravite svoj nalog" : "Prijavite se kodom"}</h1>
      <p className="lead">{mode === "register" ? "Izaberite email i lozinku. Potvrdite email kodom, a zatim u nalogu povežite WhatsApp." : "Unesite email svog naloga i izaberite gde želite da primite jednokratni kod."}</p>
    </header>
    {challenge ? <CodeEntry challenge={challenge} onBack={() => setChallenge(null)} onVerified={() => { window.location.assign("/nalog"); }} /> : <>
      <div className="button-row" style={{ marginBottom: "1rem" }} aria-label="Pristup nalogu">
        <button className={`button ${mode === "login" ? "" : "secondary"}`} aria-pressed={mode === "login"} disabled={busy} onClick={() => { setMode("login"); setError(""); setPassword(""); }}>Imam nalog</button>
        <button className={`button ${mode === "register" ? "" : "secondary"}`} aria-pressed={mode === "register"} disabled={busy} onClick={() => { setMode("register"); setError(""); }}>Napravi nalog</button>
      </div>
      <form className="card form-stack" onSubmit={submit}>
        <label className="field"><span>Email adresa</span><input type="email" autoComplete="email" maxLength={254} value={email} onChange={event => setEmail(event.target.value)} required /></label>
        {mode === "register" ? <label className="field"><span id="registration-password-label">Lozinka</span><input aria-labelledby="registration-password-label" type="password" autoComplete="new-password" minLength={12} maxLength={128} value={password} onChange={event => setPassword(event.target.value)} required aria-describedby="password-help" /><small id="password-help">Od 12 do 128 znakova. Pri sledećoj prijavi koristite jednokratni kod.</small></label> : <label className="field"><span>Gde da pošaljemo kod?</span><select value={channel} onChange={event => setChannel(event.target.value)}>
          <option value="email" disabled={options?.email === false}>Email</option><option value="whatsapp" disabled={!options?.whatsapp}>WhatsApp</option><option value="both" disabled={!options?.email || !options?.whatsapp}>Email i WhatsApp</option>
        </select><small>WhatsApp je dostupan tek kada potvrdite broj u svom nalogu.</small></label>}
        {options && !options.email && !options.whatsapp ? <p className="notice" role="status">Prijava kodom još nije aktivirana. Pokušajte kasnije.</p> : null}
        {error ? <p className="notice error" role="alert">{error}</p> : null}
        <button className="button" disabled={busy || !options || (mode === "register" ? !options.email : channel === "email" ? !options.email : !options.whatsapp)}>{busy ? "Pripremamo kod…" : mode === "register" ? "Napravi nalog i pošalji kod" : "Pošalji kod za prijavu"}</button>
        {mode === "login" ? <p className="muted">Prvi put ste ovde ili ste ranije pristupali linkom? Izaberite „Napravi nalog“ i upotrebite email sa svojih porudžbina.</p> : <p className="muted">Vaše postojeće porudžbine povezaćemo sa nalogom nakon potvrde emaila. <a href="/privatnost">Politika privatnosti</a>.</p>}
      </form>
    </>}
  </div>;
}
