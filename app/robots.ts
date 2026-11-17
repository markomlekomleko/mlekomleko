import type { MetadataRoute } from "next";
import { canonicalUrl } from "./lib/seo";
import { defaultLocale, locales } from "./lib/i18n/routing";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api/", ...["", ...locales.filter(locale => locale !== defaultLocale).map(locale => `/${locale}`)].flatMap(prefix => ["/nalog", "/prijava", "/checkout", "/korpa"].map(path => prefix + path))],
    },
    sitemap: canonicalUrl("/sitemap.xml"),
  };
}
