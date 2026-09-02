import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/admin", "/nalog", "/checkout", "/prijava/potvrda"],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
