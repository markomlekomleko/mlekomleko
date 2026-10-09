import { headers } from "next/headers";
import { cache } from "react";
import type { Metadata } from "next";
import { defaultLocale, isLocale, languageTags, locales, localizedPath, type Locale } from "./routing";
import { translate } from "./translate";
import { localizeTree } from "./render";
import { absoluteUrl } from "../seo";

export const getLocale = cache(async (): Promise<Locale> => {
  const value = (await headers()).get("x-store-locale") ?? "";
  return isLocale(value) ? value : defaultLocale;
});
export async function getLocalize() {
  const locale = await getLocale();
  return (node: import("react").ReactNode) => localizeTree(node, locale);
}
export function languageAlternates(path: string) {
  return Object.fromEntries([...locales.map(locale => [languageTags[locale], absoluteUrl(localizedPath(path, locale))]), ["x-default", absoluteUrl(path)]]);
}
function localizeImageAlt<T>(images: T, locale: Locale): T {
  if (Array.isArray(images)) return images.map(image => localizeImageAlt(image, locale)) as T;
  if (images && typeof images === "object" && "alt" in images && typeof images.alt === "string") {
    return { ...images, alt: translate(images.alt, locale) };
  }
  return images;
}
export async function localizedMetadata(metadata: Metadata): Promise<Metadata> {
  const locale = await getLocale();
  const requestPath = (await headers()).get("x-store-path") ?? "/";
  const original = metadata.alternates?.canonical;
  const path = original ? new URL(String(original), absoluteUrl("/")).pathname : requestPath;
  const privatePage = /^\/(?:admin|nalog|prijava|checkout|korpa)(?:\/|$)/.test(path);
  const canonical = absoluteUrl(localizedPath(path, locale));
  const title = typeof metadata.title === "string" ? translate(metadata.title, locale) : metadata.title && typeof metadata.title === "object" ? Object.fromEntries(Object.entries(metadata.title).map(([k, value]) => [k, typeof value === "string" ? translate(value, locale) : value])) as Metadata["title"] : undefined;
  const description = metadata.description ? translate(metadata.description, locale) : undefined;
  const og = metadata.openGraph ? { ...metadata.openGraph, ...(metadata.openGraph.images ? { images: localizeImageAlt(metadata.openGraph.images, locale) } : {}) } : {};
  const ogTitle = typeof og.title === "string" ? translate(og.title, locale) : typeof title === "string" ? title : undefined;
  return {
    ...metadata, title, description,
    ...(metadata.keywords ? { keywords: (Array.isArray(metadata.keywords) ? metadata.keywords : [metadata.keywords]).map(key => translate(key, locale)) } : {}),
    alternates: { canonical, ...(!privatePage ? { languages: languageAlternates(path) } : {}) },
    ...(privatePage ? { robots: { index: false, follow: false } } : {}),
    openGraph: { type: "website", siteName: "Mleko i Mleko", images: [{ url: "/images/mleko-i-mleko-og.jpg", width: 1200, height: 630, alt: translate("Mleko i Mleko — domaće mleko", locale) }], ...og, url: canonical, title: ogTitle, description: description ?? (og.description ? translate(og.description, locale) : undefined), locale: { "sr-latn": "sr_RS", "sr-cyrl": "sr_RS", en: "en_GB", ru: "ru_RU" }[locale], alternateLocale: ["sr_RS", "en_GB", "ru_RU"].filter(tag => tag !== { "sr-latn": "sr_RS", "sr-cyrl": "sr_RS", en: "en_GB", ru: "ru_RU" }[locale]) },
    twitter: { card: "summary_large_image", images: ["/images/mleko-i-mleko-og.jpg"], ...metadata.twitter, title: ogTitle, description },
  };
}
