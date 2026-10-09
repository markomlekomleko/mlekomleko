import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Stranica nije pronađena",
  robots: { index: false, follow: false },
};

export default function NotFound() {
  return (
    <div className="content-page">
      <section className="content-band status-page" aria-labelledby="not-found-title">
        <div className="page-shell">
          <p className="status-code" aria-hidden="true">404</p>
          <p className="eyebrow">Greška 404</p>
          <h1 id="not-found-title">Ova stranica ne postoji.</h1>
          <p className="lead">
            Link je možda zastareo ili je proizvod povučen iz ponude.
          </p>
          <div className="button-row">
            <Link className="button" href="/">Nazad na početnu</Link>
            <a className="button secondary" href="/prodavnica">Pogledaj ponudu</a>
          </div>
        </div>
      </section>
    </div>
  );
}
