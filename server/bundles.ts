import { DomainError, assertDomain, enumValue, nonNegativeInt, optionalString, positiveInt, requiredString } from "./domain";
import { audit } from "./outbox";
import { all, batch, first, sqlPlaceholders, type SqlValue } from "./sql";

export interface BundleRow extends Record<string, unknown> {
  id: string;
  slug: string;
  eyebrow: string;
  name: string;
  description: string;
  is_featured: number;
  is_active: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface BundleItemRow extends Record<string, unknown> {
  id: string;
  bundle_id: string;
  product_id: string;
  quantity: number;
  purchase_type: "one_time" | "subscription";
  cadence: "weekly" | "biweekly" | null;
  sort_order: number;
  product_name: string;
  product_slug: string;
  unit_label: string;
  price_minor: number;
  subscription_price_minor: number | null;
  product_active: number;
  allow_subscription: number;
}

type BundleItemInput = {
  productId: string;
  quantity: number;
  purchaseType: "one_time" | "subscription";
  cadence: "weekly" | "biweekly" | null;
  sortOrder: number;
};

function bool(value: unknown, fallback: boolean) {
  if (value === undefined) return fallback ? 1 : 0;
  return value === true || value === 1 || value === "1" ? 1 : 0;
}

function slugValue(value: unknown) {
  const slug = requiredString(value, "slug", 120).toLowerCase();
  assertDomain(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug), "VALIDATION_ERROR", "Slug paketa može sadržati mala slova, brojeve i crtice.", 422);
  return slug;
}

function parseItems(value: unknown): BundleItemInput[] {
  assertDomain(Array.isArray(value) && value.length > 0 && value.length <= 20, "VALIDATION_ERROR", "Paket mora imati 1–20 stavki.", 422);
  return value.map((raw, index) => {
    assertDomain(raw && typeof raw === "object" && !Array.isArray(raw), "VALIDATION_ERROR", `Stavka ${index + 1} nije ispravna.`, 422);
    const item = raw as Record<string, unknown>;
    const purchaseType = enumValue(item.purchaseType, `items[${index}].purchaseType`, ["one_time", "subscription"] as const);
    return {
      productId: requiredString(item.productId, `items[${index}].productId`, 100),
      quantity: positiveInt(item.quantity, `items[${index}].quantity`, 100),
      purchaseType,
      cadence: purchaseType === "subscription" ? enumValue(item.cadence ?? "weekly", `items[${index}].cadence`, ["weekly", "biweekly"] as const) : null,
      sortOrder: index,
    };
  });
}

function bundleValue(input: Record<string, unknown>, before?: BundleRow) {
  return {
    slug: input.slug === undefined && before ? before.slug : slugValue(input.slug),
    eyebrow: input.eyebrow === undefined && before ? before.eyebrow : optionalString(input.eyebrow, "eyebrow", 100) ?? "Pametan paket",
    name: input.name === undefined && before ? before.name : requiredString(input.name, "name", 140),
    description: input.description === undefined && before ? before.description : optionalString(input.description, "description", 500) ?? "",
    isFeatured: input.isFeatured === undefined && before ? before.is_featured : bool(input.isFeatured, false),
    isActive: input.isActive === undefined && before ? before.is_active : bool(input.isActive, true),
    sortOrder: input.sortOrder === undefined && before ? before.sort_order : nonNegativeInt(input.sortOrder ?? 0, "sortOrder", 10_000),
  };
}

export async function listBundles(includeInactive = false) {
  const rows = await all<BundleRow>(`SELECT * FROM bundles ${includeInactive ? "" : "WHERE is_active = 1"} ORDER BY sort_order, created_at`);
  if (!rows.length) return [];
  const items = await all<BundleItemRow>(
    `SELECT bi.*, p.name AS product_name, p.slug AS product_slug, p.unit_label, p.price_minor, p.subscription_price_minor, p.is_active AS product_active, p.allow_subscription
     FROM bundle_items bi JOIN products p ON p.id = bi.product_id
     WHERE bi.bundle_id IN (${sqlPlaceholders(rows.length)}) ORDER BY bi.bundle_id, bi.sort_order`,
    ...rows.map((row) => row.id),
  );
  return rows.filter((bundle) => {
    if (includeInactive) return true;
    const contents = items.filter((item) => item.bundle_id === bundle.id);
    return contents.length > 0 && contents.every((item) => item.product_active && (item.purchase_type !== "subscription" || item.allow_subscription));
  }).map((bundle) => {
    const lines = items.filter((item) => item.bundle_id === bundle.id && (includeInactive || item.product_active)).map((item) => {
      const unitPriceMinor = item.purchase_type === "subscription" ? item.subscription_price_minor ?? item.price_minor : item.price_minor;
      return {
        id: item.id,
        productId: item.product_id,
        slug: item.product_slug,
        productName: item.product_name,
        unitLabel: item.unit_label,
        quantity: item.quantity,
        purchaseType: item.purchase_type,
        cadence: item.cadence,
        unitPriceMinor,
        sortOrder: item.sort_order,
      };
    });
    const perDeliveryMinor = lines.reduce((sum, item) => sum + item.unitPriceMinor * item.quantity, 0);
    const regularPerDeliveryMinor = lines.reduce((sum, item) => {
      const source = items.find((candidate) => candidate.id === item.id);
      return sum + Number(source?.price_minor ?? item.unitPriceMinor) * item.quantity;
    }, 0);
    return {
      id: bundle.id,
      slug: bundle.slug,
      eyebrow: bundle.eyebrow,
      name: bundle.name,
      description: bundle.description,
      isFeatured: Boolean(bundle.is_featured),
      isActive: Boolean(bundle.is_active),
      sortOrder: bundle.sort_order,
      perDeliveryMinor,
      regularPerDeliveryMinor,
      savingPerDeliveryMinor: Math.max(0, regularPerDeliveryMinor - perDeliveryMinor),
      lines,
    };
  });
}

