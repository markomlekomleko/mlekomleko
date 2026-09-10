"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson } from "../../lib/frontend";

export function MagicLinkConfirmation() {
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");
  const exchangeStarted = useRef(false);

  const exchangeToken = useCallback(async () => {
    setStatus("loading");
    setMessage("");
    const magicToken = new URLSearchParams(window.location.search).get("token");
    if (!magicToken) {
      setStatus("error");
      setMessage("Link za prijavu nema važeći token.");
      return;
    }

    try {
      await fetchJson<{ authenticated: true }>("/api/auth/magic-link/exchange", {
        method: "POST",
        body: JSON.stringify({ token: magicToken }),
      });
      window.history.replaceState({}, "", "/prijava/potvrda");
      setStatus("success");
    } catch (requestError) {
      setStatus("error");
      setMessage(
        requestError instanceof Error
          ? requestError.message
          : "Link nije moguće potvrditi.",
      );
    }
  }, []);

  useEffect(() => {
    if (exchangeStarted.current) return;
    exchangeStarted.current = true;
    queueMicrotask(() => void exchangeToken());
  }, [exchangeToken]);

  return (
    <div className="page-shell narrow">
      {status === "loading" ? (
        <p className="loading-state" role="status">Potvrđujemo pristup nalogu…</p>
      ) : status === "success" ? (
        <div className="notice success" role="status">
          <h1>Uspešno ste prijavljeni.</h1>
          <p>Bezbedna sesija je aktivna na ovom uređaju.</p>
          <a className="button" href="/nalog">Otvori nalog</a>
        </div>
      ) : (
        <div className="notice error" role="alert">
          <h1>Link nije važeći.</h1>
          <p>{message}</p>
          <div className="button-row">
            <button className="button secondary" type="button" onClick={exchangeToken}>Pokušaj ponovo</button>
            <a className="button" href="/prijava">Zatraži novi link</a>
          </div>
        </div>
      )}
    </div>
  );
}
