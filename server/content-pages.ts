import { mutationGuard } from "./mutation-guard";
import { all, first, batch } from "./sql";
import { assertDomain, requiredString, DomainError } from "./domain";
import { audit } from "./outbox";

export interface ContentPage {
  slug: string; title: string; description: string; intro: string;
  sections: { heading: string; text: string }[];
  status: "draft" | "published"; version: string; updatedAt: string;
}
const prefix = "content-page:";
function decode(value: string): ContentPage { return JSON.parse(value) as ContentPage; }

export async function listContentPages(publishedOnly = false): Promise<ContentPage[]> {
  const values = await all<{ value_json: string }>("SELECT value_json FROM settings WHERE key LIKE 'content-page:%' ORDER BY key");
  return values.map(row => decode(row.value_json)).filter(page => !publishedOnly || page.status === "published");
}
export async function getContentPage(slug: string, publishedOnly = true) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return null;
  const row = await first<{ value_json: string }>("SELECT value_json FROM settings WHERE key = ?", prefix + slug);
  if (!row) return null;
  const page = decode(row.value_json);
  return publishedOnly && page.status !== "published" ? null : page;
}
export async function saveContentPage(input: Record<string, unknown>) {
  const slug = requiredString(input.slug, "slug", 90);
  assertDomain(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug), "VALIDATION_ERROR", "URL koristi mala slova, brojeve i crtice.", 422);
  assertDomain(input.status === "draft" || input.status === "published", "VALIDATION_ERROR", "Izaberite nacrt ili objavljenu stranicu.", 422);
  assertDomain(Array.isArray(input.sections) && input.sections.length <= 20, "VALIDATION_ERROR", "Stranica može imati do 20 odeljaka.", 422);
  const sections = input.sections.map((raw) => {
    assertDomain(raw && typeof raw === "object" && !Array.isArray(raw), "VALIDATION_ERROR", "Odeljak nije ispravan.", 422);
    const section = raw as Record<string, unknown>;
    return { heading: requiredString(section.heading, "Naslov odeljka", 180), text: requiredString(section.text, "Tekst odeljka", 6000) };
  });
  const page: ContentPage = {
    slug, title: requiredString(input.title, "Naslov", 70), description: requiredString(input.description, "SEO opis", 170),
    intro: requiredString(input.intro, "Uvod", 2000), sections, status: input.status,
    version: crypto.randomUUID(), updatedAt: new Date().toISOString(),
  };
  const key = prefix + slug;
  const saved = await first<{ value_json: string }>("SELECT value_json FROM settings WHERE key = ?", key);
  const before = saved ? decode(saved.value_json) : null;
  assertDomain(before ? input.expectedVersion === before.version : !input.expectedVersion, "CONTENT_PAGE_CONFLICT", "Stranica je promenjena u drugom prozoru. Osvežite prikaz.", 409);
  const guard = saved
    ? mutationGuard("EXISTS (SELECT 1 FROM settings WHERE key = ? AND value_json = ?)", [key, saved.value_json])
    : mutationGuard("NOT EXISTS (SELECT 1 FROM settings WHERE key = ?)", [key]);
  try {
    await batch([
      guard.check,
      { sql: "INSERT INTO settings (key, value_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at", bindings: [key, JSON.stringify(page), page.updatedAt] },
      audit("admin", "admin-session", "content_page.saved", "content_page", slug, before, page),
      guard.cleanup,
    ]);
  } catch (error) {
    const current = await first<{ value_json: string }>("SELECT value_json FROM settings WHERE key = ?", key);
    if (current?.value_json !== saved?.value_json) throw new DomainError("CONTENT_PAGE_CONFLICT", "Stranica je izmenjena u drugom prozoru. Osvežite prikaz.", 409);
    throw error;
  }
  return page;
}
