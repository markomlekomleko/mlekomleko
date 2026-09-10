export type PurchaseType = "one_time" | "subscription";
export type DeliveryCadence = "weekly" | "biweekly";

export type Product = {
  id: string;
  slug: string;
  name: string;
  description: string;
  shortDescription: string;
  category: string;
  unit: string;
  priceRsd: number;
  costRsd?: number;
  packagingCostRsd?: number;
  badiSku?: number | null;
  subscriptionPriceRsd: number;
  compareAtPriceRsd: number | null;
  imageUrl: string;
  imageAlt: string;
  badge: string;
  origin: string;
  isFeatured: boolean;
  allowSubscription: boolean;
  isDemo: boolean;
  sortOrder: number;
  seoTitle: string;
  seoDescription: string;
  available: boolean;
};

export type BundleOffer = {
  id: string;
  slug: string;
  eyebrow: string;
  name: string;
  description: string;
  isFeatured: boolean;
  isActive: boolean;
  sortOrder: number;
  perDeliveryMinor: number;
  regularPerDeliveryMinor: number;
  savingPerDeliveryMinor: number;
  lines: Array<{
    id: string;
    productId: string;
    slug: string;
    productName: string;
    unitLabel: string;
    quantity: number;
    purchaseType: PurchaseType;
    cadence: DeliveryCadence | null;
    unitPriceMinor: number;
  }>;
};

export type StorefrontSettings = {
  storeName: string;
  announcementEnabled: boolean;
  announcementText: string;
  announcementLinkLabel: string;
  announcementUrl: string;
  heroEyebrow: string;
  heroTitle: string;
  heroSubtitle: string;
  heroPrimaryLabel: string;
  heroPrimaryUrl: string;
  heroSecondaryLabel: string;
  heroSecondaryUrl: string;
  serviceAreaTitle: string;
  serviceAreaNote: string;
  deliveryFeeMinor: number;
  freeDeliveryThresholdMinor: number;
  routeCapacity: number;
  guaranteeTitle: string;
  guaranteeText: string;
  trustItems: string[];
  storeDemoMode: boolean;
};

export type DeliveryWindow = {
  deliveryDate: string;
  billingMonth: string;
  deliveryLocalTime: string;
  cutoffAt: string;
  cutoffHours: number;
  remainingOccurrences: {
    weekly: number;
    biweekly: number;
  };
};

export type CartQuote = {
  lines: Array<{
    productId: string;
    productName: string;
    unitLabel: string;
    unitPriceMinor: number;
    quantity: number;
    purchaseType: PurchaseType;
    cadence: DeliveryCadence | null;
    occurrences: number;
    deliveryDates: string[];
    lineTotalMinor: number;
  }>;
  subtotalMinor: number;
  discountMinor: number;
  deliveryFeeMinor: number;
  deliveryFeePerOccurrenceMinor?: number;
  deliveryOccurrences?: number;
  totalMinor: number;
  promoCode: string | null;
  currency: "RSD";
  deliveryDate: string;
  cutoffAt: string;
  serviceable?: boolean;
  freeDeliveryThresholdMinor: number;
  freeDeliveryRemainingMinor: number;
  recommendedAddons: Product[];
};

export type CartItem = {
  key: string;
  productId: string;
  slug: string;
  name: string;
  unit: string;
  unitPriceRsd: number;
  purchaseType: PurchaseType;
  cadence?: DeliveryCadence;
  quantity: number;
};

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" ? (value as UnknownRecord) : {};
}

function textValue(...values: unknown[]) {
  const value = values.find((item) => typeof item === "string" && item.trim());
  return typeof value === "string" ? value : "";
}

