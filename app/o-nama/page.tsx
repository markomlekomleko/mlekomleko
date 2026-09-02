import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "O nama",
  description: "Mleko i Mleko povezuje domaće proizvođače i kupce kroz jednostavnu dostavu.",
};

export default function AboutPage() {
  return (
    <div className="page-shell narrow">
      <header className="page-heading"><p className="eyebrow">O nama</p><h1>Domaći proizvodi, bliže svakom domu.</h1></header>
      <section className="section" style={{ borderTop: 0, paddingTop: 0 }}><p className="lead">Mleko i Mleko nastaje sa jednostavnom idejom: kvalitetni, sveži proizvodi treba da stignu do kupca bez komplikovanog poručivanja.</p><p>Gradimo uslugu u kojoj se jednokratne potrebe i redovna porodična nabavka mogu spojiti u jednoj porudžbini. Poreklo, partneri i dodatne informacije biće objavljeni nakon potvrde podataka sa farmi.</p></section>
      <a className="button" href="/farme">Naše farme</a>
    </div>
  );
}
