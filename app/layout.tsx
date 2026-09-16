import type { Metadata } from "next";
import { ApplicationShell } from "./components/application-shell";
import { absoluteUrl, canonicalUrl, getSiteUrl, serializeJsonLd } from "./lib/seo";
import { getStorefront } from "../server/storefront";
import "./globals.css";
import "./storefront.css";
import "./pastoral.css";
import "./conversion.css";
import "./redesign.css";
import "./market-theme.css";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const metadata: Metadata = {
  metadataBase: getSiteUrl(),
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

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
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
    <html lang="sr-Latn" data-scroll-behavior="smooth">
      <body className="market-theme">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: serializeJsonLd(organizationJsonLd) }}
        />
        <ApplicationShell settings={settings}>{children}</ApplicationShell>
      </body>
    </html>
  );
}
