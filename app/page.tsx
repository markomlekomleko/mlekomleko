import type { Metadata } from "next";
/* eslint-disable @next/next/no-img-element -- Hero is a locally optimized image in the vinext runtime. */
import { DeliveryChecker } from "./components/delivery-checker";
import { BundleOffers } from "./components/bundle-offers";
import { ProductCard } from "./components/product-card";
import { frequentlyAskedQuestions } from "./lib/content";
import { normalizeProduct } from "./lib/frontend";
import { getStorefront } from "../server/storefront";

export const metadata: Metadata = {
  title: "Sveže mleko na vašoj adresi",
  description:
    "Jednokratna kupovina ili redovna nedeljna i dvonedeljna dostava svežih mlečnih proizvoda.",
};

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const storefront = await getStorefront();
  const { settings, delivery } = storefront;
  const products = storefront.products.map(normalizeProduct);
  const featured = products.filter((product) => product.isFeatured).slice(0, 4);
  return (
    <>
      <section className="hero hero-split" aria-labelledby="hero-title">
        <div className="page-shell hero-grid">
          <div className="hero-copy">
            <p className="eyebrow">{settings.heroEyebrow}</p>
            <h1 id="hero-title">{settings.heroTitle}</h1>
            <p className="lead">{settings.heroSubtitle}</p>
            <div className="button-row">
              <a className="button" href={settings.heroPrimaryUrl}>{settings.heroPrimaryLabel} →</a>
            </div>
          </div>
          <figure className="hero-media">
            <img src="/images/hero-dairy-demo.jpg" alt="Demo prikaz mlečnih proizvoda na porodičnom stolu" />
            <figcaption>Demo vizual · zamenljiv stvarnim fotografijama</figcaption>
          </figure>
        </div>
      </section>

      <div className="page-shell home-content">
        <DeliveryChecker title={settings.serviceAreaTitle} note={settings.serviceAreaNote} delivery={delivery} />

        <aside className="trust-strip" aria-label="Ključne pogodnosti">
          {settings.trustItems.map((item) => <span key={item}><strong>✓</strong>{item}</span>)}
        </aside>

        {featured.length ? (
          <section className="section" aria-labelledby="izdvojeno-title">
            <div className="section-heading split-heading">
              <div><p className="eyebrow">Za početak</p><h2 id="izdvojeno-title">Sastavite dostavu po svom ukusu.</h2></div>
              <a className="text-link" href="/prodavnica">Pogledaj celu ponudu →</a>
            </div>
            <div className="product-grid featured-grid">
              {featured.map((product) => <ProductCard key={product.id} product={product} />)}
            </div>
          </section>
        ) : null}

        <BundleOffers products={products} bundles={storefront.bundles} />

        <section className="section" aria-labelledby="koraci-title">
          <div className="section-heading">
            <p className="eyebrow">Jednostavno kao navika</p>
            <h2 id="koraci-title">Vi birate proizvode i ritam. Mi donosimo.</h2>
          </div>
          <div className="grid-3 steps-grid">
            <article className="card number-card"><strong>01</strong><h3>Izaberite proizvode</h3><p className="muted">Svaku stavku možete uzeti samo jednom ili uključiti u redovnu dostavu.</p></article>
            <article className="card number-card"><strong>02</strong><h3>Podesite svoj ritam</h3><p className="muted">Nedeljno i dvonedeljno mogu zajedno u istoj korpi, bez komplikованog paketa.</p></article>
            <article className="card number-card"><strong>03</strong><h3>Zadržite kontrolu</h3><p className="muted">Promenite količinu, preskočite, pauzirajte ili otkažite pre roka za dostavu.</p></article>
          </div>
        </section>

        <section className="section farm-story" aria-labelledby="farme-title">
          <figure className="farm-media">
            <img src="/images/farma-demo.jpg" alt="Demo prikaz male porodične mlečne farme u jutarnjem svetlu" loading="lazy" />
            <figcaption>Demo vizual · stvarne farme i podaci dodaju se nakon potvrde proizvođača</figcaption>
          </figure>
          <div className="farm-copy">
            <p className="eyebrow">Odakle dolazi</p>
            <h2 id="farme-title">Nećemo vam prodavati priču bez porekla.</h2>
            <p className="lead">Stranica svake buduće partnerske farme imaće jasne podatke o proizvođaču, mestu, proizvodima i putu do isporuke. Do potvrde stvarnih partnera, sadržaj ostaje jasno označen kao demo.</p>
            <div className="farm-facts">
              <article><strong>01</strong><span>Ko proizvodi</span><p>Ime gazdinstva i ljudi iza proizvoda.</p></article>
              <article><strong>02</strong><span>Šta stiže</span><p>Povezani proizvodi, pakovanja i dostupnost.</p></article>
              <article><strong>03</strong><span>Kako putuje</span><p>Termin pripreme i organizacija poslednje milje.</p></article>
            </div>
            <a className="button secondary" href="/farme">Upoznaj koncept farmi →</a>
          </div>
        </section>

        <section className="section faq-home" aria-labelledby="faq-home-title">
          <div className="faq-intro">
            <p className="eyebrow">Bez nedoumica</p>
            <h2 id="faq-home-title">Česta pitanja pre prve dostave.</h2>
            <p className="lead">Sve što najčešće zaustavi kupovinu — od pretplate do plaćanja — rešeno je ovde, pre korpe.</p>
            <a className="text-link" href="/kontakt">Niste pronašli odgovor? Pišite nam →</a>
          </div>
          <div className="details-list faq-list">
            {frequentlyAskedQuestions.map(({ question, answer }, index) => (
              <details key={question} open={index === 0}>
                <summary>{question}<span aria-hidden="true">＋</span></summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="conversion-band" aria-labelledby="garancija-title">
          <div>
            <p className="eyebrow">Bez sitnih slova</p>
            <h2 id="garancija-title">{settings.guaranteeTitle}</h2>
            <p>{settings.guaranteeText}</p>
          </div>
          <div className="button-row">
            <a className="button light" href="/prodavnica">Sastavi dostavu →</a>
            <a className="text-link light-link" href="/kako-funkcionise">Kako funkcioniše</a>
          </div>
        </section>
      </div>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: frequentlyAskedQuestions.map(({ question, answer }) => ({
          "@type": "Question",
          name: question,
          acceptedAnswer: { "@type": "Answer", text: answer },
        })),
      }) }} />
    </>
  );
}