async function assertBundleSlug(slug: string, id = "") {
  const existing = await first<BundleRow>("SELECT id FROM bundles WHERE slug = ? AND id != ?", slug, id);
  assertDomain(!existing, "SLUG_ALREADY_EXISTS", "Paket sa ovim slugom već postoji. Unesite drugi slug.", 409, { field: "slug" });
}

async function validateBundleItems(items: BundleItemInput[]) {
  const products = await all<Record<string, unknown>>(`SELECT id, allow_subscription FROM products WHERE id IN (${sqlPlaceholders(items.length)})`, ...items.map(item => item.productId));
  for (const item of items) {
    const product = products.find(product => product.id === item.productId);
    assertDomain(product, "PRODUCT_UNAVAILABLE", "Jedan od proizvoda paketa ne postoji. Izaberite drugi proizvod.", 409);
    assertDomain(item.purchaseType !== "subscription" || product.allow_subscription, "SUBSCRIPTION_NOT_ALLOWED", "Proizvod ne podržava redovnu dostavu. Izaberite jednokratnu kupovinu.", 422);
  }
}

export async function createBundle(input: Record<string, unknown>) {
  const id = crypto.randomUUID();
  const value = bundleValue(input);
  const items = parseItems(input.items);
  await validateBundleItems(items);
  await assertBundleSlug(value.slug);
  const now = new Date().toISOString();
  const statements: Array<{ sql: string; bindings?: SqlValue[] }> = [{
    sql: "INSERT INTO bundles (id, slug, eyebrow, name, description, is_featured, is_active, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    bindings: [id, value.slug, value.eyebrow, value.name, value.description, value.isFeatured, value.isActive, value.sortOrder, now, now],
  }];
  items.forEach((item) => statements.push({
    sql: "INSERT INTO bundle_items (id, bundle_id, product_id, quantity, purchase_type, cadence, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)",
    bindings: [crypto.randomUUID(), id, item.productId, item.quantity, item.purchaseType, item.cadence, item.sortOrder],
  }));
  statements.push(audit("admin", "local-admin", "bundle.created", "bundle", id, null, { ...value, items }));
  await batch(statements);
  return (await listBundles(true)).find((bundle) => bundle.id === id);
}

export async function updateBundle(id: string, input: Record<string, unknown>) {
  const before = await first<BundleRow>("SELECT * FROM bundles WHERE id = ?", id);
  if (!before) throw new DomainError("BUNDLE_NOT_FOUND", "Paket nije pronađen.", 404);
  const value = bundleValue(input, before);
  const items = input.items === undefined ? null : parseItems(input.items);
  if (items) await validateBundleItems(items);
  await assertBundleSlug(value.slug, id);
  const now = new Date().toISOString();
  const statements: Array<{ sql: string; bindings?: SqlValue[] }> = [{
    sql: "UPDATE bundles SET slug = ?, eyebrow = ?, name = ?, description = ?, is_featured = ?, is_active = ?, sort_order = ?, updated_at = ? WHERE id = ?",
    bindings: [value.slug, value.eyebrow, value.name, value.description, value.isFeatured, value.isActive, value.sortOrder, now, id],
  }];
  if (items) {
    statements.push({ sql: "DELETE FROM bundle_items WHERE bundle_id = ?", bindings: [id] });
    items.forEach((item) => statements.push({ sql: "INSERT INTO bundle_items (id, bundle_id, product_id, quantity, purchase_type, cadence, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)", bindings: [crypto.randomUUID(), id, item.productId, item.quantity, item.purchaseType, item.cadence, item.sortOrder] }));
  }
  statements.push(audit("admin", "local-admin", "bundle.updated", "bundle", id, before, { ...value, items }));
  await batch(statements);
  return (await listBundles(true)).find((bundle) => bundle.id === id);
}

export async function removeBundle(id: string) {
  const before = await first<BundleRow>("SELECT * FROM bundles WHERE id = ?", id);
  if (!before) throw new DomainError("BUNDLE_NOT_FOUND", "Paket nije pronađen.", 404);
  await batch([
    { sql: "DELETE FROM bundle_items WHERE bundle_id = ?", bindings: [id] },
    { sql: "DELETE FROM bundles WHERE id = ?", bindings: [id] },
    audit("admin", "local-admin", "bundle.deleted", "bundle", id, before, null),
  ]);
  return { deleted: true };
}
