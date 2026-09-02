"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("Greška pri prikazu javne stranice", error.digest ?? "bez-digest-a");
  }, [error]);

  return (
    <div className="page-shell narrow">
      <section className="notice error" role="alert" aria-labelledby="error-title">
        <p className="eyebrow">Privremeni problem</p>
        <h1 id="error-title">Stranica trenutno ne može da se učita.</h1>
        <p>Pokušajte ponovo. Ako problem potraje, pozovite nas na 060 502 23 23.</p>
        <div className="button-row">
          <button className="button" type="button" onClick={reset}>Pokušaj ponovo</button>
          <Link className="button secondary" href="/">Početna strana</Link>
        </div>
      </section>
    </div>
  );
}
