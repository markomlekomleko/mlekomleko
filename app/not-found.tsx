import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Stranica nije pronađena",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <div className="page-shell narrow">
      <section className="empty-state" aria-labelledby="not-found-title">
        <p className="eyebrow">Greška 404</p>
        <h1 id="not-found-title">Ova stranica ne postoji.</h1>
        <p className="lead">
          Link je možda zastareo ili je proizvod povučen iz ponude.
        </p>
        <div className="button-row">
          <a className="button" href="/prodavnica">Pogledajte ponudu</a>
          <Link className="button secondary" href="/">Početna strana</Link>
        </div>
      </section>
    </div>
  );
}
