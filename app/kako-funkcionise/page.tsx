/* eslint-disable @next/next/no-img-element -- Pre-optimised local illustrations. */
import { localizedMetadata } from "@/app/lib/i18n/server";
import { getLocalize } from "@/app/lib/i18n/server";
import type { Metadata } from "next";
import Link from "next/link";
import { subscriptionQuestions } from "../lib/content";
import { canonicalUrl } from "../lib/seo";

export async function generateMetadata(): Promise<Metadata> { return localizedMetadata({
  title: "Mesečna pretplata",
  description: "Kako stiže tvoje mleko: od muže na domaćinstvu, preko staklene flaše, do tvojih vrata — i nazad.",
  alternates: { canonical: canonicalUrl("/kako-funkcionise") },
}); }

/**
 * The whole road of a subscriber's milk, in the Kafeterija subscription-page layout:
 * one illustrated stop per step, then the three things the subscriber controls, then the
 * subscription questions (moved here from the origin page, meeting 17 Nov 2026). The
 * delivery price is deliberately not mentioned on this page.
 */
const road = [
  { art: "muza", title: "Muža na domaćinstvu", text: "Mleko dolazi od domaćina koji sami čuvaju i muzu svoje krave i koze." },
  { art: "mlekadzija", title: "Dolazimo po mleko", text: "Naše vozilo preuzima sveže mleko direktno na farmi i nosi ga na punjenje." },
  { art: "flasiranje", title: "Staklena flaša", text: "Mleko sipamo u staklene povratne flaše. Bez plastike i bez tetrapaka — samo mleko i staklo." },
  { art: "korpa-na-pragu", title: "Na tvojim vratima", text: "Flaše stižu na tvoju adresu u Beogradu ili Novom Sadu, u terminu koji vidiš pre potvrde porudžbine." },
  { art: "povratne-flase", title: "Flaša ide u krug", text: "Od druge dostave vraćaš prazne čiste flaše, a preuzimaš pune. Staklo se pere i ponovo puni." },
] as const;

const controls = [
  { title: "Biraš mleko i litre", text: "Kravlje, kozje ili oba — 2, 4 ili 8 litara po dostavi, ili tačno koliko ti treba." },
  { title: "Biraš ritam", text: "Svake nedelje ili svake dve nedelje. Paket sadrži četiri nedeljne ili dve dvonedeljne dostave." },
  { title: "Sve menjaš na nalogu", text: "Pre roka menjaš količinu, preskačeš dostavu, pauziraš ili otkazuješ — bez poziva i objašnjavanja." },
] as const;

export default async function SubscriptionPage() {
  const localize = await getLocalize();
  return localize((
    <div className="content-page sub-page">
      <header className="content-band sub-hero">
        <div className="page-shell sub-hero-grid">
          <div className="page-heading">
            <p className="eyebrow">Mesečna pretplata</p>
            <h1>Tvoje mleko, svake nedelje.</h1>
            <p className="lead">Biraš mleko i ritam — mi muzemo, flaširamo i donosimo.</p>
          </div>
          <img className="sub-hero-art" src="/images/ilustracije/jutarnja-casa.webp" alt="Porodica za doručkom, dečak pije čašu mleka" width="1200" height="900" />
        </div>
      </header>

      <section className="content-band pattern-ground sub-road" aria-labelledby="put-title">
        <div className="page-shell">
          <div className="sub-road-card">
            <div className="section-head">
              <p className="eyebrow">Od krave do tvoje čaše</p>
              <h2 id="put-title">Put tvog mleka.</h2>
            </div>
            <ol className="sub-road-list">
              {road.map((stop, index) => (
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
            {/* After the fifth stop the reader knows the whole road: the moment to order. */}
            <div className="button-row sub-road-cta"><Link className="button" href="/#izaberite-mleko">Izaberi svoje mleko</Link></div>
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
