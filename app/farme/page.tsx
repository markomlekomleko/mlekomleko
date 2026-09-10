import type { Metadata } from "next";
import { canonicalUrl } from "../lib/seo";

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
          <p className="lead">Sarađujemo sa domaćim farmama i organizujemo dostavu mleka u povratnim staklenim flašama.</p>
          <div className="button-row"><a className="button" href="/prodavnica">Izaberi mleko →</a><a className="button secondary" href="/kontakt">Kontakt</a></div>
        </div>
        <figure className="farm-media">
          <picture>
            <source srcSet="/images/farma.avif" type="image/avif" />
            <source srcSet="/images/farma.webp" type="image/webp" />
            <img src="/images/farma.jpg" alt="Krave na pašnjaku domaće farme" width="1600" height="1066" fetchPriority="high" />
          </picture>
          <figcaption>Domaće mleko u povratnoj staklenoj ambalaži</figcaption>
        </figure>
      </header>

      <section className="section" aria-labelledby="profil-title">
        <div className="section-heading"><p className="eyebrow">Šta dobijate</p><h2 id="profil-title">Kvalitet koji možete da prepoznate.</h2></div>
        <div className="grid-3 farm-profile-grid">
          <article className="card"><span>01</span><h3>Punomasno i sirovo</h3><p>Prirodan ukus i punoća od koje možete napraviti pravi domaći kajmak.</p></article>
          <article className="card"><span>02</span><h3>Dokumentovan kvalitet</h3><p>Podatke o kontroli i deklaraciji objavljujemo uz proizvod kada su potvrđeni dokumentacijom dobavljača.</p></article>
          <article className="card"><span>03</span><h3>Povratno staklo</h3><p>Čiste korišćene flaše vraćate pri sledećoj dostavi, a preuzimate pune.</p></article>
        </div>
      </section>

      <section className="farm-route" aria-labelledby="ruta-title">
        <div><p className="eyebrow">Put proizvoda</p><h2 id="ruta-title">Od potvrđene količine do vaše adrese.</h2></div>
        <ol><li><strong>Planiranje</strong><span>Porudžbine se zaključavaju pre pripreme.</span></li><li><strong>Priprema</strong><span>Farma dobija zbir potrebnih količina.</span></li><li><strong>Ruta</strong><span>Dostava se grupiše po terminu i adresi.</span></li><li><strong>Kontrola</strong><span>Problem se vezuje za konkretnu porudžbinu.</span></li></ol>
      </section>

      <aside className="farm-disclosure"><strong>Poreklo mleka</strong><p>Za dodatne informacije o dobavljačima i poreklu proizvoda <a href="/kontakt">kontaktirajte nas</a>.</p></aside>
    </div>
  );
}
