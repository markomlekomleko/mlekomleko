import type { Metadata } from "next";
import { canonicalUrl } from "../lib/seo";

export const metadata: Metadata = {
  title: "O nama",
  description: "Mleko i Mleko povezuje domaće proizvođače i kupce kroz jednostavnu dostavu.",
  alternates: { canonical: canonicalUrl("/o-nama") },
};

export default function AboutPage() {
  return (
    <div className="page-shell narrow">
      <header className="page-heading"><p className="eyebrow">O nama</p><h1>Pravo mleko više nije daleko.</h1></header>
      <section className="section" style={{ borderTop: 0, paddingTop: 0 }}><p className="lead">Mleko i Mleko donosi punomasno sirovo kravlje i kozje mleko sa domaćih farmi direktno na kućnu adresu.</p><p>Dostavljamo ga u povratnim staklenim flašama kako bismo čuvali ukus i zajedno smanjili nepotreban otpad. Posebne tvrdnje o poreklu i kontroli objavljujemo tek uz odgovarajuću dokumentaciju dobavljača.</p></section>
      <a className="button" href="/farme">Naše farme</a>
    </div>
  );
}
