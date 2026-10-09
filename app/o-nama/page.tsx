import type { Metadata } from "next";
import { canonicalUrl } from "../lib/seo";

export const metadata: Metadata = {
  title: "O nama",
  description: "Mleko i Mleko povezuje domaće proizvođače i kupce kroz jednostavnu dostavu.",
  alternates: { canonical: canonicalUrl("/o-nama") },
};

export default function AboutPage() {
  return (
    <div className="content-page">
      <header className="content-band content-hero">
        <div className="page-shell content-split">
          <div className="page-heading about-intro">
            <p className="eyebrow">O nama</p>
            <h1>Pravo mleko više nije daleko.</h1>
            <p className="lead">Mleko i Mleko donosi punomasno sirovo kravlje i kozje mleko sa domaćih farmi direktno na kućnu adresu.</p>
            <p className="content-text">Dostavljamo ga u povratnim staklenim flašama kako bismo čuvali ukus i zajedno smanjili nepotreban otpad. Posebne tvrdnje o poreklu i kontroli objavljujemo tek uz odgovarajuću dokumentaciju dobavljača.</p>
            <div className="button-row"><a className="button" href="/farme">Naše farme</a></div>
          </div>
          <figure className="content-media">
            <picture>
              <source srcSet="/images/pastoral-morning.avif" type="image/avif" />
              <img src="/images/pastoral-morning.webp" alt="Livade u jutarnjoj izmaglici" width="1536" height="1024" decoding="async" />
            </picture>
          </figure>
        </div>
      </header>
    </div>
  );
}
