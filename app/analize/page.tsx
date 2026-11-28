import { localizedMetadata } from "@/app/lib/i18n/server";
import { getLocalize } from "@/app/lib/i18n/server";
import type { Metadata } from "next";
import Link from "next/link";
import { canonicalUrl } from "../lib/seo";
import { labReports } from "../lib/analyses";
import { ReportGallery } from "./report-gallery";
import { ContentStamp } from "../components/policy-page";

export async function generateMetadata(): Promise<Metadata> { return localizedMetadata({
  title: "Analize",
  description: "Originalni laboratorijski izveštaji o našem mleku.",
  alternates: { canonical: canonicalUrl("/analize") },
}); }

const facts = [
  { icon: "testirano", title: "Gde testiramo", text: "Mleko se laboratorijski testira u Zavodu za mlekarstvo Srbije." },
  { icon: "sveze", title: "Koliko često", text: "Internu kontrolu radimo pri svakom preuzimanju mleka, a laboratorijsku analizu u Zavodu dva puta mesečno." },
  { icon: "poreklo", title: "Šta objavljujemo", text: "Originalne izveštaje, onakve kakve dobijemo iz laboratorije, bez prepravki." },
] as const;

// A short glossary of the terms a raw-milk laboratory report usually carries, so a
// reader can follow the original document. One line each, no interpretation of results.
const glossary = [
  { term: "Mlečna mast", text: "Koliko masti ima u mleku. Naše mleko je punomasno — mast se ne obire." },
  { term: "Proteini", text: "Udeo belančevina u mleku." },
  { term: "Suva materija bez masti", text: "Sve što ostane kad se oduzmu voda i mast: proteini, mlečni šećer i minerali." },
  { term: "Broj somatskih ćelija", text: "Pokazatelj zdravlja vimena. Manji broj znači zdravije grlo." },
  { term: "Ukupan broj mikroorganizama", text: "Pokazatelj higijene muže i hlađenja mleka." },
  { term: "Inhibitorne materije", text: "Provera da u mleku nema ostataka antibiotika." },
  { term: "Tačka mržnjenja", text: "Provera da mleku nije dodata voda." },
  { term: "Aflatoksin M1", text: "Može dospeti u mleko kada životinja pojede hranu kontaminiranu aflatoksinom B1. Ako je rađena ova analiza, rezultat potraži u redu označenom kao „Aflatoksin M1“." },
] as const;

/** "Naše mleko. Naše analize." (spec 19 Nov 2026, §11; more context added 20 Nov). */
export default async function AnalysesPage() {
  const localize = await getLocalize();
  return localize((
    <div className="content-page analyses-page">
      <header className="content-band content-hero">
        <div className="page-shell content-head">
          <div className="page-heading">
            <p className="eyebrow">Analize</p>
            <h1>Naše mleko. Naše analize.</h1>
            <p className="lead">Kvalitet mleka ne treba da bude stvar poverenja na reč. Zato naše mleko redovno laboratorijski testiramo, a rezultate delimo sa tobom.</p>
          </div>
          <ContentStamp />
        </div>
      </header>

      <section className="content-band" aria-label="Kako testiramo">
        <div className="page-shell">
          <ul className="analyses-facts">
            {facts.map((fact) => (
              <li key={fact.title}>
                {/* eslint-disable-next-line @next/next/no-img-element -- Local SVG icon. */}
                <img src={`/images/ikone/${fact.icon}.svg`} alt="" width="64" height="64" loading="lazy" />
                <h2>{fact.title}</h2>
                <p>{fact.text}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="content-band content-band--soft" aria-labelledby="izvestaji-title">
        <div className="page-shell">
          <div className="section-head"><h2 id="izvestaji-title">Izveštaji iz laboratorije</h2>{labReports.length ? <p className="lead">Klikni na izveštaj da ga uvećaš i pročitaš svaki red.</p> : null}</div>
          {labReports.length
            ? <ReportGallery reports={labReports} />
            : <p className="notice analyses-empty">Izveštaje objavljujemo ovde, u originalu, čim stignu iz laboratorije.</p>}
        </div>
      </section>

      <section className="content-band" aria-labelledby="pojmovi-title">
        <div className="page-shell">
          <div className="section-head"><h2 id="pojmovi-title">Kako da čitaš izveštaj</h2><p className="lead">Pojmovi koje najčešće srećeš u laboratorijskim izveštajima o sirovom mleku. Tačne vrednosti uvek čitaš na samom izveštaju.</p></div>
          <dl className="analyses-glossary">
            {glossary.map((item) => (
              <div key={item.term}><dt>{item.term}</dt><dd>{item.text}</dd></div>
            ))}
          </dl>
        </div>
      </section>

      <section className="content-band content-band--soft" aria-labelledby="sirovo-title">
        <div className="page-shell analyses-note">
          <h2 id="sirovo-title">Sirovo mleko i kuvanje</h2>
          <p>Naše mleko je sirovo i punomasno. Neki ga piju sirovo zbog prirodnog sastava nepasterizovanog mleka, u kome su prirodno aktivni mlečni enzimi. Naša preporuka je da ga svakako prokuvaš pre konzumiranja.</p>
          <div className="button-row"><Link className="button" href="/prodavnica">Izaberi svoje mleko</Link><Link className="button secondary" href="/kontakt">Imaš pitanje? Piši nam</Link></div>
        </div>
      </section>
    </div>
  ));
}
