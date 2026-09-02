import type { Metadata } from "next";
/* eslint-disable @next/next/no-img-element -- Local optimized demo editorial asset in the vinext runtime. */

export const metadata: Metadata = {
  title: "Naše farme",
  description: "Kako ćemo predstavljati poreklo, proizvođače i put Mleko i Mleko proizvoda do vaše adrese.",
};

export default function FarmsPage() {
  return (
    <div className="page-shell farm-page">
      <header className="farm-page-hero">
        <div>
          <p className="eyebrow">Naše farme · demo koncept</p>
          <h1>Poreklo nije fusnota.</h1>
          <p className="lead">Ovde gradimo proverljiv profil svakog proizvođača — ko je, gde radi, šta proizvodi i koji proizvodi iz njegove ponude stižu na vašu adresu.</p>
          <div className="button-row"><a className="button" href="/prodavnica">Pogledaj demo ponudu →</a><a className="button secondary" href="/kontakt">Predloži farmu</a></div>
        </div>
        <figure className="farm-media"><img src="/images/farma-demo.jpg" alt="Demo prikaz male porodične mlečne farme u jutarnjem svetlu" /><figcaption>Ilustrativni demo vizual — nije fotografija konkretnog partnera.</figcaption></figure>
      </header>

      <section className="section" aria-labelledby="profil-title">
        <div className="section-heading"><p className="eyebrow">Profil bez marketing magle</p><h2 id="profil-title">Šta mora da stoji uz svaku farmu.</h2></div>
        <div className="grid-3 farm-profile-grid">
          <article className="card"><span>01</span><h3>Ljudi i mesto</h3><p>Ime gazdinstva, lokacija i kratka priča direktno potvrđena sa proizvođačem.</p></article>
          <article className="card"><span>02</span><h3>Proizvodi i dostupnost</h3><p>Koji artikli dolaze sa farme, u kom pakovanju i kojim ritmom mogu da se poruče.</p></article>
          <article className="card"><span>03</span><h3>Dokazi, ne bedževi</h3><p>Deklaracije, analize i sertifikati prikazuju se samo ako postoje i ako su provereni.</p></article>
        </div>
      </section>

      <section className="farm-route" aria-labelledby="ruta-title">
        <div><p className="eyebrow">Put proizvoda</p><h2 id="ruta-title">Od potvrđene količine do vaše adrese.</h2></div>
        <ol><li><strong>Planiranje</strong><span>Porudžbine se zaključavaju pre pripreme.</span></li><li><strong>Priprema</strong><span>Farma dobija zbir potrebnih količina.</span></li><li><strong>Ruta</strong><span>Dostava se grupiše po terminu i adresi.</span></li><li><strong>Kontrola</strong><span>Problem se vezuje za konkretnu porudžbinu.</span></li></ol>
      </section>

      <aside className="demo-disclosure"><strong>Važno:</strong><p>Trenutni nazivi proizvoda, fotografije i poreklo su demo podaci za razvoj platforme. Nećemo izmišljati konkretne farme; stvarni profili ulaze tek posle potvrde partnera.</p></aside>
    </div>
  );
}
