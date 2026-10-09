import { locales, localizedPath } from "./lib/i18n/routing";
import { languageAlternates } from "./lib/i18n/server";
import { listContentPages } from "../server/content-pages";
import type { MetadataRoute } from "next";
import { absoluteUrl } from "./lib/seo";
import { listProducts } from "../server/products";

export const dynamic = "force-dynamic";

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
    "/uslovi-kupovine",
    "/privatnost",
    "/dostava",
    "/reklamacije",
    "/pravila-pretplate",
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
  const contentEntries = (await listContentPages(true)).map(page => ({ url: absoluteUrl(`/informacije/${page.slug}`), lastModified: new Date(page.updatedAt), changeFrequency: "monthly" as const, priority: 0.6 }));
  return [...staticEntries, ...productEntries, ...contentEntries].flatMap(entry => {
    const path = new URL(entry.url).pathname;
    return locales.map(locale => ({ ...entry, url: absoluteUrl(localizedPath(path, locale)), alternates: { languages: languageAlternates(path) } }));
  });
}
