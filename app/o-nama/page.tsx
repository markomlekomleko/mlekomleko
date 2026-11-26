/* eslint-disable @next/next/no-img-element -- Pre-optimised local photos and illustration. */
import { localizedMetadata } from "@/app/lib/i18n/server";
import { getLocalize } from "@/app/lib/i18n/server";
import type { Metadata } from "next";
import { canonicalUrl } from "../lib/seo";
import { producers } from "../lib/producers";

export async function generateMetadata(): Promise<Metadata> { return localizedMetadata({
  title: "O nama",
  description: "Mleko i Mleko povezuje domaće proizvođače sa ljudima koji žele pravo, sveže i punomasno mleko, bez odlaska na farmu.",
  alternates: { canonical: canonicalUrl("/o-nama") },
}); }

export default async function AboutPage() {
  const localize = await getLocalize();
  return localize((
    <div className="content-page about-page">
      <header className="content-band content-hero">
        <div className="page-shell content-split">
          <div className="page-heading about-intro">
            <p className="eyebrow">O nama</p>
            <h1>Dobro mleko ne bi trebalo da bude teško pronaći.</h1>
            <p className="lead">Zato je nastalo Mleko i Mleko.</p>
            <p className="content-text">Povezujemo domaće proizvođače sa ljudima koji žele pravo, sveže i punomasno mleko, bez potrebe da sami odlaze na farmu. Biramo proizvođače, organizujemo redovne kontrole i brinemo da mleko stigne do tvojih vrata.</p>
            <div className="button-row"><a className="button" href="/prodavnica">Izaberi svoje mleko</a><a className="button secondary" href="/analize">Pogledaj analize</a></div>
          </div>
          <figure className="content-media">
            <img className="sub-hero-art" src="/images/crtezi/domacin.webp" alt="Nasmejani domaćin drži kantu mleka" width="1200" height="900" />
          </figure>
        </div>
      </header>

      <section id="farmeri" className="content-band content-band--soft" aria-labelledby="ljudi-title">
        <div className="page-shell">
          <div className="section-head"><h2 id="ljudi-title">Ljudi iza svake flaše</h2></div>
          <div className="about-farmers">
            {producers.map((producer) => (
              <figure className="about-farmer" key={producer.id}>
                <img src={producer.image} alt={producer.alt} width={producer.width} height={producer.height} style={{ objectPosition: producer.focus }} loading="lazy" />
                <figcaption>
                  <h3>{producer.name}</h3>
                  {producer.place ? <p className="about-farmer-place">{producer.place}</p> : null}
                  <p>{producer.story}</p>
                </figcaption>
              </figure>
            ))}
          </div>
        </div>
      </section>

      <section className="content-band" aria-labelledby="osnivac-title">
        <div className="page-shell about-founder">
          <figure className="about-founder-photo">
            <img src="/images/domacini/osnivac-marko-krsmancic.webp" alt="Marko Krsmančić, osnivač Mleko i Mleko, ispred mlekomata" width="868" height="952" loading="lazy" />
          </figure>
          <div>
            <h2 id="osnivac-title">Ko stoji iza Mleko i Mleko?</h2>
            <blockquote className="about-founder-quote">
              <p>„Želeli smo da domaće mleko ponovo bude lako dostupno. Da kupci znaju ko ga proizvodi, da mogu da pogledaju analize i da ga dobiju na svoju adresu. Naš posao je da povežemo dobre proizvođače i ljude koji cene njihov rad.“</p>
              <footer className="about-founder-name"><strong>Marko Krsmančić</strong><span>osnivač Mleko i Mleko</span></footer>
            </blockquote>
          </div>
        </div>
      </section>
    </div>
  ));
}
