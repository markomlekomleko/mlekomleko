import type { Metadata } from "next";
import { canonicalUrl } from "../lib/seo";
/* eslint-disable @next/next/no-img-element -- Official product image is sourced from the existing Mleko i Mleko store. */

export const metadata: Metadata = {
  title: "Naše farme",
  description: "Put domaćeg kravljeg i kozjeg mleka od farme do vaše adrese.",
  alternates: { canonical: canonicalUrl("/farme") },
};

export default function FarmsPage() {
  return (
    <div className="page-shell farm-page">
      <header className="farm-page-hero">
        <div>
          <p className="eyebrow">Put našeg mleka</p>
          <h1>Tradicija sa farme, dostava za danas.</h1>
          <p className="lead">Krave i koze odgajaju se tradicionalno, u skladu sa prirodom i uz prirodnu ishranu. Mleko stiže bez hormona, antibiotika i aditiva.</p>
          <div className="button-row"><a className="button" href="/prodavnica">Izaberi mleko →</a><a className="button secondary" href="/kontakt">Kontakt</a></div>
        </div>
        <figure className="farm-media">
          <img
            src="https://storage.googleapis.com/takeapp/media/cm52vt3e6000a03jq3nsw8bzc.png"
            alt="Domaće kozje mleko Mleko i Mleko"
            width="1080"
            height="1080"
            fetchPriority="high"
          />
          <figcaption>Domaće mleko u povratnoj staklenoj ambalaži</figcaption>
        </figure>
      </header>

      <section className="section" aria-labelledby="profil-title">
        <div className="section-heading"><p className="eyebrow">Šta dobijate</p><h2 id="profil-title">Kvalitet koji možete da prepoznate.</h2></div>
        <div className="grid-3 farm-profile-grid">
          <article className="card"><span>01</span><h3>Punomasno i sirovo</h3><p>Prirodan ukus i punoća od koje možete napraviti pravi domaći kajmak.</p></article>
          <article className="card"><span>02</span><h3>Laboratorijska kontrola</h3><p>Mleko se redovno kontroliše pre nego što stigne do kupaca.</p></article>
          <article className="card"><span>03</span><h3>Povratno staklo</h3><p>Čiste korišćene flaše vraćate pri sledećoj dostavi, a preuzimate pune.</p></article>
        </div>
      </section>

      <section className="farm-route" aria-labelledby="ruta-title">
        <div><p className="eyebrow">Put proizvoda</p><h2 id="ruta-title">Od potvrđene količine do vaše adrese.</h2></div>
        <ol><li><strong>Planiranje</strong><span>Porudžbine se zaključavaju pre pripreme.</span></li><li><strong>Priprema</strong><span>Farma dobija zbir potrebnih količina.</span></li><li><strong>Ruta</strong><span>Dostava se grupiše po terminu i adresi.</span></li><li><strong>Kontrola</strong><span>Problem se vezuje za konkretnu porudžbinu.</span></li></ol>
      </section>

      <aside className="demo-disclosure"><strong>Važno:</strong><p>Na javnoj prodavnici nisu navedena imena pojedinačnih gazdinstava, zato ih ne izmišljamo. Kada budu zvanično objavljena, moći će da se dodaju kroz administraciju.</p></aside>
    </div>
  );
}
