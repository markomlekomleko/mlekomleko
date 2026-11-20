import { DomainError, assertDomain, enumValue, nonNegativeInt, optionalString, positiveInt, requiredString } from "./domain";
import { assertMinimumLitres, weeklyCadence } from "./commerce";
import { audit } from "./outbox";
import { packageOccurrences } from "./packages";
import { effectivePrice } from "./product-details";
import { getBusinessSettings } from "./settings";
import { all, batch, first, sqlPlaceholders, type SqlValue } from "./sql";

/**
 * A package ("paket") is a saved set of real cart lines: product, litres per delivery and
 * the way it is bought. It has no price of its own — every figure is derived from the
 * products' current (sale-aware) prices, exactly as the cart and checkout will charge them.
 *
 * A line bought as a subscription is always weekly: with the line's other subscription
 * lines it becomes the prepaid package of four weekly deliveries at checkout. A package
 * with at least one subscription line can also be bought once (every line one-time); a
 * package without one is sold only once.
 */
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
  sale_price_minor: number | null;
  sale_subscription_price_minor: number | null;
  sale_starts_at: string | null;
  sale_ends_at: string | null;
  product_active: number;
  allow_subscription: number;
}

type BundleItemInput = {
  productId: string;
  quantity: number;
  purchaseType: "one_time" | "subscription";
  cadence: "weekly" | null;
  sortOrder: number;
};

/** Deliveries in one prepaid subscription package. */
export const PACKAGE_DELIVERIES = packageOccurrences("weekly");

function bool(value: unknown, fallback: boolean) {
  if (value === undefined) return fallback ? 1 : 0;
  return value === true || value === 1 || value === "1" ? 1 : 0;
}

function slugValue(value: unknown) {
  const slug = requiredString(value, "slug", 120).toLowerCase();
  assertDomain(/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug), "VALIDATION_ERROR", "Slug paketa može sadržati mala slova, brojeve i crtice.", 422, { field: "slug" });
  return slug;
}

function parseItems(value: unknown): BundleItemInput[] {
  assertDomain(Array.isArray(value) && value.length > 0 && value.length <= 20, "VALIDATION_ERROR", "Paket mora imati 1–20 stavki.", 422, { field: "items" });
  const items = value.map((raw, index) => {
    assertDomain(raw && typeof raw === "object" && !Array.isArray(raw), "VALIDATION_ERROR", `Stavka ${index + 1} nije ispravna.`, 422);
    const item = raw as Record<string, unknown>;
    const purchaseType = enumValue(item.purchaseType, `items[${index}].purchaseType`, ["one_time", "subscription"] as const);
    return {
      productId: requiredString(item.productId, `items[${index}].productId`, 100),
      quantity: positiveInt(item.quantity, `items[${index}].quantity`, 100),
      purchaseType,
      // Weekly is the only rhythm sold; "biweekly" is refused with the shop's own message.
      cadence: purchaseType === "subscription" ? weeklyCadence(item.cadence ?? "weekly", `items[${index}].cadence`) : null,
      sortOrder: index,
    };
  });
  const keys = new Set<string>();
  for (const item of items) {
    const key = `${item.productId}:${item.purchaseType}`;
    assertDomain(!keys.has(key), "DUPLICATE_BUNDLE_ITEM", "Isti proizvod sa istim načinom kupovine je već u paketu. Povećaj količinu te stavke.", 422, { field: "items", productId: item.productId });
    keys.add(key);
  }
  return items;
}

function bundleValue(input: Record<string, unknown>, before?: BundleRow) {
  return {
    slug: input.slug === undefined && before ? before.slug : slugValue(input.slug),
    eyebrow: input.eyebrow === undefined && before ? before.eyebrow : optionalString(input.eyebrow, "eyebrow", 100) ?? "Paket",
    name: input.name === undefined && before ? before.name : requiredString(input.name, "name", 140),
    description: input.description === undefined && before ? before.description : optionalString(input.description, "description", 500) ?? "",
    isFeatured: input.isFeatured === undefined && before ? before.is_featured : bool(input.isFeatured, false),
    isActive: input.isActive === undefined && before ? before.is_active : bool(input.isActive, true),
    sortOrder: input.sortOrder === undefined && before ? before.sort_order : nonNegativeInt(input.sortOrder ?? 0, "sortOrder", 10_000),
  };
}

