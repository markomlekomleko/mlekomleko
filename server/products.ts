import { DomainError, assertDomain, nonNegativeInt, optionalString, requiredString } from "./domain";
import { all, batch, first } from "./sql";
import { audit } from "./outbox";

export interface ProductRow extends Record<string, unknown> {
  id: string;
  slug: string;
  name: string;
  short_description: string;
  description: string;
  category: string;
  unit_label: string;
  price_minor: number;
  cost_minor: number;
  packaging_cost_minor: number;
  subscription_price_minor: number | null;
  compare_at_price_minor: number | null;
  currency: "RSD";
  image_url: string | null;
  image_alt: string;
  badge: string | null;
  origin: string;
  is_featured: number;
  allow_subscription: number;
  is_demo: number;
  sort_order: number;
  seo_title: string | null;
  seo_description: string | null;
  badi_sku: number | null;
  is_active: number;
  created_at: string;
  updated_at: string;
}

function optionalMoney(value: unknown, field: string): number | null {
  if (value === undefined || value === null || value === "") return null;
  return nonNegativeInt(value, field);
}

function optionalSku(value: unknown): number | null {
  if (value === undefined || value === null || value === "") return null;
  const sku = nonNegativeInt(value, "badiSku", 2_147_483_647);
  assertDomain(sku > 0, "VALIDATION_ERROR", "Badi SKU mora biti pozitivan ceo broj.", 422, { field: "badiSku" });
  return sku;
}

function booleanValue(value: unknown, fallback: boolean): number {
  if (value === undefined) return fallback ? 1 : 0;
  return value === true || value === 1 || value === "1" ? 1 : 0;
}

function assetUrl(value: unknown, field: string): string | null {
  const parsed = optionalString(value, field, 1_000);
  if (!parsed) return null;
  assertDomain(
    parsed.startsWith("/") || /^https:\/\//i.test(parsed),
    "VALIDATION_ERROR",
    `${field} mora biti lokalna putanja ili HTTPS adresa.`,
    422,
    { field },
  );
  return parsed;
}

export function publicProduct(row: ProductRow, includeCosts = false) {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    shortDescription: row.short_description ?? "",
    description: row.description ?? "",
    category: row.category ?? "Ostalo",
    unitLabel: row.unit_label,
    priceMinor: row.price_minor,
    ...(includeCosts ? { costMinor: row.cost_minor ?? 0, packagingCostMinor: row.packaging_cost_minor ?? 0, badiSku: row.badi_sku ?? null } : {}),
    subscriptionPriceMinor: row.subscription_price_minor ?? row.price_minor,
    compareAtPriceMinor: row.compare_at_price_minor ?? null,
    currency: row.currency,
    imageUrl: row.image_url,
    imageAlt: row.image_alt ?? "",
    badge: row.badge ?? null,
    origin: row.origin ?? "",
    isFeatured: Boolean(row.is_featured),
    allowSubscription: row.allow_subscription == null ? true : Boolean(row.allow_subscription),
    isDemo: Boolean(row.is_demo),
    sortOrder: row.sort_order ?? 0,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listProducts(includeInactive = false) {
  const rows = await all<ProductRow>(
    `SELECT * FROM products ${includeInactive ? "" : "WHERE is_active = 1"} ORDER BY sort_order ASC, name ASC`,
  );
  return rows.map((row) => publicProduct(row, includeInactive));
}

export async function getProduct(slug: string, includeInactive = false) {
  const row = await first<ProductRow>(
    `SELECT * FROM products WHERE slug = ? ${includeInactive ? "" : "AND is_active = 1"}`,
    slug,
  );
  if (!row) throw new DomainError("PRODUCT_NOT_FOUND", "Proizvod nije pronađen.", 404);
  return publicProduct(row, includeInactive);
}

function slugValue(value: unknown): string {
  const slug = requiredString(value, "slug", 120).toLowerCase();
  assertDomain(
    /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug),
    "VALIDATION_ERROR",
    "URL slug može da sadrži mala ASCII slova, brojeve i crtice.",
    422,
    { field: "slug" },
  );
  return slug;
}

async function assertProductSlug(slug: string, id = "") {
  const existing = await first<ProductRow>("SELECT id FROM products WHERE slug = ? AND id != ?", slug, id);
  assertDomain(!existing, "SLUG_ALREADY_EXISTS", "Proizvod sa ovim URL slugom već postoji. Unesite drugi slug.", 409, { field: "slug" });
}

