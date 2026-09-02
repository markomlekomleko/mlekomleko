import type { Metadata } from "next";
/* eslint-disable @next/next/no-img-element -- Official product imagery is sourced from the existing Mleko i Mleko store. */
import { DeliveryChecker } from "./components/delivery-checker";
import { BundleOffers } from "./components/bundle-offers";
import { ProductCard } from "./components/product-card";
import { frequentlyAskedQuestions } from "./lib/content";
import { normalizeProduct } from "./lib/frontend";
import { canonicalUrl, serializeJsonLd } from "./lib/seo";
import { getStorefront } from "../server/storefront";

export const metadata: Metadata = {
  title: "Domaće kravlje i kozje mleko na vašoj adresi",
  description:
    "Punomasno sirovo kravlje i kozje mleko u povratnim staklenim flašama, sa dostavom u Beogradu i Novom Sadu.",
  alternates: { canonical: canonicalUrl("/") },
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
            <img
              src="https://storage.googleapis.com/takeapp/media/clvwgn1at00130cl451x24roh.png"
              alt="Mleko i Mleko domaće mleko u staklenim flašama"
              width="940"
              height="788"
              fetchPriority="high"
            />
            <figcaption>Domaće mleko u povratnim staklenim flašama</figcaption>
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
              <div><p className="eyebrow">Izaberite svoje mleko</p><h2 id="izdvojeno-title">Koliko litara vam stiže po dostavi?</h2></div>
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
            <h2 id="koraci-title">Vi birate mleko, litre i ritam. Mi donosimo.</h2>
          </div>
          <div className="grid-3 steps-grid">
            <article className="card number-card"><strong>01</strong><h3>Izaberite mleko</h3><p className="muted">Kravlje ili kozje, jednokratno ili kao redovnu dostavu.</p></article>
            <article className="card number-card"><strong>02</strong><h3>Odredite litre i ritam</h3><p className="muted">Izaberite jednokratnu, nedeljnu ili dvonedeljnu isporuku, bez komplikovanih paketa.</p></article>
            <article className="card number-card"><strong>03</strong><h3>Vratite čiste flaše</h3><p className="muted">Od druge dostave preuzimamo korišćene, čiste flaše i donosimo pune.</p></article>
          </div>
        </section>

        <section className="section farm-story" aria-labelledby="farme-title">
          <figure className="farm-media">
            <img
              src="https://storage.googleapis.com/takeapp/media/cm52rz909000003mhagpjf52k.png"
              alt="Domaće kravlje mleko Mleko i Mleko"
              width="1080"
              height="1080"
              loading="lazy"
            />
            <figcaption>Tradicionalan uzgoj i savremena dostava</figcaption>
          </figure>
          <div className="farm-copy">
            <p className="eyebrow">Odakle dolazi</p>
            <h2 id="farme-title">Direktno sa domaćih farmi.</h2>
            <p className="lead">Punomasno sirovo mleko od krava i koza iz tradicionalnog uzgoja, sa prirodnom ishranom i redovnom laboratorijskom kontrolom.</p>
            <div className="farm-facts">
              <article><strong>01</strong><span>Prirodan ukus</span><p>Punoća od koje možete napraviti pravi domaći kajmak.</p></article>
              <article><strong>02</strong><span>Bez dodataka</span><p>Bez hormona, antibiotika i aditiva.</p></article>
              <article><strong>03</strong><span>Manje otpada</span><p>Povratne staklene flaše umesto jednokratne plastike.</p></article>
            </div>
            <a className="button secondary" href="/farme">Saznaj put našeg mleka →</a>
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
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd({
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
