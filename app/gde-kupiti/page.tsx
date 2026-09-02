import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Gde kupiti",
  description: "Online poručivanje i informacije o dostupnosti Mleko i Mleko proizvoda.",
};

export default function WhereToBuyPage() {
  return (
    <div className="page-shell narrow">
      <header className="page-heading"><p className="eyebrow">Gde kupiti</p><h1>Najlakše je online.</h1><p className="lead">Izaberite proizvode i adresu, a dostupne termine dostave videćete tokom kupovine.</p></header>
      <section className="card"><h2>Online prodavnica</h2><p>Poručivanje je trenutno dostupno direktno kroz našu prodavnicu. Informacije o fizičkim prodajnim mestima biće dodate kada budu potvrđene.</p><a className="button" href="/prodavnica">Otvori prodavnicu</a></section>
    </div>
  );
}