function numberValue(...values: unknown[]) {
  const value = values.find(
    (item) => typeof item === "number" || (typeof item === "string" && item.trim()),
  );
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export function normalizeProduct(value: unknown): Product {
  const item = record(value);
  const name = textValue(item.name, item.title, "Proizvod");
  const id = textValue(item.id, item.productId, item.product_id, item.slug, name);
  const slug = textValue(
    item.slug,
    id,
    name
      .toLocaleLowerCase("sr-Latn")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, ""),
  );
  const directPrice = numberValue(
    item.priceRsd,
    item.price_rsd,
    item.price,
    item.priceInRsd,
  );
  const minorPrice = numberValue(item.priceMinor, item.price_minor);
  const costMinor = numberValue(item.costMinor, item.cost_minor);
  const packagingCostMinor = numberValue(item.packagingCostMinor, item.packaging_cost_minor);
  const priceRsd = directPrice || minorPrice / 100;
  const directSubscriptionPrice = numberValue(
    item.subscriptionPriceRsd,
    item.subscription_price_rsd,
    item.subscriptionPrice,
  );
  const minorSubscriptionPrice = numberValue(
    item.subscriptionPriceMinor,
    item.subscription_price_minor,
  );
  const compareAtMinor = numberValue(item.compareAtPriceMinor, item.compare_at_price_minor);

  return {
    id,
    slug,
    name,
    description: textValue(item.description, item.longDescription, item.long_description),
    shortDescription: textValue(
      item.shortDescription,
      item.short_description,
      item.description,
      "Domaći proizvod iz naše ponude.",
    ),
    category: textValue(item.category, item.categoryName, item.category_name, "Ostalo"),
    unit: textValue(
      item.unit,
      item.unitLabel,
      item.unit_label,
      item.packageSize,
      item.package_size,
      "kom",
    ),
    priceRsd,
    costRsd: costMinor / 100,
    packagingCostRsd: packagingCostMinor / 100,
    badiSku: numberValue(item.badiSku, item.badi_sku) || null,
    subscriptionPriceRsd:
      directSubscriptionPrice || minorSubscriptionPrice / 100 || priceRsd,
    compareAtPriceRsd: compareAtMinor > 0 ? compareAtMinor / 100 : null,
    imageUrl: textValue(item.imageUrl, item.image_url),
    imageAlt: textValue(item.imageAlt, item.image_alt, `Fotografija proizvoda ${name}`),
    badge: textValue(item.badge),
    origin: textValue(item.origin),
    isFeatured: item.isFeatured === true || item.is_featured === 1,
    allowSubscription: item.allowSubscription !== false && item.allow_subscription !== 0,
    isDemo: item.isDemo === true || item.is_demo === 1,
    sortOrder: numberValue(item.sortOrder, item.sort_order),
    seoTitle: textValue(item.seoTitle, item.seo_title),
    seoDescription: textValue(item.seoDescription, item.seo_description),
    available:
      item.available !== false &&
      item.isAvailable !== false &&
      item.is_available !== false &&
      item.isActive !== false &&
      item.is_active !== false,
  };
}

export function unwrapList(payload: unknown, keys: string[]) {
  if (Array.isArray(payload)) return payload;
  const wrapper = record(payload);
  for (const key of keys) {
    const value = wrapper[key];
    if (Array.isArray(value)) return value;
  }
  const data = wrapper.data;
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    const nested = record(data);
    for (const key of keys) {
      const value = nested[key];
      if (Array.isArray(value)) return value;
    }
  }
  return [];
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly code?: string, readonly requestId?: string) {
    super(message);
    this.name = "ApiError";
  }
}

export async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const body = record(payload);
    const nestedError = record(body.error);
    throw new ApiError(
      textValue(
        body.message,
        nestedError.message,
        body.error,
        `Zahtev nije uspeo (${response.status}).`,
      ),
      response.status,
      textValue(nestedError.code) || undefined,
      textValue(body.requestId, response.headers.get("x-request-id")) || undefined,
    );
  }

  return payload as T;
}

export const money = new Intl.NumberFormat("sr-Latn-RS", {
  style: "currency",
  currency: "RSD",
  maximumFractionDigits: 0,
});

export function formatMoney(value: number) {
  return money.format(Number.isFinite(value) ? value : 0);
}

export function formatDate(value: string | number | Date | undefined) {
  if (!value) return "Nije zakazano";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("sr-Latn-RS", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  }).format(date);
}

export function cadenceLabel(value?: DeliveryCadence | string) {
  return value === "biweekly" ? "Svake 2 nedelje" : "Svake nedelje";
}

export function statusLabel(value?: string) {
  const labels: Record<string, string> = {
    active: "Aktivna",
    paused: "Pauzirana",
    cancelled: "Otkazana",
    canceled: "Otkazana",
    skipped: "Preskočena",
    scheduled: "Zakazana",
    locked: "Zaključana",
    delivered: "Isporučena",
    pending: "Na čekanju",
    paid: "Plaćeno",
  };
  return labels[value ?? ""] ?? value ?? "-";
}
