"use client";

import { useState, type FormEvent } from "react";
import { fetchJson } from "../lib/frontend";

type MagicLinkResponse = {
  message?: string;
  magicLink?: string;
  magic_link?: string;
};

export function MagicLinkForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [response, setResponse] = useState<MagicLinkResponse | null>(null);

  async function requestLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      const payload = await fetchJson<MagicLinkResponse>("/api/auth/magic-link", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setResponse(payload);
    } catch (requestError) {
      setError(
        requestError instanceof Error
          ? requestError.message
          : "Link trenutno ne može da se pošalje.",
      );
    } finally {
      setLoading(false);
    }
  }

  const localLink = response?.magicLink ?? response?.magic_link;

  return (
    <div className="page-shell narrow">
      <header className="page-heading">
        <p className="eyebrow">Korisnički nalog</p>
        <h1>Prijava bez lozinke</h1>
        <p className="lead">
          Unesite email korišćen pri poručivanju. Poslaćemo vam jednokratni link
          za upravljanje isporukama.
        </p>
      </header>

      {response ? (
        <div className="notice success" role="status">
          <h2>Proverite email</h2>
          <p>
            Ako nalog postoji za <strong>{email}</strong>, link za prijavu je pripremljen.
          </p>
          {localLink ? (
            <p>
              Lokalni razvoj: <a href={localLink}>otvorite generisani link</a>.
            </p>
          ) : null}
          <button className="button secondary" type="button" onClick={() => setResponse(null)}>
            Pošalji ponovo
          </button>
        </div>
      ) : (
        <form className="card form-stack" onSubmit={requestLink}>
          <label className="field">
            <span>Email adresa</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          {error ? <p className="notice error" role="alert">{error}</p> : null}
          <button className="button" type="submit" disabled={loading}>
            {loading ? "Šaljemo link…" : "Pošalji link za prijavu"}
          </button>
        </form>
      )}
    </div>
  );
}
