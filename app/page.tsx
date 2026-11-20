import { localizedMetadata } from "@/app/lib/i18n/server";
import { getLocalize } from "@/app/lib/i18n/server";
import type { Metadata } from "next";
import { HeroSlider } from "./components/home/hero-slider";
import { FaqSection } from "./components/home/faq-section";
import { MarqueeBand } from "./components/home/marquee-band";
import { OfferSection } from "./components/home/offer-section";
import { SocialSection } from "./components/home/social-section";
import { MilkSection } from "./components/home/milk-section";
import { ProducersSection } from "./components/home/producers-section";
import { frequentlyAskedQuestions } from "./lib/content";
import { normalizeProduct } from "./lib/frontend";
import { canonicalUrl, serializeJsonLd } from "./lib/seo";
import { getStorefront } from "../server/storefront";

export async function generateMetadata(): Promise<Metadata> { return localizedMetadata({
  title: "Domaće kravlje mleko na tvojoj adresi",
  description:
    "Punomasno sirovo kravlje mleko u povratnoj staklenoj flaši, sa dostavom u Beogradu i Novom Sadu.",
  alternates: { canonical: canonicalUrl("/") },
}); }
export const dynamic = "force-dynamic";

export default async function HomePage() {
  const localize = await getLocalize();
  const storefront = await getStorefront();
  const { delivery } = storefront;
  const products = storefront.products.map(normalizeProduct);

  return localize((
    <div className="home">
      <HeroSlider />
      <MarqueeBand />
      {/* Order from the final spec (19 Nov 2026): "Sa paše do flaše", buying, the producers,
          "Mleko uživo", and the questions last. */}
      <MilkSection />
      <OfferSection products={products} delivery={delivery} />
      <ProducersSection />
      <SocialSection />
      <FaqSection />

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
  ));
}
