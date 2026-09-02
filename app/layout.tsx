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
  metadataBase: new URL("https://mleko-i-mleko.ivosevicluka2000.chatgpt.site"),
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
