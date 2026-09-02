import { assertDomain, emailAddress, optionalString, positiveInt, requiredString } from "./domain";
import { enqueueAt } from "./outbox";
import { batch, first, all, sqlPlaceholders, type SqlValue } from "./sql";
import type { ProductRow } from "./products";

type RecoveryItem = { productId: string; quantity: number; purchaseType: "one_time" | "subscription"; cadence: "weekly" | "biweekly" | null };

function parseItems(value: unknown): RecoveryItem[] {
  assertDomain(Array.isArray(value) && value.length > 0 && value.length <= 50, "VALIDATION_ERROR", "Korpa mora imati 1–50 stavki.", 422);
  return value.map((raw, index) => {
    assertDomain(raw && typeof raw === "object" && !Array.isArray(raw), "VALIDATION_ERROR", `Stavka ${index + 1} nije ispravna.`, 422);
    const item = raw as Record<string, unknown>;
    const purchaseType = item.purchaseType === "subscription" ? "subscription" : "one_time";
    const cadence = purchaseType === "subscription" ? item.cadence === "biweekly" ? "biweekly" : "weekly" : null;
    return { productId: requiredString(item.productId, `items[${index}].productId`, 100), quantity: positiveInt(item.quantity, `items[${index}].quantity`, 100), purchaseType, cadence };
  });
}

export async function saveRecoverableCart(input: Record<string, unknown>) {
  const id = requiredString(input.cartId, "cartId", 100);
  assertDomain(/^[a-zA-Z0-9_-]{8,100}$/.test(id), "VALIDATION_ERROR", "Identifikator korpe nije ispravan.", 422);
  const emailConsent = input.emailConsent === true;
  const whatsappConsent = input.whatsappConsent === true;
  assertDomain(emailConsent || whatsappConsent, "CONSENT_REQUIRED", "Izaberite kanal za podsetnik.", 403);
  const email = emailConsent ? emailAddress(input.email) : optionalString(input.email, "email", 200);
  const phone = whatsappConsent ? requiredString(input.phone, "phone", 40) : optionalString(input.phone, "phone", 40);
  const items = parseItems(input.items);
  const promoCode = optionalString(input.promoCode, "promoCode", 40)?.toUpperCase() ?? null;
  const existing = await first<{ recovery_queued_at: string | null } & Record<string, unknown>>("SELECT recovery_queued_at FROM abandoned_carts WHERE id = ?", id);
  const now = new Date();
  const queuedAt = existing?.recovery_queued_at ?? now.toISOString();
  const statements: Array<{ sql: string; bindings?: SqlValue[] }> = [{
    sql: `INSERT INTO abandoned_carts (id, email, phone, items_json, promo_code, email_consent, whatsapp_consent, status, recovery_queued_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, 'saved', ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET email=excluded.email, phone=excluded.phone, items_json=excluded.items_json, promo_code=excluded.promo_code,
          email_consent=excluded.email_consent, whatsapp_consent=excluded.whatsapp_consent, status='saved', updated_at=excluded.updated_at`,
    bindings: [id, email ?? null, phone ?? null, JSON.stringify(items), promoCode, emailConsent ? 1 : 0, whatsappConsent ? 1 : 0, queuedAt, now.toISOString(), now.toISOString()],
  }];
  if (!existing?.recovery_queued_at) {
    statements.push(enqueueAt("cart.recovery.requested", "abandoned_cart", id, { cartId: id, recoveryPath: `/checkout?recover=${encodeURIComponent(id)}`, email: emailConsent ? email : null, phone: whatsappConsent ? phone : null, emailConsent, whatsappConsent }, new Date(now.getTime() + 60 * 60_000).toISOString()));
  }
  await batch(statements);
  return { saved: true, cartId: id, channels: { email: emailConsent, whatsapp: whatsappConsent } };
}

export async function getRecoverableCart(rawId: unknown) {
  const id = requiredString(rawId, "cartId", 100);
  const cart = await first<{ items_json: string; promo_code: string | null; status: string } & Record<string, unknown>>("SELECT items_json, promo_code, status FROM abandoned_carts WHERE id = ?", id);
  assertDomain(cart && cart.status === "saved", "CART_NOT_FOUND", "Sačuvana korpa nije dostupna.", 404);
  let items: RecoveryItem[] = [];
  try { items = JSON.parse(cart.items_json) as RecoveryItem[]; } catch { throw new Error("Stored cart is invalid."); }
  const productIds = [...new Set(items.map((item) => item.productId))];
  const products = productIds.length ? await all<ProductRow>(`SELECT * FROM products WHERE id IN (${sqlPlaceholders(productIds.length)}) AND is_active = 1`, ...productIds) : [];
  const byId = new Map(products.map((product) => [product.id, product]));
  return {
    cartId: id,
    promoCode: cart.promo_code,
    items: items.flatMap((item) => {
      const product = byId.get(item.productId);
      if (!product) return [];
      return [{
        productId: product.id,
        slug: product.slug,
        name: product.name,
        unit: product.unit_label,
        unitPriceRsd: (item.purchaseType === "subscription" ? product.subscription_price_minor ?? product.price_minor : product.price_minor) / 100,
        purchaseType: item.purchaseType,
        cadence: item.cadence ?? undefined,
        quantity: item.quantity,
      }];
    }),
  };
}

export async function optOutRecoverableCart(input: Record<string, unknown>) {
  const id = requiredString(input.cartId, "cartId", 100);
  await batch([{ sql: "UPDATE abandoned_carts SET status = 'opted_out', email_consent = 0, whatsapp_consent = 0, updated_at = ? WHERE id = ?", bindings: [new Date().toISOString(), id] }]);
  return { optedOut: true };
}
