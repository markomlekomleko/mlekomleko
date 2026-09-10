import type { Metadata } from "next";
import { DeliveryChecker } from "./components/delivery-checker";
import { BundleOffers } from "./components/bundle-offers";
import { ProductCard } from "./components/product-card";
import { MilkScene } from "./components/milk-scene";
import { frequentlyAskedQuestions } from "./lib/content";
import { formatMoney, normalizeProduct } from "./lib/frontend";
import { canonicalUrl, serializeJsonLd } from "./lib/seo";
import { getStorefront } from "../server/storefront";

export const metadata: Metadata = {
  title: "Domaće kravlje i kozje mleko na vašoj adresi",
  description: "Punomasno sirovo kravlje i kozje mleko u povratnim staklenim flašama, sa dostavom u Beogradu i Novom Sadu.",
  alternates: { canonical: canonicalUrl("/") },
};
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const storefront = await getStorefront();
  const { settings, delivery } = storefront;
  const products = storefront.products.map(normalizeProduct);
  const featured = products.filter((product) => product.isFeatured).slice(0, 4);
  const defaultTitle = settings.heroTitle === "Pravo mleko više nije daleko.";
  return (
    <div className="pastoral-home">
      <section className="conversion-hero" aria-labelledby="hero-title">
        <div className="page-shell conversion-hero-grid">
          <div className="conversion-copy">
            <p className="eyebrow"><span className="origin-dot" aria-hidden="true" />{settings.heroEyebrow}</p>
            <h1 id="hero-title">{defaultTitle ? <>Pravo mleko.<br /><em>Pravo na<br className="desktop-break" /> vaša vrata.</em></> : settings.heroTitle}</h1>
            <p className="conversion-lead">{defaultTitle ? "Domaće kravlje i kozje mleko u povratnim staklenim flašama. Vi birate količinu. Mi donosimo dobar početak dana." : settings.heroSubtitle}</p>
            <div className="conversion-actions">
              <a className="button" href={settings.heroPrimaryUrl}>{settings.heroPrimaryLabel}<span aria-hidden="true">↗</span></a>
              <a className="conversion-secondary" href="#proveri-dostavu">Proveri dostavu <span aria-hidden="true">↓</span></a>
            </div>
            <p className="conversion-reassurance"><span aria-hidden="true">✓</span> Može i jednokratno. Bez obavezne pretplate.</p>
            <div className="hero-price-list" aria-label="Izdvojeno iz ponude">
              {featured.filter((product) => product.available).slice(0, 2).map((product) => <a key={product.id} href={`/proizvodi/${encodeURIComponent(product.slug)}`}><span>{product.name}</span><strong>{formatMoney(product.priceRsd)}<small> / {product.unit}</small></strong><span className="price-arrow" aria-hidden="true">↗</span></a>)}
            </div>
            <a className="hero-delivery-terms" href="#proveri-dostavu">Beograd i Novi Sad · Dostava {formatMoney(settings.deliveryFeeMinor / 100)} po terminu{settings.freeDeliveryThresholdMinor > 0 ? ` · Besplatno od ${formatMoney(settings.freeDeliveryThresholdMinor / 100)}` : ""}</a>
          </div>
          <div className="conversion-stage">
            <div className="stage-orbit orbit-one" aria-hidden="true" /><div className="stage-orbit orbit-two" aria-hidden="true" />
            <span className="stage-word" aria-hidden="true">mleko.</span>
            <div className="stage-caption"><span>SA DOMAĆIH FARMI</span><span>U VAŠ SVAKI DAN</span></div>
            <div className="hero-object"><MilkScene /></div>
            <div className="stage-stamp"><span>Puno ukusa.</span><em>Prirodno.</em><span>U POVRATNOM STAKLU</span></div>
            <span className="stage-footnote">Dobra navika počinje jednom flašom.</span>
          </div>
        </div>
      </section>
      <div className="conversion-benefits"><div className="page-shell"><span><i aria-hidden="true">↗</i> Dostava na kućnu adresu</span><span><i aria-hidden="true">↻</i> Povratne staklene flaše</span><span><i aria-hidden="true">✓</i> Jednokratno ili redovno</span></div></div>
      <section id="izaberite-mleko" className="pastoral-products" aria-labelledby="products-title">
        <div className="page-shell">
          <div className="section-index"><span>01 / Izaberite svoje mleko</span><span>Jednokratno ili redovno</span></div>
          <div className="section-heading split-heading"><h2 id="products-title">Koje je vaše<br /><em>mleko za dobro jutro?</em></h2><a className="text-link" href="/prodavnica">Cela ponuda<span aria-hidden="true">↗</span></a></div>
          {featured.length ? <div className="product-grid featured-grid">{featured.map((product) => <ProductCard key={product.id} product={product} />)}</div> : <p>Aktuelnu ponudu možete pogledati u <a href="/prodavnica">prodavnici</a>.</p>}
          <BundleOffers products={products} bundles={storefront.bundles} />
        </div>
      </section>
      <section id="poreklo" className="origin-intro" aria-labelledby="origin-title">
        <div className="page-shell">
          <div className="section-index"><span>02 / Ono što je važno</span><span>Mleko i Mleko</span></div>
          <div className="origin-intro-layout">
            <p className="eyebrow">Dobro jutro počinje dobrim poreklom.</p>
            <div><h2 id="origin-title">Neke dobre stvari<br />dolaze <em>pravo iz prirode.</em></h2>
              <div className="intro-details"><p>Domaće kravlje i kozje mleko. Punoća ukusa koju pamtite, u staklu koje nam se vraća. Mali svakodnevni ritual koji vredi sačuvati.</p><a className="text-link" href="/o-nama">Upoznajte Mleko i Mleko<span aria-hidden="true">↗</span></a></div>
            </div>
          </div>
          <div className="pastoral-trust" aria-label="Ključne pogodnosti">{[...new Set(settings.trustItems)].map((item) => <span key={item}>{item}</span>)}</div>
        </div>
      </section>
      <section className="provenance" aria-labelledby="farm-title">
        <picture className="provenance-image"><source srcSet="/images/farma.avif" type="image/avif" /><source srcSet="/images/farma.webp" type="image/webp" /><img src="/images/farma.jpg" alt="Krave na pašnjaku — ilustracija domaćeg uzgoja" width="1600" height="1066" loading="lazy" /></picture>
        <div className="page-shell provenance-content">
          <div><p className="eyebrow">03 / Odakle sve počinje</p><h2 id="farm-title">Dobar ukus<br />ima svoje<br /><em>poreklo.</em></h2></div>
          <div className="provenance-copy"><p>Na domaćim farmama počinje put našeg kravljeg i kozjeg mleka. Do vas stiže punomasno i sirovo, u povratnoj staklenoj flaši.</p><a className="text-link" href="/farme">Upoznajte naše farme<span aria-hidden="true">↗</span></a>
            {settings.announcementEnabled && /(?:tiktok\.com|youtu\.?be)/i.test(settings.announcementUrl) ? <a className="story-video-link" href={settings.announcementUrl} target="_blank" rel="noreferrer"><span className="video-play" aria-hidden="true">▷</span><span>Od našeg mleka, domaći kajmak.<small>{settings.announcementLinkLabel} ↗</small></span></a> : null}
          </div>
        </div>
      </section>
      <section className="pastoral-ritual" aria-labelledby="ritual-title">
        <div className="page-shell">
          <div className="section-index"><span>04 / Vaša nova dobra navika</span><span>Od farme do vrata</span></div>
          <div className="section-heading ritual-heading"><h2 id="ritual-title">Prirodan ukus.<br /><em>Jednostavan ritam.</em></h2><p>Vi birate šta i koliko.<br />Mi donosimo mleko na vašu adresu.</p></div>
          <div className="ritual-grid">
            <article className="ritual-step"><span aria-hidden="true">01</span><h3>Izaberite svoje mleko.</h3><p>Kravlje ili kozje, jednokratno ili kao redovnu dostavu.</p></article>
            <article className="ritual-step"><span aria-hidden="true">02</span><h3>Pronađite svoj ritam.</h3><p>Odredite litre i nedeljnu ili dvonedeljnu dostavu. Vaš izbor je uvek jasno prikazan pre poručivanja.</p></article>
            <article className="ritual-step"><span aria-hidden="true">03</span><h3>Flaša se vraća. Ritual ostaje.</h3><p>Od druge dostave preuzimamo čiste korišćene flaše i donosimo pune.</p></article>
          </div>
          <div id="proveri-dostavu" className="pastoral-delivery"><DeliveryChecker title={settings.serviceAreaTitle} note={settings.serviceAreaNote} delivery={delivery} /></div>
        </div>
      </section>
      <section className="pastoral-faq" aria-labelledby="faq-home-title">
        <div className="page-shell">
          <div className="section-index"><span>05 / Pre prve dostave</span><span>Dobro je znati</span></div>
          <div className="faq-home">
            <div className="faq-intro"><h2 id="faq-home-title">Sve što želite<br /><em>da znate.</em></h2><p className="lead">O mleku, flašama i vašem ritmu.</p><a className="text-link" href="/kontakt">Tu smo za vas<span aria-hidden="true">↗</span></a></div>
            <div className="details-list faq-list">{frequentlyAskedQuestions.map(({ question, answer }) => <details key={question}><summary>{question}<span aria-hidden="true">＋</span></summary><p>{answer}</p></details>)}</div>
          </div>
        </div>
      </section>
      <section className="pastoral-close" aria-labelledby="closing-title"><div className="page-shell"><p className="eyebrow">Mleko i Mleko</p><h2 id="closing-title">Za vaša<br /><em>dobra jutra.</em></h2><p>{settings.guaranteeText}</p><a className="button" href="/prodavnica">Sastavi svoju dostavu<span aria-hidden="true">↗</span></a><p className="closing-note">{settings.guaranteeTitle}</p></div></section>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd({
        "@context": "https://schema.org", "@type": "FAQPage",
        mainEntity: frequentlyAskedQuestions.map(({ question, answer }) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })),
      }) }} />
    </div>
  );
}
