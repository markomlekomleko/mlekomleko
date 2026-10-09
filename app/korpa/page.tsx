import { localizedMetadata } from "@/app/lib/i18n/server";
import { getLocalize } from "@/app/lib/i18n/server";
import type { Metadata } from "next";
import { CartView } from "./cart-view";
import { canonicalUrl } from "../lib/seo";

export async function generateMetadata(): Promise<Metadata> { return localizedMetadata({
  title: "Korpa",
  description: "Pregledaj proizvode, količine i ritam svake dostave.",
  alternates: { canonical: canonicalUrl("/korpa") },
  robots: { index: false, follow: true },
}); }

export default async function CartPage() {
  const localize = await getLocalize();
  return localize(<CartView />);
}