export async function createProduct(input: Record<string, unknown>) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const priceMinor = nonNegativeInt(input.priceMinor, "priceMinor");
  const value = {
    id,
    slug: slugValue(input.slug),
    name: requiredString(input.name, "name", 120),
    shortDescription: optionalString(input.shortDescription, "shortDescription", 240) ?? "",
    description: optionalString(input.description, "description", 4_000) ?? "",
    category: optionalString(input.category, "category", 80) ?? "Ostalo",
    unitLabel: requiredString(input.unitLabel, "unitLabel", 40),
    priceMinor,
    costMinor: optionalMoney(input.costMinor, "costMinor") ?? 0,
    packagingCostMinor: optionalMoney(input.packagingCostMinor, "packagingCostMinor") ?? 0,
    subscriptionPriceMinor: optionalMoney(input.subscriptionPriceMinor, "subscriptionPriceMinor") ?? priceMinor,
    compareAtPriceMinor: optionalMoney(input.compareAtPriceMinor, "compareAtPriceMinor"),
    imageUrl: assetUrl(input.imageUrl, "imageUrl"),
    imageAlt: optionalString(input.imageAlt, "imageAlt", 180) ?? "",
    badge: optionalString(input.badge, "badge", 60),
    origin: optionalString(input.origin, "origin", 180) ?? "",
    isFeatured: booleanValue(input.isFeatured, false),
    allowSubscription: booleanValue(input.allowSubscription, true),
    isDemo: booleanValue(input.isDemo, false),
    sortOrder: input.sortOrder === undefined ? 0 : nonNegativeInt(input.sortOrder, "sortOrder", 10_000),
    seoTitle: optionalString(input.seoTitle, "seoTitle", 70),
    seoDescription: optionalString(input.seoDescription, "seoDescription", 170),
    badiSku: optionalSku(input.badiSku),
    isActive: booleanValue(input.isActive, true),
  };
  await assertProductSlug(value.slug);
  await batch([
    {
      sql: "INSERT INTO products (id, slug, name, short_description, description, category, unit_label, price_minor, cost_minor, packaging_cost_minor, subscription_price_minor, compare_at_price_minor, currency, image_url, image_alt, badge, origin, is_featured, allow_subscription, is_demo, sort_order, seo_title, seo_description, badi_sku, is_active, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'RSD', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      bindings: [
        id, value.slug, value.name, value.shortDescription, value.description, value.category,
        value.unitLabel, value.priceMinor, value.costMinor, value.packagingCostMinor, value.subscriptionPriceMinor, value.compareAtPriceMinor,
        value.imageUrl, value.imageAlt, value.badge, value.origin, value.isFeatured,
        value.allowSubscription, value.isDemo, value.sortOrder, value.seoTitle,
        value.seoDescription, value.badiSku, value.isActive, now, now,
      ],
    },
    audit("admin", "local-admin", "product.created", "product", id, null, value),
  ]);
  return getProduct(value.slug, true);
}

