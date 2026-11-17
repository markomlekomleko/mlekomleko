/* eslint-disable @next/next/no-img-element -- Pre-optimised local illustrations and photos. */
import { localizedMetadata } from "@/app/lib/i18n/server";
import { getLocalize } from "@/app/lib/i18n/server";
import type { Metadata } from "next";
import Link from "next/link";
import { milkQuestions } from "../lib/content";
import { canonicalUrl } from "../lib/seo";

export async function generateMetadata(): Promise<Metadata> { return localizedMetadata({
  title: "Poreklo tvog mleka",
  description: "Odakle dolazi domaće kravlje i kozje mleko, šta je u flaši i zašto staklo.",
  alternates: { canonical: canonicalUrl("/farme") },
}); }

const inBottle = [
  { art: "muza", title: "Punomasno i sirovo", text: "Prirodan ukus i punoća od koje možeš da napraviš pravi domaći kajmak." },
  { art: "flasiranje", title: "Dokumentovan kvalitet", text: "Podatke o kontroli i deklaraciji objavljujemo uz proizvod kada su potvrđeni dokumentacijom dobavljača." },
  { art: "povratne-flase", title: "Povratno staklo", text: "Čiste korišćene flaše vraćaš pri sledećoj dostavi, a preuzimaš pune." },
] as const;

/**
 * Where the milk comes from (meeting 17 Nov 2026: "Glavne uloge" removed, the sections
 * about what is in the milk widened with pictures, and only milk questions here — the
 * subscription questions live on the Mesečna pretplata page).
 */
export default async function OriginPage() {
  const localize = await getLocalize();
  return localize((
    <div className="content-page origin-page">
      <header className="content-band sub-hero">
        <div className="page-shell sub-hero-grid">
          <div className="page-heading">
            <p className="eyebrow">Poreklo tvog mleka</p>
            <h1>Sa paše do flaše.</h1>
            <p className="lead">Kravlje i kozje mleko sa domaćih porodičnih farmi, u povratnim staklenim flašama — do tvojih vrata ili do mlekomata u tvom kraju.</p>
            <div className="button-row"><Link className="button" href="/#izaberite-mleko">Izaberi svoje mleko</Link><a className="button secondary" href="/kako-funkcionise">Put tvog mleka</a></div>
          </div>
          <img className="sub-hero-art" src="/images/ilustracije/pasnjak.webp" alt="Krava i koza zajedno na pašnjaku" width="1200" height="900" />
        </div>
      </header>

      <section className="content-band" aria-labelledby="u-flasi-title">
        <div className="page-shell">
          <div className="section-head"><p className="eyebrow">Šta dobijaš</p><h2 id="u-flasi-title">Šta je u flaši.</h2></div>
          <div className="content-grid content-grid--3">
            {inBottle.map((item) => (
              <article className="content-card art-card" key={item.title}>
                <img src={`/images/ilustracije/${item.art}.webp`} alt="" width="1200" height="900" loading="lazy" />
                <h3>{item.title}</h3>
                <p>{item.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="content-band pattern-ground" aria-labelledby="dve-vrste-title">
        <div className="page-shell">
          <div className="kinds-card">
            <div className="section-head"><p className="eyebrow">Dve vrste mleka</p><h2 id="dve-vrste-title">Kravlje i kozje.</h2></div>
            <div className="kinds-grid">
              <article className="kind" data-kind="cow">
                <img src="/images/karusel/kravlje-krava.webp" alt="Krava na pašnjaku" width="1080" height="1350" loading="lazy" />
                <h3>Domaće kravlje mleko</h3>
                <p>Punomasno, punog ukusa — za kafu, kačamak i domaći kajmak.</p>
              </article>
              <article className="kind" data-kind="goat">
                <img src="/images/karusel/kozje-koza.webp" alt="Koza na pašnjaku" width="1080" height="1350" loading="lazy" />
                <h3>Domaće kozje mleko</h3>
                <p>Punomasno i sirovo, sa domaćih farmi — za one koji traže baš kozje.</p>
              </article>
            </div>
          </div>
        </div>
      </section>

      <section className="content-band content-band--soft" aria-labelledby="mleko-pitanja-title">
        <div className="page-shell">
          <div className="section-head"><p className="eyebrow">Pitanja o mleku</p><h2 id="mleko-pitanja-title">Šta te zanima o mleku?</h2></div>
          <div className="details-list faq-list">
            {milkQuestions.map(({ question, answer }) => (
              <details key={question}>
                <summary><span className="faq-question">{question}</span><span className="faq-icon" aria-hidden="true" /></summary>
                <p className="faq-answer">{answer}</p>
              </details>
            ))}
          </div>
          <p className="faq-contact">Pitanja o dostavi i pretplati su na strani <a className="text-link" href="/kako-funkcionise">Mesečna pretplata</a>.</p>
        </div>
      </section>
    </div>
  ));
}
