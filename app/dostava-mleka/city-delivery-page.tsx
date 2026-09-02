import Link from "next/link";
import { DeliveryChecker } from "../components/delivery-checker";
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

  return (
    <>
      <div className="page-shell city-delivery-page">
        <nav className="breadcrumbs" aria-label="Putanja">
          <Link href="/">Početna</Link> / <span aria-current="page">Dostava za {city}</span>
        </nav>
        <header className="page-heading">
          <p className="eyebrow">{deliveryDays}</p>
          <h1>Dostava domaćeg mleka u {city === "Beograd" ? "Beogradu" : "Novom Sadu"}.</h1>
          <p className="lead">
            Poručite domaće kravlje ili kozje mleko u povratnim staklenim flašama.
            Birate litre i da li želite jednu ili redovnu dostavu.
          </p>
          <div className="button-row">
            <a className="button" href="/prodavnica">Izaberite mleko</a>
            <a className="button secondary" href="/kako-funkcionise">Kako funkcioniše</a>
          </div>
        </header>

        <DeliveryChecker
          title={`Proverite adresu za ${city}`}
          note={`${postalCodeHint} ${localDetail}`}
          delivery={delivery}
        />

        <section className="section" aria-labelledby="delivery-details-title">
          <div className="section-heading">
            <p className="eyebrow">Sve pre poručivanja</p>
            <h2 id="delivery-details-title">Jasni termini i cena dostave.</h2>
          </div>
          <div className="grid-3 steps-grid">
            <article className="card number-card">
              <strong>01</strong>
              <h3>Termin</h3>
              <p>{deliveryDays}. Sledeći dostupan datum vidite pre potvrde porudžbine.</p>
            </article>
            <article className="card number-card">
              <strong>02</strong>
              <h3>Cena</h3>
              <p>{formatMoney(settings.deliveryFeeMinor / 100)} po terminu, prikazano i u korpi pre plaćanja.</p>
            </article>
            <article className="card number-card">
              <strong>03</strong>
              <h3>Povrat flaša</h3>
              <p>Od sledeće isporuke vraćate čiste korišćene flaše i preuzimate pune.</p>
            </article>
          </div>
        </section>

        <section className="section city-faq" aria-labelledby="city-faq-title">
          <div className="section-heading">
            <p className="eyebrow">Praktični odgovori</p>
            <h2 id="city-faq-title">Dostava mleka za {city}.</h2>
          </div>
          <div className="details-list">
            <details open>
              <summary>Kada stiže dostava?</summary>
              <p>{deliveryDays}. Tačan sledeći datum i krajnji rok za izmene prikazuju se pre poručivanja.</p>
            </details>
            <details>
              <summary>Da li moram da naručujem svake nedelje?</summary>
              <p>Ne. Možete poručiti jednom ili izabrati nedeljni ili dvonedeljni ritam koji kasnije možete preskočiti, pauzirati ili otkazati.</p>
            </details>
            <details>
              <summary>Kako proveravam da li dostavljate na moju adresu?</summary>
              <p>Unesite poštanski broj u proveru iznad. Konačna provera se ponavlja i pri unosu adrese u checkout-u.</p>
            </details>
          </div>
        </section>
      </div>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }}
      />
    </>
  );
}
