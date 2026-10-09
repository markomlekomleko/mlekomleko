import { catalog } from "./catalog";
import { defaultLocale, type Locale } from "./routing";
const latin = "abvgdđežzijk lmnoprstćufhcčš".replaceAll(" ", "");
const cyrillic = "абвгдђежзијклмнопрстћуфхцчш";
const letters = Object.fromEntries([...latin].map((letter, i) => [letter, cyrillic[i]]));
export function toCyrillic(text: string): string {
  return text.replace(/https?:\/\/\S+|[\w.+-]+@[\w.-]+\.[a-z]+|Mleko i Mleko|Instagram|TikTok|WhatsApp|Google|RSD|EUR|IBAN|PIB|SKU|SMS|Email|email|DŽ|Dž|dž|LJ|Lj|lj|NJ|Nj|nj|[a-zčćšđž]/gi, part => {
    if (part === "Email") return "Имејл";
    if (part === "email") return "имејл";
    const digraphs: Record<string, string> = { dž: "џ", lj: "љ", nj: "њ" };
    const letter = digraphs[part.toLowerCase()] ?? letters[part.toLowerCase()];
    return letter ? (part[0] === part[0].toUpperCase() ? letter.toUpperCase() : letter) : part;
  });
}
const normalize = (text: string) => text.replace(/\s+/g, " ").trim();
const escape = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const patterns = Object.keys(catalog).filter(key => /\{\d+\}/.test(key)).map(key => ({ key, regex: new RegExp(`^${key.split(/\{\d+\}/).map(escape).join("([\\s\\S]*?)")}$`) }));
export function translate(text: string, locale: Locale, depth = 0): string {
  if (locale === defaultLocale || !text.trim()) return text;
  const key = normalize(text);
  const entry = catalog[key];
  let translated: string | undefined;
  if (entry) translated = locale === "sr-cyrl" ? toCyrillic(key) : entry[locale === "en" ? 0 : 1];
  else if (depth < 3) for (const pattern of patterns) {
    const match = key.match(pattern.regex);
    if (match) {
      const template = locale === "sr-cyrl" ? toCyrillic(pattern.key) : catalog[pattern.key][locale === "en" ? 0 : 1];
      translated = template.replace(/\{(\d+)\}/g, (_, index) => translate(match[Number(index) + 1] ?? "", locale, depth + 1));
      break;
    }
  }
  // Unknown names, addresses, IDs and customer-entered text remain verbatim.
  return translated === undefined ? text : `${text.match(/^\s*/)?.[0] ?? ""}${translated}${text.match(/\s*$/)?.[0] ?? ""}`;
}
