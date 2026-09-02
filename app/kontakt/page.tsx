import type { Metadata } from "next";
import { canonicalUrl } from "../lib/seo";

export const metadata: Metadata = {
  title: "Kontakt",
  description: "Kontaktirajte Mleko i Mleko u vezi sa proizvodima, porudžbinama ili dostavom.",
  alternates: { canonical: canonicalUrl("/kontakt") },
};

export default function ContactPage() {
  return (
    <div className="page-shell narrow">
      <header className="page-heading"><p className="eyebrow">Kontakt</p><h1>Tu smo za pitanja.</h1><p className="lead">Za najbržu proveru porudžbine navedite email korišćen pri kupovini i ID porudžbine.</p></header>
      <div className="grid-2">
        <section className="card"><h2>Telefon</h2><p><a className="text-link" href="tel:+381605022323">060 502 23 23</a></p><p className="muted">Za pitanja o proizvodima, dostavi i postojećim porudžbinama.</p></section>
        <section className="card"><h2>Društvene mreže</h2><p><a className="text-link" href="https://instagram.com/mleko_i_mleko" target="_blank" rel="noreferrer">Instagram @mleko_i_mleko ↗</a></p><p><a className="text-link" href="https://www.tiktok.com/@mleko_i_mleko" target="_blank" rel="noreferrer">TikTok @mleko_i_mleko ↗</a></p></section>
        <section className="card"><h2>Postojeći kupci</h2><p className="muted">Količine, preskakanje, pauziranje i otkazivanje možete završiti bez poziva.</p><a className="button secondary small" href="/nalog">Otvori nalog</a></section>
      </div>
    </div>
  );
}
