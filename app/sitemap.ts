import type { MetadataRoute } from "next";
import { absoluteUrl } from "./lib/seo";
import { listProducts } from "../server/products";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const products = await listProducts();
  const routes = [
    "",
    "/prodavnica",
    "/dostava-mleka/beograd",
    "/dostava-mleka/novi-sad",
    "/kako-funkcionise",
    "/gde-kupiti",
    "/o-nama",
    "/farme",
    "/faq",
    "/kontakt",
  ];
  const staticEntries = routes.map((route) => ({
    url: absoluteUrl(route || "/"),
    changeFrequency: route === "/prodavnica" ? "daily" : "monthly",
    priority: route === "" ? 1 : route === "/prodavnica" ? 0.9 : 0.6,
  })) satisfies MetadataRoute.Sitemap;
  const productEntries = products.map((product) => {
    const updatedAt = new Date(product.updatedAt);
    return {
      url: absoluteUrl(`/proizvodi/${encodeURIComponent(product.slug)}`),
      ...(Number.isNaN(updatedAt.getTime()) ? {} : { lastModified: updatedAt }),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    };
  });
  return [...staticEntries, ...productEntries];
}
