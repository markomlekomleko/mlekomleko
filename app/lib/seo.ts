const LOCAL_SITE_URL = "http://localhost:3000";

function normalizeBaseUrl(value: string): URL {
  const url = new URL(value);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Javni URL sajta mora koristiti HTTP ili HTTPS.");
  }
  if (process.env.APP_ENV === "production" && url.protocol !== "https:") {
    throw new Error("Produkcioni javni URL sajta mora koristiti HTTPS.");
  }
  url.pathname = "/";
  url.search = "";
  url.hash = "";
  return url;
}

export function getSiteUrl(): URL {
  const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  const fallback = vercelHost ? `https://${vercelHost}` : LOCAL_SITE_URL;
  return normalizeBaseUrl(
    process.env.NEXT_PUBLIC_SITE_URL ?? process.env.APP_ORIGIN ?? fallback,
  );
}

export function absoluteUrl(path = "/"): string {
  if (/^https?:\/\//i.test(path)) return path;
  return new URL(path, getSiteUrl()).toString();
}

export function canonicalUrl(path = "/"): string {
  const url = new URL(path, getSiteUrl());
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
