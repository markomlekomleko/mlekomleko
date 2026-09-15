import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { ProductConfigurator } from "./components/product-configurator";
import { HeroScene } from "./components/hero-scene";
import { heroMedia } from "./lib/hero-media";
import { frequentlyAskedQuestions } from "./lib/content";
import { normalizeProduct } from "./lib/frontend";
import { canonicalUrl, serializeJsonLd } from "./lib/seo";
import { getStorefront } from "../server/storefront";
import styles from "./market.module.css";

export const metadata: Metadata = {
  title: "Domaće kravlje i kozje mleko na tvojoj adresi",
  description: "Punomasno sirovo kravlje i kozje mleko u povratnim staklenim flašama, sa dostavom u Beogradu i Novom Sadu.",
  alternates: { canonical: canonicalUrl("/") },
};
export const dynamic = "force-dynamic";

function Wave({ bottom = false }: { bottom?: boolean }) {
  return bottom ? (
    <svg className={styles.wave} viewBox="0 0 1440 89" aria-hidden="true">
      <path fill="#FFF9EA" d="M272 0C159.239 0 44.3179 51.0123 0 69.296V89H1440V85.2723C1412.98 85.2723 1332.51 62.9053 1198.08 54.9178C1045.73 45.8647 872.445 85.2722 718.499 77.8167C569.395 70.5957 412.951 0 272 0Z" />
    </svg>
  ) : (
    <svg className={styles.wave} viewBox="0 0 1440 94" aria-hidden="true">
      <path fill="currentColor" d="M596.757 21.4939C870.187 70.0522 1295.3 105.494 1440 58.3845V94H0V37.4939C121.746 8.05225 356.24 -21.2193 596.757 21.4939Z" />
    </svg>
  );
}

function StepIcon({ type }: { type: "truck" | "box" | "bottle" }) {
  return (
    <svg viewBox="0 0 40 40" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      {type === "truck" ? <><path fill="#fff9ea" d="M3 10h21v20H3zM24 17h7l6 7v6H24z" /><path d="M27 19v6h8M6 15h13M6 19h9" /><circle cx="10" cy="31" r="4" fill="#fff9ea" /><circle cx="30" cy="31" r="4" fill="#fff9ea" /></> : type === "box" ? <><path fill="#fff9ea" d="m5 11 16-5 14 6-2 23-26-2z" /><path d="m5 11 15 6 15-5M20 17l-1 17M14 8l15 6v8l-6 2v-8" /></> : <><path fill="#fff9ea" d="M15 4h10v8l4 7v15a3 3 0 0 1-3 3H14a3 3 0 0 1-3-3V19l4-7z" /><path d="M15 8h10M12 22h16v9H12M16 26h8" /></>}
    </svg>
  );
}

const faq = [frequentlyAskedQuestions[2], frequentlyAskedQuestions[3], frequentlyAskedQuestions[0], frequentlyAskedQuestions[7]];