function lineSellable(item: Pick<BundleItemRow, "product_active" | "purchase_type" | "allow_subscription" | "cadence">) {
  return Boolean(item.product_active) && (item.purchase_type !== "subscription" || (Boolean(item.allow_subscription) && item.cadence === "weekly"));
}

export async function listBundles(includeInactive = false) {
  const rows = await all<BundleRow>(`SELECT * FROM bundles ${includeInactive ? "" : "WHERE is_active = 1"} ORDER BY sort_order, created_at`);
  if (!rows.length) return [];
  const items = await all<BundleItemRow>(
    `SELECT bi.*, p.name AS product_name, p.slug AS product_slug, p.unit_label, p.price_minor, p.subscription_price_minor,
       p.sale_price_minor, p.sale_subscription_price_minor, p.sale_starts_at, p.sale_ends_at, p.is_active AS product_active, p.allow_subscription
     FROM bundle_items bi JOIN products p ON p.id = bi.product_id
     WHERE bi.bundle_id IN (${sqlPlaceholders(rows.length)}) ORDER BY bi.bundle_id, bi.sort_order`,
    ...rows.map((row) => row.id),
  );
  // The shop never shows a package that has lost a product or still carries a rhythm
  // that is no longer sold: it would be offered under a name its contents do not match.
  return rows.filter((bundle) => {
    if (includeInactive) return true;
    const contents = items.filter((item) => item.bundle_id === bundle.id);
    return contents.length > 0 && contents.every(lineSellable);
  }).map((bundle) => {
    const lines = items.filter((item) => item.bundle_id === bundle.id).map((item) => {
      const oneTimeUnitPriceMinor = effectivePrice(item, false);
      const subscriptionUnitPriceMinor = item.allow_subscription ? effectivePrice(item, true) : null;
      return {
        id: item.id,
        productId: item.product_id,
        slug: item.product_slug,
        productName: item.product_name,
        unitLabel: item.unit_label,
        quantity: item.quantity,
        purchaseType: item.purchase_type,
        cadence: item.cadence,
        unitPriceMinor: item.purchase_type === "subscription" ? subscriptionUnitPriceMinor ?? oneTimeUnitPriceMinor : oneTimeUnitPriceMinor,
        oneTimeUnitPriceMinor,
        subscriptionUnitPriceMinor,
        available: lineSellable(item),
        sortOrder: item.sort_order,
      };
    });
    const offersSubscription = lines.some((line) => line.purchaseType === "subscription");
    // Products only; delivery is charged per delivery on top, exactly as in the cart.
    const perDeliveryMinor = lines.reduce((sum, line) => sum + line.unitPriceMinor * line.quantity, 0);
    const oneTimeMinor = lines.reduce((sum, line) => sum + line.oneTimeUnitPriceMinor * line.quantity, 0);
    const subscriptionPackageMinor = offersSubscription
      ? lines.reduce((sum, line) => sum + line.unitPriceMinor * line.quantity * (line.purchaseType === "subscription" ? PACKAGE_DELIVERIES : 1), 0)
      : null;
    return {
      id: bundle.id,
      slug: bundle.slug,
      eyebrow: bundle.eyebrow,
      name: bundle.name,
      description: bundle.description,
      isFeatured: Boolean(bundle.is_featured),
      isActive: Boolean(bundle.is_active),
      available: lines.length > 0 && lines.every((line) => line.available),
      sortOrder: bundle.sort_order,
      offersSubscription,
      packageDeliveries: PACKAGE_DELIVERIES,
      perDeliveryMinor,
      oneTimeMinor,
      subscriptionPackageMinor,
      lines,
    };
  });
}

async function assertBundleSlug(slug: string, id = "") {
  const existing = await first<BundleRow>("SELECT id FROM bundles WHERE slug = ? AND id != ?", slug, id);
  assertDomain(!existing, "SLUG_ALREADY_EXISTS", "Paket sa ovim slugom već postoji. Unesi drugi slug.", 409, { field: "slug" });
}

/**
 * Every line must be something the shop can sell exactly as written: an existing product,
 * a weekly rhythm where it is a subscription, a product that allows one, and at least the
 * shop's minimum litres per delivery. A published package must also use only products on sale.
 */
