import type { Metadata } from "next";
import { canonicalUrl } from "../lib/seo";

export const metadata: Metadata = {
  title: "Kako funkcioniše",
  description: "Saznajte kako rade jednokratne porudžbine i redovna dostava.",
  alternates: { canonical: canonicalUrl("/kako-funkcionise") },
};

export default function HowItWorksPage() {
  return (
    <div className="page-shell narrow">
      <header className="page-heading">
        <p className="eyebrow">Kako funkcioniše</p>
        <h1>Vi birate mleko, litre i ritam.</h1>
        <p className="lead">Paketi od 8, 16 i 32 L mesečno odgovaraju količinama od 2, 4 i 8 L nedeljno.</p>
      </header>
      <div className="form-stack">
        <section className="card"><h2>1. Izaberite mleko i litre</h2><p>Odaberite kravlje ili kozje mleko, zatim 2, 4 ili 8 litara po dostavi. Količinu možete dodatno podesiti dugmadima − i +.</p></section>
        <section className="card"><h2>2. Izaberite ritam</h2><p>Redovna dostava može biti svake nedelje ili svake dve nedelje. Beogradske rute su utorkom i petkom, a novosadska petkom.</p></section>
        <section className="card"><h2>3. Vratite flaše i zadržite kontrolu</h2><p>Od druge isporuke vratite čiste korišćene flaše. Pre roka možete promeniti količinu, preskočiti dostavu, pauzirati ili otkazati pretplatu.</p></section>
        <section className="card"><h2>Cena dostave</h2><p>Dostava je 350 RSD po terminu, odnosno 1.400 RSD za četiri nedeljne isporuke u mesecu.</p></section>
      </div>
      <div className="button-row"><a className="button" href="/prodavnica">Počni kupovinu</a><a className="button secondary" href="/faq">Česta pitanja</a></div>
    </div>
  );
}