export async function updateProduct(id: string, input: Record<string, unknown>) {
  const before = await first<ProductRow>("SELECT * FROM products WHERE id = ?", id);
  if (!before) throw new DomainError("PRODUCT_NOT_FOUND", "Proizvod nije pronađen.", 404);
  const next = {
    slug: input.slug === undefined ? before.slug : slugValue(input.slug),
    name: input.name === undefined ? before.name : requiredString(input.name, "name", 120),
    shortDescription: input.shortDescription === undefined ? before.short_description : optionalString(input.shortDescription, "shortDescription", 240) ?? "",
    description: input.description === undefined ? before.description : optionalString(input.description, "description", 4_000) ?? "",
    category: input.category === undefined ? before.category : optionalString(input.category, "category", 80) ?? "Ostalo",
    unitLabel: input.unitLabel === undefined ? before.unit_label : requiredString(input.unitLabel, "unitLabel", 40),
    priceMinor: input.priceMinor === undefined ? before.price_minor : nonNegativeInt(input.priceMinor, "priceMinor"),
    costMinor: input.costMinor === undefined ? before.cost_minor : nonNegativeInt(input.costMinor, "costMinor"),
    packagingCostMinor: input.packagingCostMinor === undefined ? before.packaging_cost_minor : nonNegativeInt(input.packagingCostMinor, "packagingCostMinor"),
    subscriptionPriceMinor: input.subscriptionPriceMinor === undefined ? before.subscription_price_minor : optionalMoney(input.subscriptionPriceMinor, "subscriptionPriceMinor"),
    compareAtPriceMinor: input.compareAtPriceMinor === undefined ? before.compare_at_price_minor : optionalMoney(input.compareAtPriceMinor, "compareAtPriceMinor"),
    imageUrl: input.imageUrl === undefined ? before.image_url : assetUrl(input.imageUrl, "imageUrl"),
    imageAlt: input.imageAlt === undefined ? before.image_alt : optionalString(input.imageAlt, "imageAlt", 180) ?? "",
    badge: input.badge === undefined ? before.badge : optionalString(input.badge, "badge", 60),
    origin: input.origin === undefined ? before.origin : optionalString(input.origin, "origin", 180) ?? "",
    isFeatured: input.isFeatured === undefined ? before.is_featured : booleanValue(input.isFeatured, false),
    allowSubscription: input.allowSubscription === undefined ? before.allow_subscription : booleanValue(input.allowSubscription, true),
    isDemo: input.isDemo === undefined ? before.is_demo : booleanValue(input.isDemo, false),
    sortOrder: input.sortOrder === undefined ? before.sort_order : nonNegativeInt(input.sortOrder, "sortOrder", 10_000),
    seoTitle: input.seoTitle === undefined ? before.seo_title : optionalString(input.seoTitle, "seoTitle", 70),
    seoDescription: input.seoDescription === undefined ? before.seo_description : optionalString(input.seoDescription, "seoDescription", 170),
    badiSku: input.badiSku === undefined ? before.badi_sku : optionalSku(input.badiSku),
    isActive: input.isActive === undefined ? before.is_active : booleanValue(input.isActive, true),
  };
  await assertProductSlug(next.slug, id);
  await batch([
    {
      sql: "UPDATE products SET slug = ?, name = ?, short_description = ?, description = ?, category = ?, unit_label = ?, price_minor = ?, cost_minor = ?, packaging_cost_minor = ?, subscription_price_minor = ?, compare_at_price_minor = ?, image_url = ?, image_alt = ?, badge = ?, origin = ?, is_featured = ?, allow_subscription = ?, is_demo = ?, sort_order = ?, seo_title = ?, seo_description = ?, badi_sku = ?, is_active = ?, updated_at = ? WHERE id = ?",
      bindings: [
        next.slug, next.name, next.shortDescription, next.description, next.category,
        next.unitLabel, next.priceMinor, next.costMinor, next.packagingCostMinor, next.subscriptionPriceMinor, next.compareAtPriceMinor,
        next.imageUrl, next.imageAlt, next.badge, next.origin, next.isFeatured,
        next.allowSubscription, next.isDemo, next.sortOrder, next.seoTitle,
        next.seoDescription, next.badiSku, next.isActive, new Date().toISOString(), id,
      ],
    },
    audit("admin", "local-admin", "product.updated", "product", id, publicProduct(before), next),
  ]);
  return getProduct(next.slug, true);
}

export async function removeProduct(id: string) {
  const before = await first<ProductRow>("SELECT * FROM products WHERE id = ?", id);
  if (!before) throw new DomainError("PRODUCT_NOT_FOUND", "Proizvod nije pronađen.", 404);
  const references = await first<{ count: number } & Record<string, unknown>>(
    "SELECT (SELECT COUNT(*) FROM order_items WHERE product_id = ?) + (SELECT COUNT(*) FROM subscription_items WHERE product_id = ?) + (SELECT COUNT(*) FROM next_delivery_addons WHERE product_id = ?) + (SELECT COUNT(*) FROM delivery_items WHERE product_id = ?) + (SELECT COUNT(*) FROM bundle_items WHERE product_id = ?) AS count",
    id, id, id, id, id,
  );
  const referenced = Number(references?.count ?? 0) > 0;
  await batch([
    referenced
      ? { sql: "UPDATE products SET is_active = 0, updated_at = ? WHERE id = ?", bindings: [new Date().toISOString(), id] }
      : { sql: "DELETE FROM products WHERE id = ?", bindings: [id] },
    audit(
      "admin",
      "local-admin",
      referenced ? "product.archived" : "product.deleted",
      "product",
      id,
      publicProduct(before),
      referenced ? { isActive: false } : null,
    ),
  ]);
  return { deleted: !referenced, archived: referenced };
}
