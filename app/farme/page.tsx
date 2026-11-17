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

// Raw versus shop milk, one fact per row. Only process facts, no health claims.
const compare = [
  { label: "Masnoća", ours: "Punomasno, sa svom pavlakom koju je dala krava ili koza.", shop: "Pavlaka se obira, pa se masnoća podešava na 2,8 ili 3,2%." },
  { label: "Homogenizacija", ours: "Nema je — pavlaka se sama skuplja na vrhu flaše.", shop: "Masne kapljice se usitnjavaju da se pavlaka nikad ne izdvoji." },
  { label: "Termička obrada", ours: "Nema je — ti biraš da li ćeš ga prokuvati.", shop: "Pasterizacija ili sterilizacija na visokoj temperaturi." },
  { label: "Rok trajanja", ours: "Nekoliko dana, zato ti ga donosimo sveže.", shop: "Nedeljama, a trajno mleko i mesecima, na rafu." },
] as const;

const kitchen = [
  { icon: "kajmak", title: "Pravi kajmak", text: "Prokuvaš dva litra, ostaviš da se ohladi i skineš oko 100 grama kajmaka. Od homogenizovanog mleka kajmak se ne hvata." },
  { icon: "jogurt", title: "Domaći jogurt i kiselo mleko", text: "Gusti, sa korom od pavlake na vrhu i punim ukusom, kao nekad." },
  { icon: "sir", title: "Mladi sir", text: "Uz malo sirišta napraviš domaći mladi sir, kao na selu." },
  { icon: "kafa", title: "Kafa i kačamak", text: "Punomasno mleko daje kafi i kačamaku punoću koju obrano ne može." },
] as const;

// We keep no animals of our own: the story is choosing the farms and the short road.
const chain = [
  { title: "Biramo domaćine", text: "Male porodične farme sa kojima radimo direktno, bez posrednika." },
  { title: "Preuzimamo posle muže", text: "Naše vozilo dolazi po sveže mleko direktno na farmu." },
  { title: "Hladimo i sipamo u staklo", text: "Bez plastike i tetrapaka — samo mleko i povratna staklena flaša." },
  { title: "Donosimo na tvoja vrata", text: "Bez magacina i rafa: sa farme ide pravo do tebe u Beogradu i Novom Sadu." },
] as const;

/**
 * Where the milk comes from: what raw milk is next to shop milk, what you make from it
 * at home, and who stands behind the bottle (we work with partner farmers and keep no
 * animals). Only milk questions here; subscription questions live on Mesečna pretplata.
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
            <p className="lead">Biramo male domaće farme, preuzimamo mleko posle muže i donosimo ti ga sirovo i punomasno — bez fabrike, magacina i rafa između.</p>
            <div className="button-row"><Link className="button" href="/#izaberite-mleko">Izaberi svoje mleko</Link><a className="button secondary" href="/kako-funkcionise">Put tvog mleka</a></div>
          </div>
          <img className="sub-hero-art" src="/images/grafike/pasnjak.svg" alt="Krava i koza zajedno na pašnjaku" width="1200" height="900" />
        </div>
      </header>

      <section className="content-band" aria-labelledby="sirovo-title">
        <div className="page-shell">
          <div className="section-head"><p className="eyebrow">Sirovo naspram industrijskog</p><h2 id="sirovo-title">Isto se zove. Nije isto mleko.</h2><p className="lead">Mleko iz prodavnice prođe kroz fabriku pre nego što stigne do tebe. Naše ne.</p></div>
          <div className="compare" role="table" aria-labelledby="sirovo-title">
            <div className="compare-row compare-head" role="row">
              <span role="columnheader"><span className="visually-hidden">Svojstvo</span></span>
              <span role="columnheader" className="compare-ours">Mleko i Mleko</span>
              <span role="columnheader">Industrijsko mleko</span>
            </div>
            {compare.map((row) => (
              <div className="compare-row" role="row" key={row.label}>
                <span role="rowheader" className="compare-label">{row.label}</span>
                <p role="cell" className="compare-ours">{row.ours}</p>
                <p role="cell">{row.shop}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="content-band content-band--soft" aria-labelledby="kuhinja-title">
        <div className="page-shell">
          <div className="section-head"><p className="eyebrow">U tvojoj kuhinji</p><h2 id="kuhinja-title">Od jednog mleka, cela trpeza.</h2><p className="lead">Sirovo punomasno mleko nije samo za čašu — od njega praviš ono što od kupovnog ne ide.</p></div>
          <div className="kitchen-grid">
            {kitchen.map((item) => (
              <article className="content-card" key={item.title}><img className="kitchen-icon" src={`/images/grafike/${item.icon}.svg`} alt="" width="72" height="72" loading="lazy" /><h3>{item.title}</h3><p>{item.text}</p></article>
            ))}
          </div>
        </div>
      </section>

      <section className="content-band" aria-labelledby="farme-title">
        <div className="page-shell">
          <div className="section-head"><p className="eyebrow">Ko stoji iza flaše</p><h2 id="farme-title">Mi biramo farme. Ti biraš mleko.</h2><p className="lead">Ne držimo svoje krave. Naš posao je da nađemo domaćine koji to rade dobro i da njihovo mleko stigne do tebe onakvo kakvo je izašlo sa farme.</p></div>
          <ol className="chain">
            {chain.map((step, index) => (
              <li key={step.title}>
                <span className="chain-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </li>
            ))}
          </ol>
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
