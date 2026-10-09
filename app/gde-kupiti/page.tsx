import { localizedMetadata } from "@/app/lib/i18n/server";
import { getLocalize } from "@/app/lib/i18n/server";
import type { Metadata } from "next";
import { ContentStamp } from "../components/policy-page";
import { canonicalUrl } from "../lib/seo";

export async function generateMetadata(): Promise<Metadata> { return localizedMetadata({
  title: "Gde kupiti",
  description: "Online poručivanje i lokacije Mleko i Mleko mlekomata u Beogradu.",
  alternates: { canonical: canonicalUrl("/gde-kupiti") },
}); }

export default async function WhereToBuyPage() {
  const localize = await getLocalize();
  return localize((
    <div className="content-page">
      <header className="content-band content-hero">
        <div className="page-shell content-head">
          <div className="page-heading"><p className="eyebrow">Gde kupiti</p><h1>Dostava ili mlekomat.</h1><p className="lead">Poruči za Beograd i Novi Sad ili svrati na jednu od tri lokacije mlekomata u Beogradu.</p></div>
          <ContentStamp glyph="bottle" />
        </div>
      </header>
      <div className="content-band">
        <div className="page-shell">
          <div className="content-grid content-grid--2">
            <section className="content-card"><h2>Online dostava</h2><p>Izaberi kravlje ili kozje mleko i koliko litara želiš po dostavi.</p><div className="button-row"><a className="button" href="/prodavnica">Izaberi mleko</a><a className="button secondary" href="/dostava-mleka/beograd">Beograd</a><a className="button secondary" href="/dostava-mleka/novi-sad">Novi Sad</a></div></section>
            <section className="content-card"><h2>Mlekomati u Beogradu</h2><p>Naše mleko u tvojoj blizini, na tri lokacije.</p><ul className="content-list"><li><strong>Beo Shopping Center</strong><span>kravlje mleko</span></li><li><strong>Lidl Bežanijska kosa</strong><span>kravlje i kozje mleko</span></li><li><strong>Mega Roda Novi Beograd</strong><span>kravlje mleko</span></li></ul></section>
          </div>
        </div>
      </div>
    </div>
  ));
}
