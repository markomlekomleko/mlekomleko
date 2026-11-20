/* eslint-disable @next/next/no-img-element -- Pre-optimised local illustration. */
import { localizedMetadata } from "@/app/lib/i18n/server";
import { getLocalize } from "@/app/lib/i18n/server";
import type { Metadata } from "next";
import { canonicalUrl } from "../lib/seo";
import { MlekomatMap, type Mlekomat } from "./mlekomat-map";
import { LeadForm } from "./partner-form";

export async function generateMetadata(): Promise<Metadata> { return localizedMetadata({
  title: "Mlekomati",
  description: "Mleko i Mleko mlekomati u Beogradu: lokacije na mapi, put do najbližeg i partnerstvo za postavljanje mlekomata.",
  alternates: { canonical: canonicalUrl("/gde-kupiti") },
}); }

// The locations the site has listed so far. When the client confirms the full list
// (their posts mention more), only this array changes.
const locations: readonly Mlekomat[] = [
  // Coordinates from OpenStreetMap, cross-checked on Google Maps (18 Nov 2026).
  { name: "Beo šoping centar", address: "Vojislava Ilića 141, Zvezdara", query: "Beo Shopping Center, Beograd", milk: "kravlje mleko", lat: 44.78673, lng: 20.50256 },
  { name: "Lidl Bežanijska kosa", address: "Partizanske avijacije bb, Novi Beograd", query: "Lidl Bežanijska kosa, Beograd", milk: "kravlje i kozje mleko", lat: 44.81794, lng: 20.38335 },
  { name: "Mega Roda Novi Beograd", address: "Đorđa Stanojevića 35, Novi Beograd", query: "Mega Roda, Đorđa Stanojevića 35, Beograd", milk: "kravlje mleko", lat: 44.80971, lng: 20.39687 },
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
          <img className="sub-hero-art" src="/images/crtezi/mlekomat.webp" alt="Devojka toči mleko u staklenu flašu na mlekomatu" width="1200" height="900" />
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
              {/* Self-hosted copy of the TikTok clip (18 Nov 2026), so no tracking blocker
                  can leave the box black. Captions are burned into the picture. */}
              {/* eslint-disable-next-line jsx-a11y/media-has-caption -- captions are burned into the footage */}
              <video
                src="/video/tiktok/7258739044731931909.mp4"
                poster="/images/tiktok/7258739044731931909.webp"
                controls
                playsInline
                preload="none"
                aria-label="Kako se koristi mlekomat"
              />
            </div>
          </div>
        </div>
      </section>

      <section id="partnerstvo" className="content-band content-band--soft" aria-labelledby="partner-title">
        <div className="page-shell">
          <div className="section-head"><p className="eyebrow">Poslovno partnerstvo</p><h2 id="partner-title">Mlekomat kod tebe?</h2></div>
          <div className="lead-forms">
            <article className="lead-form-card" aria-labelledby="prostor-title">
              <h3 id="prostor-title">Imaš prostor za naš mlekomat?</h3>
              <p>Pijaca, tržni centar, market ili pumpa — ako kod tebe prolaze ljudi koji vole pravo mleko, mi donosimo mlekomat, punimo ga i održavamo.</p>
              <LeadForm kind="mlekomat_space" />
            </article>
            <article className="lead-form-card" aria-labelledby="svoj-title">
              <h3 id="svoj-title">Želiš svoj mlekomat?</h3>
              <p>Iznajmljivanje mlekomata je u pripremi i još nije dostupno. Ostavi kontakt i javićemo ti se čim krene.</p>
              <LeadForm kind="mlekomat_rent" />
            </article>
          </div>
        </div>
      </section>
    </div>
  ));
}
