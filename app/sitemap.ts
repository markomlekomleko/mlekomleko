import type { MetadataRoute } from "next";

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const routes = ["", "/prodavnica", "/kako-funkcionise", "/gde-kupiti", "/o-nama", "/farme", "/faq", "/kontakt"];
  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency: route === "/prodavnica" ? "daily" : "monthly",
    priority: route === "" ? 1 : route === "/prodavnica" ? 0.9 : 0.6,
  }));
}
