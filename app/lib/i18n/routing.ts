export const locales = ["sr-latn", "sr-cyrl", "en", "ru"] as const;
export type Locale = typeof locales[number];
export const defaultLocale: Locale = "sr-latn";
export const languageTags: Record<Locale, string> = { "sr-latn": "sr-Latn", "sr-cyrl": "sr-Cyrl", en: "en", ru: "ru" };
export const localeLabels: Record<Locale, string> = { "sr-latn": "Srpski · latinica", "sr-cyrl": "Српски · ћирилица", en: "English", ru: "Русский" };
export const intlLocales: Record<Locale, string> = { "sr-latn": "sr-Latn-RS", "sr-cyrl": "sr-Cyrl-RS", en: "en-GB", ru: "ru-RU" };
export function isLocale(value: string): value is Locale { return locales.includes(value as Locale); }
export function splitLocale(path: string): { locale: Locale; path: string; prefixed: boolean } {
  const match = path.match(/^\/(sr-latn|sr-cyrl|en|ru)(?=\/|[?#]|$)/);
  if (!match) return { locale: defaultLocale, path, prefixed: false };
  return { locale: match[1] as Locale, path: path.slice(match[0].length).replace(/^(?=[?#]|$)/, "/"), prefixed: true };
}
export function localizedPath(path: string, locale: Locale): string {
  if (!path.startsWith("/") || path.startsWith("//")) return path;
  const clean = splitLocale(path).path;
  // Never localize APIs, administration, assets or machine-readable resources.
  if (/^\/(?:admin|api|_next|images|media|fonts)(?:\/|$)|\.[a-z0-9]+(?:[?#]|$)/i.test(clean)) return clean;
  return locale === defaultLocale ? clean : `/${locale}${clean === "/" ? "" : clean}`;
}
