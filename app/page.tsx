import { localizedMetadata } from "@/app/lib/i18n/server";
import { getLocalize } from "@/app/lib/i18n/server";
import type { Metadata } from "next";
import { Hero } from "./components/hero";
import { FaqSection } from "./components/home/faq-section";
import { MarqueeBand } from "./components/home/marquee-band";
import { OfferSection } from "./components/home/offer-section";
import { SocialSection } from "./components/home/social-section";
import { MilkSection } from "./components/home/milk-section";
import { StepsSection } from "./components/home/steps-section";
import { frequentlyAskedQuestions } from "./lib/content";
import { normalizeProduct } from "./lib/frontend";
import { heroMedia } from "./lib/hero-media";
import { canonicalUrl, serializeJsonLd } from "./lib/seo";
import { getStorefront } from "../server/storefront";

export async function generateMetadata(): Promise<Metadata> { return localizedMetadata({
  title: "Domaće kravlje i kozje mleko na tvojoj adresi",
  description:
    "Punomasno sirovo kravlje i kozje mleko u povratnim staklenim flašama, sa dostavom u Beogradu i Novom Sadu.",
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
      <Hero media={heroMedia} offerHref="#izaberite-mleko" />
      <MarqueeBand />
      {/* Order agreed on 17 Nov 2026: why this milk, steps, the shop, "Mleko uživo", and the questions last. */}
      <MilkSection />
      <StepsSection />
      <OfferSection products={products} delivery={delivery} />
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
