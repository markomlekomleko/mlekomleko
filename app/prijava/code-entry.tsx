"use client";

import { useEffect, useState, type FormEvent } from "react";
import { fetchJson } from "../lib/frontend";

export type CodeChallenge = { challengeId: string; expiresAt: string; channel: "email" | "whatsapp" | "both"; retryAfter: number; localDevelopment?: { code: string } };

export function CodeEntry({ challenge, onVerified, onBack }: { challenge: CodeChallenge; onVerified: () => void; onBack: () => void }) {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(challenge.retryAfter);
  useEffect(() => {
    const timer = setInterval(() => setWait(value => Math.max(0, value - 1)), 1000);
    return () => clearInterval(timer);
  }, []);
  async function verify(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      await fetchJson("/api/auth/code/verify", { method: "POST", body: JSON.stringify({ challengeId: challenge.challengeId, code }) });
      onVerified();
    } catch (error) { setError(error instanceof Error ? error.message : "Kod nije moguće proveriti."); }
    finally { setBusy(false); }
  }
  return <form className="card form-stack" onSubmit={verify}>
    <h2>Unesite kod</h2>
    <p role="status">{challenge.channel === "email" ? "Proverite email i spam fasciklu." : challenge.channel === "whatsapp" ? "Proverite poruke na potvrđenom WhatsApp broju." : "Proverite email i WhatsApp. Dovoljan je kod iz jedne poruke."} Ako nalog ispunjava uslove, dobićete kod koji važi 5 minuta.</p>
    <label className="field"><span>Šestocifreni kod</span><input autoComplete="one-time-code" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ""))} required /></label>
    {challenge.localDevelopment ? <p className="notice" data-testid="local-auth-code">Lokalni razvoj — kod: <strong>{challenge.localDevelopment.code}</strong></p> : null}
    {error ? <p className="notice error" role="alert">{error}</p> : null}
    <button className="button" disabled={busy || code.length !== 6}>{busy ? "Proveravamo…" : "Potvrdi kod"}</button>
    <button className="button secondary" type="button" onClick={onBack} disabled={busy || wait > 0}>{wait > 0 ? `Novi kod za ${wait} s` : "Zatraži novi kod ili promeni podatke"}</button>
  </form>;
}
