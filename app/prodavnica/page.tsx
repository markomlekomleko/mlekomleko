import type { Metadata } from "next";
import { StoreView } from "./store-view";
import { normalizeProduct } from "../lib/frontend";
import { canonicalUrl } from "../lib/seo";
import { listProducts } from "../../server/products";

export const metadata: Metadata = {
  title: "Prodavnica",
  description:
    "Domaće kravlje i kozje mleko po litru, sa izborom količine i ritma dostave.",
  alternates: { canonical: canonicalUrl("/prodavnica") },
};

export default async function StorePage() {
  const products = (await listProducts()).map(normalizeProduct);
  return <StoreView initialProducts={products} />;
}
