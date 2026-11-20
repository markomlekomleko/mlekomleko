import { localizedMetadata } from "@/app/lib/i18n/server";
import { getLocalize } from "@/app/lib/i18n/server";
import type { Metadata } from "next";
import { canonicalUrl } from "../lib/seo";
import { labReports } from "../lib/analyses";
import { ReportGallery } from "./report-gallery";
import { ContentStamp } from "../components/policy-page";

export async function generateMetadata(): Promise<Metadata> { return localizedMetadata({
  title: "Analize",
  description: "Originalni laboratorijski izveštaji o našem mleku.",
  alternates: { canonical: canonicalUrl("/analize") },
}); }

/** "Naše mleko. Naše analize." (spec 19 Nov 2026, §11). */
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
      <section className="content-band" aria-label="Laboratorijski izveštaji">
        <div className="page-shell">
          {labReports.length
            ? <ReportGallery reports={labReports} />
            : <p className="notice">Izveštaje objavljujemo ovde, u originalu, čim stignu iz laboratorije.</p>}
        </div>
      </section>
    </div>
  ));
}
