import type { Metadata } from "next";
import { Hero } from "./components/hero";
import { ClosingSection } from "./components/home/closing-section";
import { FaqSection } from "./components/home/faq-section";
import { MarqueeBand } from "./components/home/marquee-band";
import { OfferSection } from "./components/home/offer-section";
import { OriginSection } from "./components/home/origin-section";
import { RhythmSection } from "./components/home/rhythm-section";
import { StepsSection } from "./components/home/steps-section";
import { frequentlyAskedQuestions } from "./lib/content";
import { normalizeProduct } from "./lib/frontend";
import { heroMedia } from "./lib/hero-media";
import { canonicalUrl, serializeJsonLd } from "./lib/seo";
import { getStorefront } from "../server/storefront";

export const metadata: Metadata = {
  title: "Domaće kravlje i kozje mleko na tvojoj adresi",
  description:
    "Punomasno sirovo kravlje i kozje mleko u povratnim staklenim flašama, sa dostavom u Beogradu i Novom Sadu.",
  alternates: { canonical: canonicalUrl("/") },
};
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const storefront = await getStorefront();
  const { settings, delivery } = storefront;
  const products = storefront.products.map(normalizeProduct);

  return (
    <div className="home">
      <Hero media={heroMedia} offerHref="#izaberite-mleko" deliveryHref="#proveri-dostavu" />
      <MarqueeBand />
      <OfferSection products={products} bundles={storefront.bundles} delivery={delivery} />
      <StepsSection settings={settings} delivery={delivery} />
      <OriginSection settings={settings} />
      <RhythmSection />
      <FaqSection />
      <ClosingSection settings={settings} />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: serializeJsonLd({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: frequentlyAskedQuestions.map(({ question, answer }) => ({
              "@type": "Question",
              name: question,
              acceptedAnswer: { "@type": "Answer", text: answer },
            })),
          }),
        }}
      />
    </div>
  );
}