async function validateBundleItems(items: BundleItemInput[], published: boolean) {
  const products = await all<Record<string, unknown>>(`SELECT id, name, unit_label, is_active, allow_subscription FROM products WHERE id IN (${sqlPlaceholders(items.length)})`, ...items.map(item => item.productId));
  const minimumLitres = Number((await getBusinessSettings()).minimumLitres) || 0;
  for (const [index, item] of items.entries()) {
    const product = products.find(product => product.id === item.productId);
    assertDomain(product, "PRODUCT_UNAVAILABLE", "Jedan od proizvoda paketa ne postoji. Izaberi drugi proizvod.", 409, { field: `items[${index}].productId` });
    assertDomain(!published || product.is_active, "PRODUCT_INACTIVE", `„${String(product.name)}“ trenutno nije u prodaji, pa paket sa njim ne može da bude objavljen. Izaberi drugi proizvod ili sačuvaj paket kao sakriven.`, 422, { field: `items[${index}].productId`, productId: item.productId });
    assertDomain(item.purchaseType !== "subscription" || product.allow_subscription, "SUBSCRIPTION_NOT_ALLOWED", `„${String(product.name)}“ se ne prodaje kao pretplata. Izaberi jednokratnu kupovinu.`, 422, { field: `items[${index}].purchaseType` });
    try {
      assertMinimumLitres(String(product.unit_label), item.quantity, minimumLitres);
    } catch (error) {
      if (!(error instanceof DomainError)) throw error;
      throw new DomainError("MINIMUM_QUANTITY", `„${String(product.name)}“: najmanja količina je ${minimumLitres} l po dostavi.`, 422, { field: `items[${index}].quantity`, minimumLitres });
    }
  }
}

function itemStatements(id: string, items: BundleItemInput[]) {
  return items.map((item) => ({
    sql: "INSERT INTO bundle_items (id, bundle_id, product_id, quantity, purchase_type, cadence, sort_order) VALUES (?, ?, ?, ?, ?, ?, ?)",
    bindings: [crypto.randomUUID(), id, item.productId, item.quantity, item.purchaseType, item.cadence, item.sortOrder] as SqlValue[],
  }));
}

export async function createBundle(input: Record<string, unknown>) {
  const id = crypto.randomUUID();
  const value = bundleValue(input);
  const items = parseItems(input.items);
  await validateBundleItems(items, Boolean(value.isActive));
  await assertBundleSlug(value.slug);
  const now = new Date().toISOString();
  const statements: Array<{ sql: string; bindings?: SqlValue[] }> = [{
    sql: "INSERT INTO bundles (id, slug, eyebrow, name, description, is_featured, is_active, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    bindings: [id, value.slug, value.eyebrow, value.name, value.description, value.isFeatured, value.isActive, value.sortOrder, now, now],
  }, ...itemStatements(id, items)];
  statements.push(audit("admin", "local-admin", "bundle.created", "bundle", id, null, { ...value, items }));
  await batch(statements);
  return (await listBundles(true)).find((bundle) => bundle.id === id);
}

export async function updateBundle(id: string, input: Record<string, unknown>) {
  const before = await first<BundleRow>("SELECT * FROM bundles WHERE id = ?", id);
  if (!before) throw new DomainError("BUNDLE_NOT_FOUND", "Paket nije pronađen.", 404);
  const value = bundleValue(input, before);
  const items = input.items === undefined ? null : parseItems(input.items);
  if (items) await validateBundleItems(items, Boolean(value.isActive));
  else if (value.isActive) {
    // Publishing without new lines re-checks the stored ones against today's rules.
    const stored = await all<BundleItemRow>("SELECT * FROM bundle_items WHERE bundle_id = ? ORDER BY sort_order", id);
    await validateBundleItems(parseItems(stored.map((item) => ({ productId: item.product_id, quantity: item.quantity, purchaseType: item.purchase_type, cadence: item.cadence }))), true);
  }
  await assertBundleSlug(value.slug, id);
  const now = new Date().toISOString();
  const statements: Array<{ sql: string; bindings?: SqlValue[] }> = [{
    sql: "UPDATE bundles SET slug = ?, eyebrow = ?, name = ?, description = ?, is_featured = ?, is_active = ?, sort_order = ?, updated_at = ? WHERE id = ?",
    bindings: [value.slug, value.eyebrow, value.name, value.description, value.isFeatured, value.isActive, value.sortOrder, now, id],
  }];
  if (items) statements.push({ sql: "DELETE FROM bundle_items WHERE bundle_id = ?", bindings: [id] }, ...itemStatements(id, items));
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
