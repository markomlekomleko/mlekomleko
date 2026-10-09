import { localizedMetadata } from "@/app/lib/i18n/server";
import { getLocalize } from "@/app/lib/i18n/server";
import { BrandIllustration } from "../components/brand-illustration";
import type { Metadata } from "next";
import { canonicalUrl } from "../lib/seo";

export async function generateMetadata(): Promise<Metadata> { return localizedMetadata({
  title: "Naše farme",
  description: "Put domaćeg kravljeg i kozjeg mleka od farme do tvoje adrese.",
  alternates: { canonical: canonicalUrl("/farme") },
}); }

export default async function FarmsPage() {
  const localize = await getLocalize();
  return localize((
    <div className="content-page">
      <header className="content-band content-hero">
        <div className="page-shell content-split">
          <div className="page-heading">
            <p className="eyebrow">Put našeg mleka</p>
            <h1>Tradicija sa farme, dostava za danas.</h1>
            <p className="lead">Sarađujemo sa domaćim farmama i organizujemo dostavu mleka u povratnim staklenim flašama.</p>
            <div className="button-row"><a className="button" href="/prodavnica">Izaberi mleko →</a><a className="button secondary" href="/kontakt">Kontakt</a></div>
          </div>
          <figure className="content-media">
            <BrandIllustration />
          </figure>
        </div>
      </header>

      <section className="content-band" aria-labelledby="profil-title">
        <div className="page-shell">
          <div className="section-head"><p className="eyebrow">Šta dobijaš</p><h2 id="profil-title">Kvalitet koji možeš da prepoznaš.</h2></div>
          <div className="content-grid content-grid--3">
            <article className="content-card"><span className="content-card-index" aria-hidden="true">01</span><h3>Punomasno i sirovo</h3><p>Prirodan ukus i punoća od koje možeš da napraviš pravi domaći kajmak.</p></article>
            <article className="content-card"><span className="content-card-index" aria-hidden="true">02</span><h3>Dokumentovan kvalitet</h3><p>Podatke o kontroli i deklaraciji objavljujemo uz proizvod kada su potvrđeni dokumentacijom dobavljača.</p></article>
            <article className="content-card"><span className="content-card-index" aria-hidden="true">03</span><h3>Povratno staklo</h3><p>Čiste korišćene flaše vraćaš pri sledećoj dostavi, a preuzimaš pune.</p></article>
          </div>
        </div>
      </section>

      <section className="content-band content-band--brand farm-route" aria-labelledby="ruta-title">
        <div className="page-shell">
          <div className="farm-route-grid">
            <div><p className="eyebrow">Put proizvoda</p><h2 id="ruta-title">Od potvrđene količine do tvoje adrese.</h2></div>
            <ol><li><strong>Planiranje</strong><span>Porudžbine se zaključavaju pre pripreme.</span></li><li><strong>Priprema</strong><span>Farma dobija zbir potrebnih količina.</span></li><li><strong>Ruta</strong><span>Dostava se grupiše po terminu i adresi.</span></li><li><strong>Kontrola</strong><span>Problem se vezuje za konkretnu porudžbinu.</span></li></ol>
          </div>
          <aside className="farm-disclosure"><strong>Poreklo mleka</strong><p>Za dodatne informacije o dobavljačima i poreklu proizvoda <a href="/kontakt">kontaktiraj nas</a>.</p></aside>
        </div>
      </section>
    </div>
  ));
}
