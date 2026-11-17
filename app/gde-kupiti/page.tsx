/* eslint-disable @next/next/no-img-element -- Pre-optimised local illustration. */
import { localizedMetadata } from "@/app/lib/i18n/server";
import { getLocalize } from "@/app/lib/i18n/server";
import type { Metadata } from "next";
import { canonicalUrl } from "../lib/seo";
import { MlekomatMap, type Mlekomat } from "./mlekomat-map";
import { PartnerForm } from "./partner-form";

export async function generateMetadata(): Promise<Metadata> { return localizedMetadata({
  title: "Mlekomati",
  description: "Mleko i Mleko mlekomati u Beogradu: lokacije na mapi, put do najbližeg i partnerstvo za postavljanje mlekomata.",
  alternates: { canonical: canonicalUrl("/gde-kupiti") },
}); }

// The locations the site has listed so far. When the client confirms the full list
// (their posts mention more), only this array changes.
const locations: readonly Mlekomat[] = [
  { name: "Beo šoping centar", query: "Beo Shopping Center, Beograd", milk: "kravlje mleko" },
  { name: "Lidl Bežanijska kosa", query: "Lidl Bežanijska kosa, Beograd", milk: "kravlje i kozje mleko" },
  { name: "Mega Roda Novi Beograd", query: "Mega Roda, Novi Beograd", milk: "kravlje mleko" },
];

// The client's own mlekomat photos (sent 17 Nov 2026), web-sized into
// public/images/mlekomati/. The gallery renders only when this list has entries.
const photos: readonly { src: string; alt: string }[] = [];

/**
 * Mlekomati only — no home delivery here (meeting 17 Nov 2026) — plus the B2B section for
 * anyone with a space where a mlekomat could stand.
 */
export default async function MlekomatiPage() {
  const localize = await getLocalize();
  return localize((
    <div className="content-page mlekomati-page">
      <header className="content-band sub-hero">
        <div className="page-shell sub-hero-grid">
          <div className="page-heading">
            <p className="eyebrow">Mlekomati</p>
            <h1>Natoči sebi pravo mleko.</h1>
            <p className="lead">Domaće mleko iz mlekomata u Beogradu — natočiš koliko ti treba i platiš na licu mesta, gotovinom ili karticom.</p>
            <div className="button-row"><a className="button" href="#lokacije">Pronađi mlekomat</a><a className="button secondary" href="#partnerstvo">Postani partner</a></div>
          </div>
          <img className="sub-hero-art" src="/images/ilustracije/jutarnja-casa.webp" alt="" width="1200" height="900" />
        </div>
      </header>

      <section id="lokacije" className="content-band" aria-labelledby="lokacije-title">
        <div className="page-shell">
          <div className="section-head"><p className="eyebrow">Lokacije u Beogradu</p><h2 id="lokacije-title">Gde je najbliži mlekomat?</h2></div>
          <MlekomatMap locations={locations} />
        </div>
      </section>

      {photos.length ? (
        <section className="content-band" aria-label="Fotografije mlekomata">
          <div className="page-shell">
            <ul className="mlekomat-gallery">
              {photos.map((photo) => (
                <li key={photo.src}><img src={photo.src} alt={photo.alt} width="1200" height="800" loading="lazy" /></li>
              ))}
            </ul>
          </div>
        </section>
      ) : null}

      <section className="content-band pattern-ground" aria-labelledby="kako-toci-title">
        <div className="page-shell">
          <div className="kinds-card mlekomat-how">
            <div>
              <p className="eyebrow">Kako radi</p>
              <h2 id="kako-toci-title">Prosto kao pasulj.</h2>
              <ol className="mlekomat-steps">
                <li>Ubaci novac u mlekomat.</li>
                <li>Otvori mala vratanca sa leve strane i postavi flašu, malo nagnutu — tako mleko ne zapeni.</li>
                <li>Izaberi mleko i pritisni start.</li>
                <li>Kod kuće ga prokuvaj i uživaj.</li>
              </ol>
              <p className="mlekomat-bottle-note"><strong>Nisi poneo flašu?</strong> Pored mlekomata je flašomat sa staklenim flašama: ubaci novčanicu od 100 dinara, izaberi broj police i preuzmi flašu.</p>
            </div>
            <div className="mlekomat-video">
              <iframe
                src="https://www.tiktok.com/player/v1/7258739044731931909?description=0&music_info=0&rel=0"
                title="Kako se koristi mlekomat"
                loading="lazy"
                allow="encrypted-media; fullscreen; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      </section>

      <section id="partnerstvo" className="content-band content-band--soft" aria-labelledby="partner-title">
        <div className="page-shell partner-grid">
          <div className="page-heading">
            <p className="eyebrow">Poslovno partnerstvo</p>
            <h2 id="partner-title">Imaš prostor? Postavimo mlekomat.</h2>
            <p className="lead">Pijaca, tržni centar, market ili pumpa — ako kod tebe prolaze ljudi koji vole pravo mleko, mi donosimo mlekomat, punimo ga i održavamo.</p>
            <ul className="content-list partner-points">
              <li><strong>Mi postavljamo i punimo</strong><span>Aparat, mleko i održavanje su naša briga.</span></li>
              <li><strong>Ti daješ mesto</strong><span>Malo prostora i priključak za struju.</span></li>
              <li><strong>Dogovor po meri</strong><span>Najam ili partnerstvo — dogovaramo se za svaku lokaciju.</span></li>
            </ul>
          </div>
          <PartnerForm />
        </div>
      </section>
    </div>
  ));
}
