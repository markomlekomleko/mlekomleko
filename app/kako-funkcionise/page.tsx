/* eslint-disable @next/next/no-img-element -- Pre-optimised local illustrations. */
import { localizedMetadata } from "@/app/lib/i18n/server";
import { getLocalize } from "@/app/lib/i18n/server";
import type { Metadata } from "next";
import Link from "next/link";
import { subscriptionQuestions } from "../lib/content";
import { canonicalUrl } from "../lib/seo";

export async function generateMetadata(): Promise<Metadata> { return localizedMetadata({
  title: "Mesečna pretplata",
  description: "Kako funkcioniše pretplata: paket od četiri nedeljne dostave, plaćen unapred, koji menjaš, pauziraš ili otkazuješ na nalogu.",
  alternates: { canonical: canonicalUrl("/kako-funkcionise") },
}); }

/**
 * Only the subscription (20 Nov 2026): how the package works, step by step, what the
 * subscriber controls, and the subscription questions. Where the milk comes from and
 * its road to the bottle live on Poreklo tvog mleka.
 */
const steps = [
  { art: "flasiranje", title: "Izabereš litre", text: "2, 4 ili 8 litara po dostavi, ili tačno koliko ti treba — najmanje 2 litra. Litar u pretplati košta 250 dinara umesto 350." },
  { art: "mlekadzija", title: "Paket od četiri dostave", text: "Pretplata je paket od četiri nedeljne dostave, plaćen unapred: gotovinom pri prvoj dostavi ili uplatom na račun." },
  { art: "korpa-na-pragu", title: "Stiže jednom nedeljno", text: "U Beogradu utorkom ili petkom, u Novom Sadu petkom — do tvojih vrata. Do 36 sati pre ture možeš da dodaš litre, preskočiš dostavu ili pauziraš." },
  { art: "povratne-flase", title: "Flaše vraćaš", text: "Čiste prazne flaše vratiš pri sledećoj dostavi, a dobiješ pune." },
  { art: "jutarnja-casa", title: "Paket se obnavlja", text: "Novi paket kreće tek kada su sve četiri dostave stvarno isporučene. Posle 12 dostava poklanjamo ti 2 litra mleka i dostavu." },
] as const;

const controls = [
  { title: "Biraš litre", text: "2, 4 ili 8 litara po dostavi, ili tačno koliko ti treba — najmanje 2 litra." },
  { title: "Paket od četiri dostave", text: "Pretplata je paket od četiri nedeljne dostave, plaćen unapred. Novi paket kreće tek kada su sve četiri stvarno isporučene." },
  { title: "Sve menjaš na nalogu", text: "Do 36 sati pre ture dodaješ litre, preskačeš dostavu, pauziraš ili otkazuješ narednu obnovu — bez poziva i objašnjavanja." },
] as const;

export default async function SubscriptionPage() {
  const localize = await getLocalize();
  return localize((
    <div className="content-page sub-page">
      <header className="content-band sub-hero">
        <div className="page-shell sub-hero-grid">
          <div className="page-heading">
            <p className="eyebrow">Mesečna pretplata</p>
            <h1>Kako funkcioniše pretplata</h1>
            <p className="lead">Paket od četiri nedeljne dostave, plaćen unapred, koji menjaš, pauziraš ili otkazuješ kad god poželiš.</p>
          </div>
          <img className="sub-hero-art" src="/images/ilustracije/korpa-na-pragu.webp" alt="Korpa sa flašama mleka na pragu" width="1200" height="900" />
        </div>
      </header>

      <section className="content-band pattern-ground sub-road" aria-labelledby="put-title">
        <div className="page-shell">
          <div className="sub-road-card">
            <div className="section-head">
              <p className="eyebrow">Korak po korak</p>
              <h2 id="put-title">Pretplata u pet koraka.</h2>
            </div>
            <ol className="sub-road-list">
              {steps.map((stop, index) => (
                <li key={stop.art}>
                  <img src={`/images/ilustracije/${stop.art}.webp`} alt="" width="1200" height="900" loading="lazy" />
                  <div>
                    <span className="sub-road-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                    <h3>{stop.title}</h3>
                    <p>{stop.text}</p>
                  </div>
                </li>
              ))}
            </ol>
            
            <div className="button-row sub-road-cta"><Link className="button" href="/prodavnica?tip=pretplata">Izaberi pretplatu</Link></div>
          </div>
        </div>
      </section>

      <section className="content-band" aria-labelledby="kontrola-title">
        <div className="page-shell">
          <div className="section-head"><p className="eyebrow">Ti držiš kontrolu</p><h2 id="kontrola-title">Pretplata po tvom.</h2></div>
          <div className="content-grid content-grid--3">
            {controls.map((item) => (
              <article className="content-card sub-control" key={item.title}><h3>{item.title}</h3><p>{item.text}</p></article>
            ))}
          </div>
        </div>
      </section>

      <section className="content-band content-band--soft" aria-labelledby="pretplata-pitanja-title">
        <div className="page-shell">
          <div className="section-head"><p className="eyebrow">Pitanja o pretplati</p><h2 id="pretplata-pitanja-title">Nema glupih pitanja.</h2></div>
          <div className="details-list faq-list">
            {subscriptionQuestions.map(({ question, answer }) => (
              <details key={question}>
                <summary><span className="faq-question">{question}</span><span className="faq-icon" aria-hidden="true" /></summary>
                <p className="faq-answer">{answer}</p>
              </details>
            ))}
          </div>
          <div className="button-row content-actions"><Link className="button" href="/#izaberite-mleko">Izaberi svoje mleko</Link><a className="button secondary" href="/faq">Sva pitanja</a></div>
        </div>
      </section>
    </div>
  ));
}
