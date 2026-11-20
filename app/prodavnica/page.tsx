import { localizedMetadata } from "@/app/lib/i18n/server";
import { getLocalize } from "@/app/lib/i18n/server";
import type { Metadata } from "next";
import { StoreView } from "./store-view";
import { normalizeProduct, type BundleOffer } from "../lib/frontend";
import { canonicalUrl } from "../lib/seo";
import { getStorefront } from "../../server/storefront";

export async function generateMetadata(): Promise<Metadata> { return localizedMetadata({
  title: "Izaberi svoje mleko",
  description:
    "Domaći proizvodi sa dostavom na tvoju adresu. Istraži ponudu prodavnice Mleko i Mleko i izaberi količinu i ritam dostave.",
  alternates: { canonical: canonicalUrl("/prodavnica") },
}); }

export default async function StorePage() {
  const localize = await getLocalize();
  const storefront = await getStorefront();
  const products = storefront.products.map(normalizeProduct);
  return localize(<StoreView initialProducts={products} bundles={storefront.bundles as BundleOffer[]} delivery={storefront.delivery} />);
}
