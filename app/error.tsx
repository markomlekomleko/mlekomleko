"use client";

import { useLocalize } from "@/app/lib/i18n/client";
import { useEffect } from "react";
import Link from "next/link";

export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  const localize = useLocalize();
  useEffect(() => {
    console.error("Greška pri prikazu javne stranice", error.digest ?? "bez-digest-a");
  }, [error]);

  return localize((
    <div className="content-page">
      <section className="content-band status-page" role="alert" aria-labelledby="error-title">
        <div className="page-shell">
          <p className="eyebrow">Privremeni problem</p>
          <h1 id="error-title">Stranica trenutno ne može da se učita.</h1>
          <p className="lead">Pokušaj ponovo. Ako problem potraje, pozovi nas na <a href="tel:+381605022323">060 502 23 23</a>.</p>
          {error.digest && <p className="status-detail">Šifra greške: {error.digest}</p>}
          <div className="button-row">
            <button className="button" type="button" onClick={retry}>Pokušaj ponovo</button>
            <Link className="button secondary" href="/">Početna strana</Link>
          </div>
        </div>
      </section>
    </div>
  ));
}
