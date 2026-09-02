import type { Metadata } from "next";
import { canonicalUrl } from "../lib/seo";

export const metadata: Metadata = {
  title: "Gde kupiti",
  description: "Online poručivanje i lokacije Mleko i Mleko mlekomata u Beogradu.",
  alternates: { canonical: canonicalUrl("/gde-kupiti") },
};

export default function WhereToBuyPage() {
  return (
    <div className="page-shell narrow">
      <header className="page-heading"><p className="eyebrow">Gde kupiti</p><h1>Dostava ili mlekomat.</h1><p className="lead">Poručite za Beograd i Novi Sad ili svratite na jednu od tri lokacije mlekomata u Beogradu.</p></header>
      <div className="form-stack">
        <section className="card"><h2>Online dostava</h2><p>Izaberite kravlje ili kozje mleko i koliko litara želite po dostavi.</p><div className="button-row"><a className="button" href="/prodavnica">Izaberi mleko</a><a className="button secondary" href="/dostava-mleka/beograd">Beograd</a><a className="button secondary" href="/dostava-mleka/novi-sad">Novi Sad</a></div></section>
        <section className="card"><h2>Mlekomati u Beogradu</h2><ul><li>Beo Shopping Center — kravlje mleko</li><li>Lidl Bežanijska kosa — kravlje i kozje mleko</li><li>Mega Roda Novi Beograd — kravlje mleko</li></ul></section>
      </div>
    </div>
  );
}
