import { getLocale, localizedMetadata } from "./lib/i18n/server";
import { languageTags } from "./lib/i18n/routing";
import { LocaleProvider } from "./lib/i18n/client";
import { localizeSchema } from "./lib/i18n/render";
import type { Metadata } from "next";
import { Archivo, Fraunces, Geist, Vollkorn } from "next/font/google";
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

// Headlines: heavy uppercase. The width axis lets phones condense long Serbian words
// (tokens.css --display-wdth) without a second font file.
const archivo = Archivo({
  variable: "--font-display",
  subsets: ["latin", "latin-ext"],
  axes: ["wdth"],
  display: "swap",
  preload: true,
});

// Card and product names, at the one weight they are set in. Static 800 rather than the
// variable font with its SOFT axis: that file is about 118 KB against 36 KB here and took
// the home page's fonts to 340 KB, over the 300 KB budget. Not preloaded: it only sets
// names, so it must not compete with the headline and body faces for bandwidth.
const fraunces = Fraunces({
  variable: "--font-card",
  subsets: ["latin", "latin-ext"],
  weight: "800",
  display: "swap",
  preload: false,
});

// Vollkorn supports Cyrillic product names as well as the admin editorial style.
// It loads only where used, keeping the Latin storefront font budget unchanged.
const vollkorn = Vollkorn({
  variable: "--font-vollkorn",
  subsets: ["latin", "latin-ext", "cyrillic"],
  style: ["normal", "italic"],
  display: "swap",
  preload: false,
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
      className={`${geist.variable} ${archivo.variable} ${fraunces.variable} ${vollkorn.variable}`}
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
