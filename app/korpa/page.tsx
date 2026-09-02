import type { Metadata } from "next";
import { CartView } from "./cart-view";
import { canonicalUrl } from "../lib/seo";

export const metadata: Metadata = {
  title: "Korpa",
  description: "Pregledajte proizvode, količine i ritam svake dostave.",
  alternates: { canonical: canonicalUrl("/korpa") },
  robots: { index: false, follow: true },
};

export default function CartPage() {
  return <CartView />;
}
