import type { Metadata } from "next";
import { ContactForm } from "./contact-form";
import { ContentStamp } from "../components/policy-page";
import { canonicalUrl } from "../lib/seo";

export const metadata: Metadata = {
  title: "Kontakt",
  description: "Kontaktiraj Mleko i Mleko u vezi sa proizvodima, porudžbinama ili dostavom.",
  alternates: { canonical: canonicalUrl("/kontakt") },
};

export default function ContactPage() {
  return (
    <div className="content-page">
      <header className="content-band content-hero">
        <div className="page-shell content-head">
          <div className="page-heading"><p className="eyebrow">Kontakt</p><h1>Tu smo za pitanja.</h1><p className="lead">Za najbržu proveru porudžbine navedi email korišćen pri kupovini i ID porudžbine.</p></div>
          <ContentStamp />
        </div>
      </header>
      <div className="content-band">
        <div className="page-shell">
          <div className="content-grid content-grid--3">
            <section className="content-card"><h2>Telefon</h2><a className="contact-phone" href="tel:+381605022323">060 502 23 23</a><p>Za pitanja o proizvodima, dostavi i postojećim porudžbinama.</p></section>
            <section className="content-card"><h2>Društvene mreže</h2><ul className="contact-links"><li><a className="text-link" href="https://instagram.com/mleko_i_mleko" target="_blank" rel="noreferrer">Instagram @mleko_i_mleko <span aria-hidden="true">↗</span></a></li><li><a className="text-link" href="https://www.tiktok.com/@mleko_i_mleko" target="_blank" rel="noreferrer">TikTok @mleko_i_mleko <span aria-hidden="true">↗</span></a></li></ul></section>
            <section className="content-card"><h2>Postojeći kupci</h2><p>Količine, preskakanje, pauziranje i otkazivanje možeš da završiš bez poziva.</p><a className="button secondary" href="/nalog">Otvori nalog</a></section>
          </div>
          <section className="card form-stack contact-form-panel" aria-labelledby="contact-form-title"><h2 id="contact-form-title">Piši nam.</h2><p>Ostavi poruku i email na koji možemo da ti odgovorimo.</p><ContactForm /></section>
        </div>
      </div>
    </div>
  );
}
