import { getLocalize, getLocale } from "@/app/lib/i18n/server";
import Link from "next/link";
import { DeliveryChecker } from "../components/delivery-checker";
import { ContentStamp } from "../components/policy-page";
import { formatMoney } from "../lib/frontend";
import { canonicalUrl, serializeJsonLd } from "../lib/seo";
import { getStorefront } from "../../server/storefront";

type CityDeliveryPageProps = {
  city: "Beograd" | "Novi Sad";
  slug: "beograd" | "novi-sad";
  deliveryDays: string;
  postalCodeHint: string;
  localDetail: string;
};

export async function CityDeliveryPage({
  city,
  slug,
  deliveryDays,
  postalCodeHint,
  localDetail,
}: CityDeliveryPageProps) {
  const localize = await getLocalize();
  const locale = await getLocale();
  const storefront = await getStorefront();
  const { settings, delivery } = storefront;
  const pageUrl = canonicalUrl(`/dostava-mleka/${slug}`);
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Početna", item: canonicalUrl("/") },
      { "@type": "ListItem", position: 2, name: `Dostava mleka — ${city}`, item: pageUrl },
    ],
  };
  const questions = [
    {
      question: "Kada stiže dostava?",
      answer: `${deliveryDays}. Tačan sledeći datum i krajnji rok za izmene prikazuju se pre poručivanja.`,
    },
    {
      question: "Da li moram da naručujem svake nedelje?",
      answer: "Ne. Možeš da poručiš jednom ili da izabereš nedeljni ili dvonedeljni ritam koji kasnije možeš da preskočiš, pauziraš ili otkažeš.",
    },
    {
      question: "Kako proveravam da li dostavljate na moju adresu?",
      answer: "Unesi poštanski broj u proveru iznad. Konačna provera se ponavlja i pri unosu adrese u checkout-u.",
    },
  ];

  return localize((
    <>
      <div className="content-page city-delivery-page">
        <header className="content-band content-hero">
          <div className="page-shell">
            <nav className="breadcrumbs" aria-label="Putanja">
              <Link href="/">Početna</Link> <span aria-hidden="true">/</span> <span aria-current="page">Dostava za {city}</span>
            </nav>
            <div className="content-head">
              <div className="page-heading">
                <p className="eyebrow">{deliveryDays}</p>
                <h1>Dostava domaćeg mleka u {city === "Beograd" ? "Beogradu" : "Novom Sadu"}.</h1>
                <p className="lead">
                  Poruči domaće kravlje ili kozje mleko u povratnim staklenim flašama.
                  Biraš litre i da li želiš jednu ili redovnu dostavu.
                </p>
                <div className="button-row">
                  <a className="button" href="/prodavnica">Izaberi mleko</a>
                  <a className="button secondary" href="/kako-funkcionise">Kako funkcioniše</a>
                </div>
              </div>
              <ContentStamp glyph="bottle" />
            </div>
          </div>
        </header>

        <div className="content-band content-band--brand city-checker">
          <div className="page-shell">
            <DeliveryChecker
              title={`Proveri adresu za ${city}`}
              note={`${postalCodeHint} ${localDetail}`}
              delivery={delivery}
              placeholder={city === "Novi Sad" ? "21000" : "11000"}
            />
          </div>
        </div>

        <section className="content-band" aria-labelledby="delivery-details-title">
          <div className="page-shell">
            <div className="section-head">
              <p className="eyebrow">Sve pre poručivanja</p>
              <h2 id="delivery-details-title">Jasni termini i cena dostave.</h2>
            </div>
            <div className="city-details">
              <article className="city-detail">
                <span className="city-detail-index" aria-hidden="true">01</span>
                <h3>Termin</h3>
                <p>{deliveryDays}. Sledeći dostupan datum vidiš pre potvrde porudžbine.</p>
              </article>
              <article className="city-detail">
                <span className="city-detail-index" aria-hidden="true">02</span>
                <h3>Cena</h3>
                <p>{formatMoney(settings.deliveryFeeMinor / 100, locale)} po terminu, prikazano i u korpi pre plaćanja.</p>
              </article>
              <article className="city-detail">
                <span className="city-detail-index" aria-hidden="true">03</span>
                <h3>Povrat flaša</h3>
                <p>Od sledeće isporuke vraćaš čiste korišćene flaše i preuzimaš pune.</p>
              </article>
            </div>
          </div>
        </section>

        <section className="content-band" aria-labelledby="city-faq-title">
          <div className="page-shell">
            <div className="section-head">
              <p className="eyebrow">Praktični odgovori</p>
              <h2 id="city-faq-title">Dostava mleka za {city}.</h2>
            </div>
            {/* Same rows as the home and /faq lists (home/faq.css). */}
            <div className="details-list faq-list">
              {questions.map(({ question, answer }, index) => (
                <details key={question} open={index === 0}>
                  <summary>
                    <span className="faq-question">{question}</span>
                    <span className="faq-icon" aria-hidden="true" />
                  </summary>
                  <p className="faq-answer">{answer}</p>
                </details>
              ))}
            </div>
          </div>
        </section>
      </div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }}
      />
    </>
  ));
}