export default async function HomePage() {
  const storefront = await getStorefront();
  const products = storefront.products.map(normalizeProduct).filter((product) => product.available).slice(0, 4);

  return (
    <div className={styles.page} data-market-home>
      <div className={styles.animatedHero}>
        <HeroScene media={heroMedia} offerHref="#izaberite-mleko" />
      </div>

      <div className={styles.greenBand}>
        <section className={styles.steps} aria-labelledby="steps-title">
          <h2 id="steps-title">Tri koraka, bez komplikovanja.</h2>
          <ol className={styles.stepGrid}>
            <li><StepIcon type="truck" /><div><h3>Izabereš mleko i ritam.</h3><p>Kravlje ili kozje, jednokratno ili kao redovna dostava.</p></div></li>
            <li><StepIcon type="box" /><div><h3>Potvrdimo termin.</h3><p>Sledeći datum dostave i rok za izmene vidiš pre potvrde porudžbine.</p></div></li>
            <li><StepIcon type="bottle" /><div><h3>Flaša se vraća.</h3><p>Od druge dostave preuzimamo čiste korišćene flaše i donosimo pune.</p></div></li>
          </ol>
          <Link className={`${styles.button} ${styles.whiteButton}`} href="/kako-funkcionise">Kako dostavljamo</Link>
        </section>
        <Wave bottom />
      </div>

      <section className={styles.intro} aria-labelledby="selection-title">
        <h2 id="selection-title">Izaberi svoje mleko</h2>
        <p>Na domaćim farmama počinje put našeg kravljeg i kozjeg mleka. Do tebe stiže punomasno i sirovo, u povratnoj staklenoj flaši.</p>
        <p>Odaberi količinu i koliko često želiš dostavu.</p>
        <Link className={styles.button} href="#izaberite-mleko">Izaberi svoje mleko</Link>
      </section>

      <section className={styles.split} aria-labelledby="origin-title">
        <Image className={styles.sectionImage} src="/images/farma.webp" alt="Krave na pašnjaku domaće farme" width={1600} height={1066} sizes="(max-width: 767px) 100vw, 400px" />
        <div className={styles.splitCopy}>
          <h2 id="origin-title">Dobar ukus ima svoje poreklo.</h2>
          <p>Sarađujemo sa <Link href="/farme">domaćim farmama</Link> i organizujemo dostavu mleka u povratnim staklenim flašama.</p>
          <p>Na domaćim farmama počinje put našeg kravljeg i kozjeg mleka. Do tebe stiže punomasno i sirovo, u povratnoj staklenoj flaši.</p>
        </div>
      </section>

      <section className={`${styles.split} ${styles.reversed}`} aria-labelledby="quality-title">
        <Image className={`${styles.sectionImage} ${styles.breakfastImage}`} src="/images/hero-dairy-demo.webp" alt="Mleko i domaći mlečni proizvodi na jutarnjem stolu" width={1800} height={1200} sizes="(max-width: 767px) 100vw, 400px" />
        <div className={styles.splitCopy}>
          <h2 id="quality-title">Kvalitet koji možete da prepoznate.</h2>
          <p>Punomasno i sirovo. Prirodan ukus i punoća od koje možete napraviti pravi domaći kajmak.</p>
        </div>
      </section>

      <section className={styles.split} aria-labelledby="bottles-title">
        <Image className={styles.sectionImage} src="/media/hero/end-desktop.webp" alt="Povratna staklena flaša Mleko i Mleko" width={2560} height={1440} sizes="(max-width: 767px) 100vw, 400px" />
        <div className={styles.splitCopy}>
          <h2 id="bottles-title">Flaša se vraća.</h2>
          <p>Mleko stiže u staklenim flašama. Od druge dostave vraćaš čiste korišćene flaše, a preuzimaš nove pune.</p>
        </div>
      </section>

      <section id="izaberite-mleko" className={styles.products} aria-labelledby="products-title">
        <h2 id="products-title">Kravlje i kozje mleko</h2>
        <div className={styles.orderGrid}>
          {products.map((product) => (
            <ProductConfigurator key={product.id} product={product} delivery={storefront.delivery} />
          ))}
        </div>
      </section>

      <section className={styles.split} aria-labelledby="rhythm-title">
        <Image className={styles.sectionImage} src="/images/catalog/kozje-mleko-v2.webp" alt="Kozje mleko u povratnoj staklenoj flaši" width={1080} height={1080} sizes="(max-width: 767px) 100vw, 400px" />
        <div className={styles.splitCopy}>
          <h2 id="rhythm-title">Jednokratno ili redovno. Ti biraš.</h2>
          <ul>
            <li>Naručiš samo za sledeću dostavu. Bez obaveze i bez pretplate.</li>
            <li>Isti izbor stiže svake nedelje. Količinu menjaš do roka za izmene.</li>
            <li>Svake 2 nedelje. Mirniji ritam za manje domaćinstvo.</li>
            <li>Preskakanje i pauza su na nalogu.</li>
          </ul>
        </div>
      </section>

      <div className={styles.lightGreenBand}>
        <Wave />
        <section className={styles.closing} aria-labelledby="closing-title">
          <h2 id="closing-title">Spremno za tvoje sledeće jutro?</h2>
          <p>{storefront.settings.guaranteeText}</p>
          <Link className={styles.button} href="#izaberite-mleko">Izaberi svoje mleko</Link>
        </section>
        <Wave bottom />
      </div>

      <section className={styles.faq} aria-labelledby="faq-title">
        <h2 id="faq-title">Sve što treba da znaš.</h2>
        {faq.map(({question, answer}, index) => (
          <details key={question} name="delivery-faq" open={index === 0}>
            <summary>{question}<span aria-hidden="true" /></summary>
            <p>{answer}</p>
          </details>
        ))}
      </section>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: serializeJsonLd({
        "@context": "https://schema.org", "@type": "FAQPage",
        mainEntity: faq.map(({question, answer}) => ({ "@type": "Question", name: question, acceptedAnswer: { "@type": "Answer", text: answer } })),
      }) }} />
    </div>
  );
}
