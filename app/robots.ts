import type { MetadataRoute } from "next";
import { canonicalUrl } from "./lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/api/", ...["", "/sr-cyrl", "/en", "/ru"].flatMap(prefix => ["/nalog", "/prijava", "/checkout", "/korpa"].map(path => prefix + path))],
    },
    sitemap: canonicalUrl("/sitemap.xml"),
  };
}
