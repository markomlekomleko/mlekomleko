import { getLocale, localizedMetadata } from "./lib/i18n/server";
import { languageTags } from "./lib/i18n/routing";
import { LocaleProvider } from "./lib/i18n/client";
import { localizeSchema } from "./lib/i18n/render";
import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { ApplicationShell } from "./components/application-shell";
import { absoluteUrl, canonicalUrl, getSiteUrl, serializeJsonLd } from "./lib/seo";
import { getStorefront } from "../server/storefront";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/marquee.css";
import "./styles/shell.css";
import "./styles/drawer.css";
import "./styles/components/configurator.css";
import "./styles/components/bundles.css";
import "./styles/components/delivery-checker.css";
import "./styles/components/delivery-calendar.css";
import "./styles/home/hero.css";
import "./styles/home/offer.css";
import "./styles/home/steps.css";
import "./styles/home/band.css";
import "./styles/home/origin.css";
import "./styles/home/rhythm.css";
import "./styles/home/faq.css";
import "./styles/home/closing.css";
import "./styles/pages/commerce.css";
import "./styles/pages/content.css";
import "./styles/admin.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin", "latin-ext", "cyrillic"],
});

const baseMetadata: Metadata = {
  metadataBase: getSiteUrl(),
  ...(process.env.GOOGLE_SITE_VERIFICATION ? { verification: { google: process.env.GOOGLE_SITE_VERIFICATION } } : {}),
  title: {
    default: "Mleko i Mleko | Domaće kravlje i kozje mleko",
    template: "%s | Mleko i Mleko",
  },
  description:
    "Poručite domaće kravlje i kozje mleko u povratnim staklenim flašama, sa dostavom u Beogradu i Novom Sadu.",
  keywords: [
    "sveže mleko",
    "domaće mleko",
    "dostava mleka",
    "kozje mleko",
    "mleko Beograd",
  ],
  robots: { index: true, follow: true },
  openGraph: {
    type: "website",
    locale: "sr_RS",
    siteName: "Mleko i Mleko",
    title: "Mleko i Mleko | Domaće mleko na kućnu adresu",
    description: "Izaberite kravlje ili kozje mleko, količinu i ritam dostave.",
    images: [{ url: "/images/mleko-i-mleko-og.jpg", width: 1200, height: 630, alt: "Mleko i Mleko — domaće mleko" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Mleko i Mleko | Domaće mleko na kućnu adresu",
    description: "Izaberite kravlje ili kozje mleko, količinu i ritam dostave.",
    images: ["/images/mleko-i-mleko-og.jpg"],
  },
  icons: {
    icon: [{ url: "/images/mleko-i-mleko-logo.png", type: "image/png" }],
    shortcut: "/images/mleko-i-mleko-logo.png",
    apple: "/images/mleko-i-mleko-logo.png",
  },
};

export async function generateMetadata(): Promise<Metadata> { return localizedMetadata(baseMetadata); }

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const storefront = await getStorefront();
  const { settings } = storefront;
  const organizationJsonLd = {
    "@context": "https://schema.org",
    "@type": "OnlineStore",
    "@id": `${canonicalUrl("/")}#organization`,
    name: settings.storeName,
    url: canonicalUrl("/"),
    logo: absoluteUrl("/images/mleko-i-mleko-logo.png"),
    image: absoluteUrl("/images/mleko-i-mleko-og.jpg"),
    description:
      "Domaće kravlje i kozje mleko u povratnim staklenim flašama, sa dostavom u Beogradu i Novom Sadu.",
    telephone: "+381605022323",
    areaServed: ["Beograd", "Novi Sad"],
    sameAs: [
      "https://instagram.com/mleko_i_mleko",
      "https://www.tiktok.com/@mleko_i_mleko",
    ],
  };
  return (
    // The font variables sit on <html> so the :root stacks in tokens.css (--ff-display …)
    // can resolve them: a custom property referencing another resolves where it is declared.
    <html
      lang={languageTags[locale]}
      data-scroll-behavior="smooth"
      className={geist.variable}
    >
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(localizeSchema(organizationJsonLd, locale)) }}
        />
        <LocaleProvider locale={locale}><ApplicationShell settings={settings}>{children}</ApplicationShell></LocaleProvider>
      </body>
    </html>
  );
}
