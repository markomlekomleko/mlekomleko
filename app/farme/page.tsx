/* eslint-disable @next/next/no-img-element -- Pre-optimised local illustrations and photos. */
import { localizedMetadata } from "@/app/lib/i18n/server";
import { getLocalize } from "@/app/lib/i18n/server";
import type { Metadata } from "next";
import Link from "next/link";
import { milkQuestions } from "../lib/content";
import { producers } from "../lib/producers";
import { canonicalUrl } from "../lib/seo";

export async function generateMetadata(): Promise<Metadata> { return localizedMetadata({
  title: "Poreklo tvog mleka",
  description: "Odakle dolazi domaće kravlje i kozje mleko, šta je u flaši i zašto staklo.",
  alternates: { canonical: canonicalUrl("/farme") },
}); }

const kitchen = [
  { icon: "kajmak", title: "Pravi kajmak", text: "Prokuvaš dva litra, ostaviš da se ohladi i skineš oko 100 grama pravog domaćeg kajmaka." },
  { icon: "jogurt", title: "Domaći jogurt i kiselo mleko", text: "Gusti, sa korom od pavlake na vrhu i punim ukusom, kao nekad." },
  { icon: "sir", title: "Mladi sir", text: "Uz malo sirišta napraviš domaći mladi sir, kao na selu." },
  { icon: "kafa", title: "Kafa i kačamak", text: "Punomasno mleko daje kafi i kačamaku pun, domaći ukus." },
] as const;

// The road of the milk (moved here from the subscription page, 20 Nov 2026): we keep no
// animals of our own, we choose the farms and keep the road short.
const road = [
  { art: "muza", title: "Muža na domaćinstvu", text: "Mleko dolazi od domaćina koji sami čuvaju i muzu svoje krave." },
  { art: "mlekadzija", title: "Dolazimo po mleko", text: "Naše vozilo preuzima sveže mleko direktno na farmi i nosi ga na punjenje." },
  { art: "flasiranje", title: "Staklena flaša", text: "Mleko sipamo u staklene povratne flaše. Bez plastike i bez tetrapaka — samo mleko i staklo." },
  { art: "korpa-na-pragu", title: "Na tvojim vratima", text: "Flaše stižu na tvoju adresu u Beogradu ili Novom Sadu, u terminu koji vidiš pre potvrde porudžbine." },
  { art: "povratne-flase", title: "Flaša ide u krug", text: "Od druge dostave vraćaš prazne čiste flaše, a preuzimaš pune. Staklo se pere i ponovo puni." },
] as const;

// Real photos of the farms we buy from: one list shared with the home page and O nama.
const hosts = producers;

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
            <p className="lead">Biramo male domaće farme, preuzimamo mleko posle muže i donosimo ti ga sirovo i punomasno, pravo na vrata.</p>
          </div>
          <img className="sub-hero-art" src="/images/crtezi/farma.webp" alt="Mala porodična farma sa štalom, kravom i kozom" width="1200" height="900" />
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
          </div>
        </div>
      </section>

      <section className="content-band" aria-labelledby="farme-title">
        <div className="page-shell">
          <div className="section-head"><p className="eyebrow">Ko stoji iza flaše</p><h2 id="farme-title">Naše porodice.</h2><p className="lead">Ne držimo svoje krave. Naš posao je da nađemo domaćine koji to rade dobro i da njihovo mleko stigne do tebe onakvo kakvo je izašlo sa farme.</p></div>
          <div className="hosts-grid">
            {hosts.map((host) => (
              <figure className="host" key={host.id}>
                <img src={host.image} alt={host.alt} width={host.width} height={host.height} style={{ objectPosition: host.focus }} loading="lazy" />
                <figcaption><strong>{host.place ? `${host.name}, ${host.place}` : host.name}</strong><span>{host.story}</span></figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section className="content-band content-band--soft" aria-labelledby="kuhinja-title">
        <div className="page-shell">
          <div className="section-head"><p className="eyebrow">U tvojoj kuhinji</p><h2 id="kuhinja-title">Od jednog mleka, cela trpeza.</h2><p className="lead">Sirovo punomasno mleko nije samo za čašu — od njega praviš celu domaću trpezu.</p></div>
          <div className="kitchen-grid">
            {kitchen.map((item) => (
              <article className="content-card" key={item.title}><img className="kitchen-icon" src={`/images/grafike/${item.icon}.svg`} alt="" width="72" height="72" loading="lazy" /><h3>{item.title}</h3><p>{item.text}</p></article>
            ))}
          </div>
          {/* The order button closes the kitchen section (18 Nov 2026). */}
          <div className="button-row kitchen-cta"><Link className="button" href="/#izaberite-mleko">Izaberi svoje mleko</Link></div>
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
