"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchJson } from "../../lib/frontend";

const SESSION_KEY = "mleko-i-mleko-session";

type ExchangeResponse = {
  sessionToken?: string;
  session_token?: string;
  token?: string;
  session?: { token?: string };
};

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
      const payload = await fetchJson<ExchangeResponse>(
        `/api/account?token=${encodeURIComponent(magicToken)}`,
      );
      const sessionToken = payload.session?.token ?? payload.sessionToken ?? payload.session_token ?? payload.token;
      if (!sessionToken) throw new Error("Server nije vratio sesiju za nalog.");
      window.localStorage.setItem(SESSION_KEY, sessionToken);
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
          <p>Sesija je sačuvana samo na ovom uređaju.</p>
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
