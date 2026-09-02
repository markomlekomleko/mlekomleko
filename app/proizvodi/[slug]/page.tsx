import type { Metadata } from "next";
import { ProductDetail } from "./product-detail";
import { getProduct } from "../../../server/products";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  try {
    const product = await getProduct((await params).slug);
    return {
      title: product.seoTitle?.includes("Mleko i Mleko")
        ? { absolute: product.seoTitle }
        : product.seoTitle || product.name,
      description: product.seoDescription || product.shortDescription,
      openGraph: product.imageUrl ? { images: [{ url: product.imageUrl, alt: product.imageAlt || product.name }] } : undefined,
    };
  } catch {
    return { title: "Proizvod nije pronađen", robots: { index: false, follow: false } };
  }
}

export default async function ProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  return <ProductDetail slug={slug} />;
}
