import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Kako funkcioniše",
  description: "Saznajte kako rade jednokratne porudžbine i redovna dostava.",
};

export default function HowItWorksPage() {
  return (
    <div className="page-shell narrow">
      <header className="page-heading">
        <p className="eyebrow">Kako funkcioniše</p>
        <h1>Vi birate šta i koliko često.</h1>
        <p className="lead">Svaki proizvod u istoj korpi može imati drugačiji ritam.</p>
      </header>
      <div className="form-stack">
        <section className="card"><h2>1. Sastavite korpu</h2><p>Za svaki proizvod odaberite jednokratnu kupovinu ili mesečnu pretplatu. Kod pretplate birate dostavu svake nedelje ili svake dve nedelje.</p></section>
        <section className="card"><h2>2. Potvrdite dostavu</h2><p>Unesite adresu i izaberite kartično ili gotovinsko plaćanje. Za mesečnu pretplatu obračun prati planirane isporuke tog meseca.</p></section>
        <section className="card"><h2>3. Menjajte na vreme</h2><p>Pre roka prikazanog na nalogu možete promeniti količinu, ukloniti ili dodati proizvod, preskočiti sledeću dostavu, pauzirati ili trajno otkazati pretplatu.</p></section>
      </div>
      <div className="button-row"><a className="button" href="/prodavnica">Počni kupovinu</a><a className="button secondary" href="/faq">Česta pitanja</a></div>
    </div>
  );
}
