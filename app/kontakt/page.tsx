import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Kontakt",
  description: "Kontaktirajte Mleko i Mleko u vezi sa proizvodima, porudžbinama ili dostavom.",
};

export default function ContactPage() {
  return (
    <div className="page-shell narrow">
      <header className="page-heading"><p className="eyebrow">Kontakt</p><h1>Tu smo za pitanja.</h1><p className="lead">Za najbržu proveru porudžbine navedite email korišćen pri kupovini i ID porudžbine.</p></header>
      <div className="grid-2">
        <section className="card"><h2>Email</h2><p className="muted">Adresa će biti objavljena nakon potvrde poslovnih kontakt podataka.</p></section>
        <section className="card"><h2>Postojeći kupci</h2><p className="muted">Količine, preskakanje, pauziranje i otkazivanje možete završiti bez poziva.</p><a className="button secondary small" href="/nalog">Otvori nalog</a></section>
      </div>
    </div>
  );
}
