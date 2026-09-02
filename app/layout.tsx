import type { Metadata } from "next";
import { Geist } from "next/font/google";
import { CartProvider } from "./components/cart-provider";
import { AnalyticsProvider } from "./components/analytics-provider";
import { SiteFooter, SiteHeader } from "./components/site-shell";
import { getStorefront } from "../server/storefront";
import "./globals.css";

const geist = Geist({
  variable: "--font-geist",
  subsets: ["latin", "latin-ext"],
});

export const metadata: Metadata = {
  metadataBase: new URL("http://localhost:3000"),
  title: {
    default: "Mleko i Mleko | Domaći mlečni proizvodi",
    template: "%s | Mleko i Mleko",
  },
  description:
    "Poručite sveže mleko i domaće mlečne proizvode jednokratno ili uz redovnu dostavu na kućnu adresu.",
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
    title: "Mleko i Mleko | Dostava mlečnih proizvoda",
    description: "Sastavite jednokratnu ili redovnu dostavu mlečnih proizvoda i menjajte je kada vam odgovara.",
    images: [{ url: "/images/mleko-i-mleko-og.jpg", width: 1200, height: 630, alt: "Mleko i Mleko — demo mlečni proizvodi" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Mleko i Mleko | Dostava mlečnih proizvoda",
    description: "Sastavite jednokratnu ili redovnu dostavu i menjajte je kada vam odgovara.",
    images: ["/images/mleko-i-mleko-og.jpg"],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const storefront = await getStorefront();
  const { settings } = storefront;
  return (
    <html lang="sr-Latn">
      <body className={geist.variable}>
        <AnalyticsProvider>
          <CartProvider>
            <a className="skip-link" href="#glavni-sadrzaj">
              Preskoči na glavni sadržaj
            </a>
            <SiteHeader settings={settings} />
            <main id="glavni-sadrzaj">{children}</main>
            <SiteFooter storeName={settings.storeName} />
          </CartProvider>
        </AnalyticsProvider>
      </body>
    </html>
  );
}
