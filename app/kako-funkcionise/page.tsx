import { localizedMetadata } from "@/app/lib/i18n/server";
import { getLocalize } from "@/app/lib/i18n/server";
import type { Metadata } from "next";
import { ContentStamp } from "../components/policy-page";
import { canonicalUrl } from "../lib/seo";
import { getBusinessSettings } from "@/server/settings";
import { formatMoney } from "../lib/frontend";

export async function generateMetadata(): Promise<Metadata> { return localizedMetadata({
  title: "Kako funkcioniše",
  description: "Saznaj kako rade jednokratne porudžbine i redovna dostava.",
  alternates: { canonical: canonicalUrl("/kako-funkcionise") },
}); }

export default async function HowItWorksPage() {
  const localize = await getLocalize();
  const settings = await getBusinessSettings();
  return localize((
    <div className="content-page">
      <header className="content-band content-hero">
        <div className="page-shell content-head">
          <div className="page-heading">
            <p className="eyebrow">Kako funkcioniše</p>
            <h1>Ti biraš mleko, litre i ritam.</h1>
            <p className="lead">Biraš količinu po dostavi i ritam. Paket sadrži četiri nedeljne ili dve dvonedeljne dostave. Ceo paket plaćaš gotovinom pri prvoj dostavi.</p>
          </div>
          <ContentStamp glyph="drop" />
        </div>
      </header>
      <div className="content-band content-band--brand">
        <div className="page-shell">
          {/* The <ol> carries the order for assistive technology; the numerals echo it. */}
          <ol className="how-steps">
            <li className="how-step"><span className="how-step-number" aria-hidden="true">01</span><h2>Izaberi mleko i litre</h2><p>Odaberi kravlje ili kozje mleko, zatim 2, 4 ili 8 litara po dostavi. Količinu možeš dodatno da podesiš dugmadima −&nbsp;i&nbsp;+.</p></li>
            <li className="how-step"><span className="how-step-number" aria-hidden="true">02</span><h2>Izaberi ritam</h2><p>Redovna dostava može biti svake nedelje ili svake dve nedelje. Beogradske rute su utorkom i petkom, a novosadska petkom.</p></li>
            <li className="how-step"><span className="how-step-number" aria-hidden="true">03</span><h2>Vrati flaše i zadrži kontrolu</h2><p>Od druge isporuke vraćaš čiste korišćene flaše. Pre roka možeš da promeniš količinu, preskočiš dostavu, pauziraš ili otkažeš pretplatu.</p></li>
          </ol>
        </div>
      </div>
      <section className="content-band" aria-labelledby="cena-dostave-title">
        <div className="page-shell">
          <div className="how-price-row">
            <div className="content-card how-price"><h2 id="cena-dostave-title">Cena dostave</h2><p>{formatMoney(settings.deliveryFeeMinor/100)} po poseti, ukupno {formatMoney(settings.deliveryFeeMinor*4/100)} za četiri posete. Zajedničku dostavu i popuste računamo u korpi pre potvrde.</p></div>
            <div className="button-row content-actions"><a className="button" href="/prodavnica">Počni kupovinu</a><a className="button secondary" href="/faq">Česta pitanja</a></div>
          </div>
        </div>
      </section>
    </div>
  ));
}
