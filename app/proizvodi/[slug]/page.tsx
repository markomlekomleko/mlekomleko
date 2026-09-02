import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache } from "react";
import { ProductDetail } from "./product-detail";
import { getProduct } from "../../../server/products";
import { getStorefront } from "../../../server/storefront";
import { DomainError } from "../../../server/domain";
import { normalizeProduct } from "../../lib/frontend";
import { absoluteUrl, canonicalUrl, serializeJsonLd } from "../../lib/seo";

const loadProduct = cache(async (slug: string) => {
  try {
    return await getProduct(slug);
  } catch (error) {
    if (error instanceof DomainError && error.status === 404) notFound();
    throw error;
  }
});

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const product = await loadProduct((await params).slug);
  const path = `/proizvodi/${encodeURIComponent(product.slug)}`;
  const title = product.seoTitle || product.name;
  const description = product.seoDescription || product.shortDescription;
  const image = product.imageUrl
    ? [{ url: absoluteUrl(product.imageUrl), alt: product.imageAlt || product.name }]
    : [];
  return {
    title: title.includes("Mleko i Mleko") ? { absolute: title } : title,
    description,
    alternates: { canonical: canonicalUrl(path) },
    openGraph: {
      type: "website",
      url: canonicalUrl(path),
      title,
      description,
      images: image,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: image,
    },
  };
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const [rawProduct, storefront] = await Promise.all([
    loadProduct(slug),
    getStorefront(),
  ]);
  const product = normalizeProduct(rawProduct);
  const recommendations = storefront.products
    .map(normalizeProduct)
    .filter((candidate) => candidate.id !== product.id)
    .slice(0, 3);
  const productUrl = canonicalUrl(`/proizvodi/${encodeURIComponent(product.slug)}`);
  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${productUrl}#product`,
    name: product.name,
    description: product.description || product.shortDescription,
    image: product.imageUrl ? [absoluteUrl(product.imageUrl)] : undefined,
    sku: product.id,
    brand: { "@type": "Brand", name: "Mleko i Mleko" },
    offers: {
      "@type": "Offer",
      url: productUrl,
      priceCurrency: "RSD",
      price: product.priceRsd.toFixed(2),
      availability: product.available
        ? "https://schema.org/InStock"
        : "https://schema.org/OutOfStock",
      itemCondition: "https://schema.org/NewCondition",
      seller: { "@id": `${canonicalUrl("/")}#organization` },
    },
  };
  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Početna", item: canonicalUrl("/") },
      { "@type": "ListItem", position: 2, name: "Prodavnica", item: canonicalUrl("/prodavnica") },
      { "@type": "ListItem", position: 3, name: product.name, item: productUrl },
    ],
  };
  return (
    <>
      <ProductDetail
        product={product}
        delivery={storefront.delivery}
        recommendations={recommendations}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(productJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbJsonLd) }}
      />
    </>
  );
}
