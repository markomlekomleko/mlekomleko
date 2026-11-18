"use client";
import { localizedPath } from "../lib/i18n/routing";

import { useLocalize, useLocale } from "@/app/lib/i18n/client";
import { useEffect, useState, type FormEvent } from "react";
import { fetchJson } from "../lib/frontend";
import { useAnalytics } from "../components/analytics-provider";
import { CodeEntry, type CodeChallenge } from "./code-entry";

/** Google's four-colour "G", as their sign-in branding guidelines ask for. */
function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

export function LoginForm() {
  const localize = useLocalize();
  const locale = useLocale();
  const { track } = useAnalytics();
  const [googleNote, setGoogleNote] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [channel, setChannel] = useState("email");
  const [options, setOptions] = useState<{
    email: boolean;
    whatsapp: boolean;
    demo?: boolean;
  } | null>(null);
  const [challenge, setChallenge] = useState<CodeChallenge | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    fetchJson<{ email: boolean; whatsapp: boolean; demo?: boolean }>("/api/auth/code")
      .then(setOptions)
      .catch(() =>
        setError("Prijava trenutno nije dostupna. Osvežite stranicu."),
      );
  }, []);
  async function openDemo() {
    setBusy(true);
    setError("");
    try {
      await fetchJson("/api/auth/demo", { method: "POST" });
      window.location.assign(localizedPath("/nalog", locale));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Demo nalog trenutno nije dostupan.");
      setBusy(false);
    }
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const result = await fetchJson<CodeChallenge>(
        mode === "register" ? "/api/auth/register" : "/api/auth/code",
        {
          method: "POST",
          body: JSON.stringify(
            mode === "register" ? { email } : { email, channel },
          ),
        },
      );
      setChallenge(result);
      track("account_login_requested", {
        channel: mode === "register" ? "email" : channel,
      });
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Kod trenutno nije moguće poslati.",
      );
    } finally {
      setBusy(false);
    }
  }
  return localize((
    <div className="page-shell narrow" style={{ maxWidth: "760px" }}>
      <header className="page-heading">
        <p className="eyebrow">Korisnički nalog</p>
        <h1 style={{ fontSize: "clamp(2.5rem, 5vw, 3.5rem)", lineHeight: 1.1 }}>
          {mode === "register" ? "Napravite svoj nalog" : "Prijavite se kodom"}
        </h1>
        <p className="lead">
          {mode === "register"
            ? "Unesite email i potvrdite ga jednokratnim kodom. Lozinka nije potrebna."
            : "Unesite email svog naloga i izaberite gde želite da primite jednokratni kod."}
        </p>
      </header>
      {challenge ? (
        <CodeEntry
          challenge={challenge}
          onBack={() => setChallenge(null)}
          onVerified={() => {
            window.location.assign(localizedPath("/nalog", locale));
          }}
        />
      ) : (
        <>
          <div
            className="button-row"
            style={{ marginBottom: "1rem" }}
            aria-label="Pristup nalogu"
          >
            <button
              className={`button ${mode === "login" ? "" : "secondary"}`}
              aria-pressed={mode === "login"}
              disabled={busy}
              onClick={() => {
                setMode("login");
                setError("");
              }}
            >
              Imam nalog
            </button>
            <button
              className={`button ${mode === "register" ? "" : "secondary"}`}
              aria-pressed={mode === "register"}
              disabled={busy}
              onClick={() => {
                setMode("register");
                setError("");
              }}
            >
              Napravi nalog
            </button>
          </div>
          <form className="card form-stack" onSubmit={submit}>
            {/* Google sign-in (18 Nov 2026): the button only, for now. When the OAuth
                client is connected, point this at the Google start route instead of
                showing the note. */}
            <button
              type="button"
              className="button google-button"
              disabled={busy}
              onClick={() => setGoogleNote(true)}
            >
              <GoogleMark />
              Nastavi sa Google nalogom
            </button>
            {googleNote ? (
              <p className="notice" role="status">
                Prijava preko Google naloga stiže uskoro. Do tada se prijavi kodom na email.
              </p>
            ) : null}
            <p className="login-divider"><span>ili</span></p>
            <label className="field">
              <span>Email adresa</span>
              <input
                type="email"
                autoComplete="email"
                maxLength={254}
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            {mode === "register" ? (
              <p className="muted">
                Kod potvrđuje da email pripada vama. Ne morate da pamtite
                lozinku.
              </p>
            ) : (
              <label className="field">
                <span>Gde da pošaljemo kod?</span>
                <select
                  value={channel}
                  onChange={(event) => setChannel(event.target.value)}
                >
                  <option value="email" disabled={options?.email === false}>
                    Email
                  </option>
                  <option value="whatsapp" disabled={!options?.whatsapp}>
                    WhatsApp
                  </option>
                  <option
                    value="both"
                    disabled={!options?.email || !options?.whatsapp}
                  >
                    Email i WhatsApp
                  </option>
                </select>
                <small>
                  WhatsApp je dostupan tek kada potvrdite broj u svom nalogu.
                </small>
              </label>
            )}
            {options && !options.email && !options.whatsapp ? (
              <p className="notice" role="status">
                Prijava kodom još nije aktivirana. Pokušajte kasnije.
              </p>
            ) : null}
            {error ? (
              <p className="notice error" role="alert">
                {error}
              </p>
            ) : null}
            <button
              className="button"
              disabled={
                busy ||
                !options ||
                (mode === "register"
                  ? !options.email
                  : channel === "email"
                    ? !options.email
                    : !options.whatsapp)
              }
            >
              {busy
                ? "Pripremamo kod…"
                : mode === "register"
                  ? "Napravi nalog i pošalji kod"
                  : "Pošalji kod za prijavu"}
            </button>
            {mode === "login" ? (
              <p className="muted">
                Već ste poručili? Upotrebite email sa porudžbine — dovoljan je
                kod. Ako još nemate porudžbinu, izaberite „Napravi nalog“.
              </p>
            ) : (
              <p className="muted">
                Vaše postojeće porudžbine povezaćemo sa nalogom nakon potvrde
                emaila. <a href="/privatnost">Politika privatnosti</a>.
              </p>
            )}
          </form>
          {options?.demo && (
            <section className="card form-stack" style={{ marginTop: "1.5rem" }} aria-labelledby="demo-title">
              <h2 id="demo-title">Pogledajte kako izgleda nalog</h2>
              <p>Isprobajte pregled pretplate, naredne dostave i istorije porudžbina sa primerima podataka. Email i lozinka nisu potrebni.</p>
              <button className="button secondary" type="button" disabled={busy} onClick={() => void openDemo()}>
                {busy ? "Otvaramo nalog…" : "Isprobaj demo nalog"}
              </button>
              <p className="muted">Demo nalog služi za pregled. Za izmene i poručivanje prijavite se na svoj nalog.</p>
            </section>
          )}
        </>
      )}
    </div>
  ));
}
