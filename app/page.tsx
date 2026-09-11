import type { Metadata } from "next";
import { DeliveryChecker } from "./components/delivery-checker";
import { BundleOffers } from "./components/bundle-offers";
import { HeroScene } from "./components/hero-scene";
import { ProductConfigurator } from "./components/product-configurator";
import { frequentlyAskedQuestions } from "./lib/content";
import { normalizeProduct } from "./lib/frontend";
import { heroMedia } from "./lib/hero-media";
import { canonicalUrl, serializeJsonLd } from "./lib/seo";
import { getStorefront } from "../server/storefront";

export const metadata: Metadata = {
  title: "Domaće kravlje i kozje mleko na tvojoj adresi",
  description:
    "Punomasno sirovo kravlje i kozje mleko u povratnim staklenim flašama, sa dostavom u Beogradu i Novom Sadu.",
  alternates: { canonical: canonicalUrl("/") },
};
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const storefront = await getStorefront();
  const { settings, delivery } = storefront;
  const products = storefront.products.map(normalizeProduct);
  const sellable = products.filter((product) => product.available);
  const offered = (sellable.length ? sellable : products).slice(0, 4);

  return (
    <div className="home">
      <HeroScene media={heroMedia} offerHref="#izaberite-mleko" deliveryHref="#proveri-dostavu" />

      <section id="izaberite-mleko" className="offer" aria-labelledby="offer-title">
        <div className="page-shell">
          <div className="section-head">
            <p className="eyebrow">01 / Ponuda</p>
            <h2 id="offer-title">Izaberi svoje mleko</h2>
            <p className="lead">Odaberi količinu i koliko često želiš dostavu.</p>
          </div>

          {offered.length ? (
            <div className="offer-grid" data-count={offered.length}>
              {offered.map((product) => (
                <ProductConfigurator key={product.id} product={product} delivery={delivery} />
              ))}
            </div>
          ) : (
            <p className="notice">
              Ponuda se trenutno priprema. Pogledaj <a href="/prodavnica">prodavnicu</a> ili nas kontaktiraj.
            </p>
          )}

          <BundleOffers products={products} bundles={storefront.bundles} delivery={delivery} />
        </div>
      </section>

      <section className="steps" aria-labelledby="steps-title">
        <div className="page-shell">
          <div className="section-head">
            <p className="eyebrow">02 / Kako stiže do tebe</p>
            <h2 id="steps-title">Tri koraka, bez komplikovanja.</h2>
          </div>
          <ol className="steps-grid">
            <li>
              <span aria-hidden="true">01</span>
              <h3>Izabereš mleko i ritam.</h3>
              <p>Kravlje ili kozje, jednokratno ili kao redovna dostava.</p>
            </li>
            <li>
              <span aria-hidden="true">02</span>
              <h3>Potvrdimo termin.</h3>
              <p>Sledeći datum dostave i rok za izmene vidiš pre potvrde porudžbine.</p>
            </li>
            <li>
              <span aria-hidden="true">03</span>
              <h3>Flaša se vraća.</h3>
              <p>Od druge dostave preuzimamo čiste korišćene flaše i donosimo pune.</p>
            </li>
          </ol>
          <div id="proveri-dostavu" className="steps-delivery">
            <DeliveryChecker
              title={settings.serviceAreaTitle}
              note={settings.serviceAreaNote}
              delivery={delivery}
            />
          </div>
        </div>
      </section>

      <section className="origin" aria-labelledby="origin-title">
        <picture className="origin-image">
          <source srcSet="/images/farma.avif" type="image/avif" />
          <source srcSet="/images/farma.webp" type="image/webp" />
          <img
            src="/images/farma.jpg"
            alt="Krave na pašnjaku — ilustracija domaćeg uzgoja"
            width="1600"
            height="1066"
            loading="lazy"
          />
        </picture>
        <div className="page-shell origin-content">
          <div>
            <p className="eyebrow">03 / Odakle dolazi</p>
            <h2 id="origin-title">
              Dobar ukus ima
              <br />
              <em>svoje poreklo.</em>
            </h2>
          </div>
          <div className="origin-copy">
            <p>
              Na domaćim farmama počinje put našeg kravljeg i kozjeg mleka. Do tebe stiže punomasno i
              sirovo, u povratnoj staklenoj flaši.
            </p>
            <a className="text-link" href="/farme">
              Upoznaj naše farme
            </a>
            {settings.announcementEnabled &&
            /(?:tiktok\.com|youtu\.?be)/i.test(settings.announcementUrl) ? (
              <a className="origin-video" href={settings.announcementUrl} target="_blank" rel="noreferrer">
                <span aria-hidden="true">▷</span>
                <span>
                  {settings.announcementText}
                  <small>{settings.announcementLinkLabel}</small>
                </span>
              </a>
            ) : null}
          </div>
        </div>
      </section>

      <section className="rhythm" aria-labelledby="rhythm-title">
        <div className="page-shell">
          <div className="section-head">
            <p className="eyebrow">04 / Tvoj ritam dostave</p>
            <h2 id="rhythm-title">Jednokratno ili redovno. Ti biraš.</h2>
          </div>
          <div className="rhythm-grid">
            <article>
              <h3>Jednokratno</h3>
              <p>Naručiš samo za sledeću dostavu. Bez obaveze i bez pretplate.</p>
            </article>
            <article>
              <h3>Svake nedelje</h3>
              <p>Isti izbor stiže svake nedelje. Količinu menjaš do roka za izmene.</p>
            </article>
            <article>
              <h3>Svake 2 nedelje</h3>
              <p>Mirniji ritam za manje domaćinstvo. Preskakanje i pauza su na nalogu.</p>
            </article>
          </div>
          <p className="rhythm-note">
            Izmene, preskakanje i pauza mogući su do roka koji je naveden uz svaku dostavu.
          </p>
        </div>
      </section>

      <section className="faq" aria-labelledby="faq-home-title">
        <div className="page-shell">
          <div className="section-head">
            <p className="eyebrow">05 / Pre prve porudžbine</p>
            <h2 id="faq-home-title">Sve što treba da znaš.</h2>
          </div>
          <div className="details-list faq-list">
            {frequentlyAskedQuestions.map(({ question, answer }) => (
              <details key={question}>
                <summary>
                  {question}
                  <span aria-hidden="true">＋</span>
                </summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
          <p className="faq-contact">
            Nisi našao odgovor? <a className="text-link" href="/kontakt">Piši nam.</a>
          </p>
        </div>
      </section>

      <section className="closing" aria-labelledby="closing-title">
        <div className="page-shell">
          <p className="eyebrow">Mleko i Mleko</p>
          <h2 id="closing-title">Spremno za tvoje sledeće jutro?</h2>
          <p>{settings.guaranteeText}</p>
          <a className="button" href="#izaberite-mleko">
            Izaberi svoje mleko
          </a>
        </div>
      </section>

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: frequentlyAskedQuestions.map(({ question, answer }) => ({
              "@type": "Question",
              name: question,
              acceptedAnswer: { "@type": "Answer", text: answer },
            })),
          }),
        }}
      />
    </div>
  );
}
