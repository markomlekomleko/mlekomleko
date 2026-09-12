import type { Metadata } from "next";
import { canonicalUrl } from "../lib/seo";
import { ContactForm } from "./contact-form";
import "./contact.css";

export const metadata: Metadata = {
  title: "Kontakt",
  description: "Kontaktirajte Mleko i Mleko u vezi sa proizvodima, porudžbinama ili dostavom.",
  alternates: { canonical: canonicalUrl("/kontakt") },
};

export default function ContactPage() {
  return (
    <div className="page-shell contact-page">
      <header className="contact-heading">
        <p className="eyebrow">Hajde da se čujemo</p>
        <h1>Tu smo za <em>tvoja pitanja.</em></h1>
        <p className="lead">O mleku, dostavi ili tvojoj porudžbini. Piši nam — rado ćemo pomoći.</p>
      </header>
      <div className="contact-layout">
        <aside className="contact-details" aria-label="Kontakt informacije">
          <section className="contact-phone">
            <p className="eyebrow">Više voliš razgovor?</p>
            <a href="tel:+381605022323">060 502 23 23 <span aria-hidden="true">↗</span></a>
            <p>Pozovi nas za pitanja o proizvodima i dostavi.</p>
          </section>
          <section className="contact-shortcut">
            <h2>Već imaš porudžbinu?</h2>
            <p>U poruci navedi njen broj i email korišćen pri kupovini, da je lakše pronađemo.</p>
            <p>Količinu, preskakanje ili pauzu redovne dostave možeš da promeniš na svom nalogu.</p>
            <a className="text-link" href="/nalog">Otvori moj nalog <span aria-hidden="true">→</span></a>
          </section>
          <section className="contact-social">
            <h2>Prati naša svakodnevna jutra.</h2>
            <div>
              <a className="text-link" href="https://instagram.com/mleko_i_mleko" target="_blank" rel="noreferrer">Instagram ↗</a>
              <a className="text-link" href="https://www.tiktok.com/@mleko_i_mleko" target="_blank" rel="noreferrer">TikTok ↗</a>
            </div>
          </section>
        </aside>
        <section className="contact-form-panel" aria-labelledby="contact-form-title">
          <h2 id="contact-form-title">Piši nam.</h2>
          <p className="contact-form-intro">Ostavi poruku i email na koji možemo da ti odgovorimo.</p>
          <ContactForm />
        </section>
      </div>
      <p className="contact-faq">Možda te odgovor već čeka među <a className="text-link" href="/faq">čestim pitanjima</a>.</p>
    </div>
  );
}
