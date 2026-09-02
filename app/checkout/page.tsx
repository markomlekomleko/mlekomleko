import type { Metadata } from "next";
import { CheckoutForm } from "./checkout-form";
import { canonicalUrl } from "../lib/seo";

export const metadata: Metadata = {
  title: "Plaćanje",
  description: "Unesite podatke za dostavu i izaberite način plaćanja.",
  alternates: { canonical: canonicalUrl("/checkout") },
  robots: { index: false, follow: true },
};

export default function CheckoutPage() {
  return <CheckoutForm />;
}
