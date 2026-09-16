import { all, first, batch, type Row } from "./sql";
import {
  assertDomain,
  requiredString,
  emailAddress,
  rejectCardData,
} from "./domain";
import {
  checkout,
  getAccount,
  mutateSubscription,
  quoteCart,
} from "./commerce";
import { stableJsonHash } from "./crypto";
import { getBusinessSettings, getNextDeliveryWindow } from "./settings";
import {
  addLocalDays,
  assertLocalDate,
  localDateAt,
  localDateTimeToUtc,
  cutoffForDelivery,
} from "./time";
import { generateDelivery } from "./deliveries";
import { audit } from "./outbox";
import { emailConfigured } from "./messaging";
import {
  processOutboxFor,
  queueDeliveryReminders,
  processDeliveryReminders,
} from "./integration-jobs";
import { contactEmail } from "./customer-contact";
import { renderTransactionalMessage } from "./notifications";

export async function manualOrder(
  input: Record<string, unknown>,
  key: string | null,
) {
  rejectCardData(input);
  assertDomain(
    requiredString(key, "Idempotency-Key", 200).length >= 8,
    "IDEMPOTENCY_KEY_REQUIRED",
    "Ponovite unos sa važećim ključem porudžbine.",
    422,
  );
  assertDomain(
    input.paymentMethod === undefined || input.paymentMethod === "cash",
    "PAYMENT_METHOD_UNAVAILABLE",
    "Ručni unos podržava plaćanje gotovinom pri dostavi.",
    422,
  );
  const raw = input.customer as Record<string, unknown> | undefined;
  assertDomain(
    raw && typeof raw === "object",
    "VALIDATION_ERROR",
    "Unesite podatke kupca.",
    422,
  );
  let customer = { ...raw };
  if (input.customerId) {
    const existing = await first<Row>(
      "SELECT * FROM customers WHERE id = ?",
      requiredString(input.customerId, "customerId", 100),
    );
    assertDomain(existing, "CUSTOMER_NOT_FOUND", "Kupac nije pronađen.", 404);
    customer = { ...customer, email: existing.email };
  } else {
    customer.email = raw.email
      ? emailAddress(raw.email)
      : `manual-${(await stableJsonHash({ key })).slice(0, 32)}@manual.invalid`;
  }
  const notify = input.notify === true;
  assertDomain(
    !notify || (contactEmail(customer.email) && emailConfigured()),
    "EMAIL_NOT_CONFIGURED",
    "Za potvrdu su potrebni email kupca i povezan servis za slanje.",
    422,
  );
  const result = await checkout(
    {
      customer,
      items: input.items,
      deliveryDate: input.deliveryDate,
      paymentMethod: "cash",
      source: { utm_source: "admin" },
    },
    `admin:${key}`,
    { notify },
  );
  const id = String(result.body.order.id);
  await generateDelivery(result.body.order.deliveryDate, `admin-order:${id}`);
  if (notify) {
    await processOutboxFor("order", id);
    if (result.body.subscription?.id)
      await processOutboxFor("subscription", result.body.subscription.id);
  }
  return result;
}

export async function manualOptions() {
  const settings = await getBusinessSettings();
  const locked = await all<Row>(
    "SELECT delivery_date FROM deliveries WHERE status != 'open'",
  );
  const dates: string[] = [];
  for (let i = 0; i < 62; i++) {
    const date = addLocalDays(localDateAt(), i);
    if (
      settings.deliveryWeekdays.includes(
        new Date(`${date}T12:00:00Z`).getUTCDay(),
      ) &&
      Date.parse(
        cutoffForDelivery(
          date,
          settings.cutoffHours,
          settings.deliveryLocalTime,
        ),
      ) > Date.now() &&
      !locked.some((row) => row.delivery_date === date)
    )
      dates.push(date);
  }
  return { dates, emailAvailable: emailConfigured() };
}

export async function adminCustomer(id: string) {
  const account = await getAccount(id);
  const changes = await all<Row>(
    "SELECT a.* FROM audit_log a LEFT JOIN subscriptions s ON a.entity_type = 'subscription' AND s.id = a.entity_id WHERE s.customer_id = ? OR (a.entity_type = 'customer' AND a.entity_id = ?) ORDER BY a.created_at DESC LIMIT 30",
    id,
    id,
  );
  const customer = await first<Row>("SELECT * FROM customers WHERE id = ?", id);
  return {
    ...account,
    changes,
    customer: { ...customer, email: contactEmail(customer?.email) },
  };
}

export async function adminSubscription(
  id: string,
  input: Record<string, unknown>,
  key: string | null,
) {
  const subscription = await first<Row>(
    "SELECT customer_id FROM subscriptions WHERE id = ?",
    id,
  );
  assertDomain(
    subscription,
    "SUBSCRIPTION_NOT_FOUND",
    "Pretplata nije pronađena.",
    404,
  );
  const result = await mutateSubscription(
    String(subscription.customer_id),
    id,
    input,
    key,
    "admin",
  );
  await processOutboxFor("subscription", id);
  return result;
}

export async function updateAdminCustomer(
  id: string,
  input: Record<string, unknown>,
) {
  const before = await first<Row>("SELECT * FROM customers WHERE id = ?", id);
  assertDomain(before, "CUSTOMER_NOT_FOUND", "Kupac nije pronađen.", 404);
  const fullName = requiredString(input.fullName, "Ime i prezime", 160);
  const phone = requiredString(input.phone, "Telefon", 40);
  const address = requiredString(input.addressLine1, "Adresa", 200);
  const city = requiredString(input.city, "Grad", 100);
  const postal = requiredString(input.postalCode, "Poštanski broj", 20);
  // Use the same service-area validation as ordering, without changing any order.
  const { deliveryAddressError } = await import("../app/lib/delivery-area");
  const { isServiceablePostalCode } = await import("./settings");
  assertDomain(
    !deliveryAddressError(city, postal) &&
      isServiceablePostalCode(await getBusinessSettings(), postal),
    "DELIVERY_AREA_UNAVAILABLE",
    "Adresa nije u zoni dostave.",
    422,
  );
  await batch([
    {
      sql: "UPDATE customers SET full_name = ?, phone = ?, address_line_1 = ?, address_line_2 = ?, city = ?, postal_code = ?, delivery_note = ?, updated_at = ? WHERE id = ?",
      bindings: [
        fullName,
        phone,
        address,
        String(input.addressLine2 ?? "").slice(0, 200),
        city,
        postal,
        String(input.deliveryNote ?? "").slice(0, 500),
        new Date().toISOString(),
        id,
      ],
    },
    audit(
      "admin",
      "admin-panel",
      "customer.updated",
      "customer",
      id,
      before,
      input,
    ),
  ]);
  const open = await all<Row>(
    "SELECT delivery_date FROM deliveries WHERE status = 'open' AND delivery_date >= ?",
    localDateAt(),
  );
  for (const d of open)
    await generateDelivery(
      d.delivery_date,
      `customer:${id}:${crypto.randomUUID()}`,
    );
  return adminCustomer(id);
}

export async function insights(params: URLSearchParams) {
  const today = localDateAt();
  const to = assertLocalDate(params.get("to") || today);
  const from = assertLocalDate(params.get("from") || addLocalDays(to, -29));
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
  assertDomain(
    days > 0 && days <= 366,
    "INVALID_PERIOD",
    "Izaberite period od 1 do 366 dana.",
    422,
  );
  const utc = (date: string) =>
    localDateTimeToUtc(date, "00:00").toISOString().slice(0, 19);
  const previousFrom = addLocalDays(from, -days);
  const orders = await all<Row>(
    "SELECT o.id, o.created_at, o.total_minor, o.payment_status, o.fulfillment_status, o.kind FROM orders o WHERE REPLACE(o.created_at, ' ', 'T') >= ? AND REPLACE(o.created_at, ' ', 'T') < ?",
    utc(previousFrom),
    utc(addLocalDays(to, 1)),
  );
  const localDay = (value: unknown) =>
    localDateAt(
      new Date(
        String(value)
          .replace(" ", "T")
          .replace(/(?<!Z)$/, "Z"),
      ),
    );
  const current = orders.filter((order) => localDay(order.created_at) >= from);
  const prior = orders.filter((order) => localDay(order.created_at) < from);
  const sum = (list: Row[]) =>
    list
      .filter((o) => o.payment_status === "paid")
      .reduce((a, o) => a + Number(o.total_minor), 0);
  const daily = Array.from({ length: days }, (_, i) => {
    const date = addLocalDays(from, i);
    const matching = current.filter((o) => localDay(o.created_at) === date);
    return { date, paidMinor: sum(matching), orders: matching.length };
  });
  const [products, newCustomers, states, changes, failures, nextWindow] =
    await Promise.all([
      all<Row>(
        "SELECT oi.product_id, oi.product_name, oi.unit_label, SUM(CASE WHEN oi.unit_price_minor > 0 THEN 1.0 * oi.line_total_minor / oi.unit_price_minor ELSE oi.quantity END) AS units FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.payment_status = 'paid' AND REPLACE(o.created_at, ' ', 'T') >= ? AND REPLACE(o.created_at, ' ', 'T') < ? GROUP BY oi.product_id, oi.product_name, oi.unit_label ORDER BY units DESC",
        utc(from),
        utc(addLocalDays(to, 1)),
      ),
      first<Row>(
        "SELECT COUNT(*) AS count FROM customers WHERE REPLACE(created_at, ' ', 'T') >= ? AND REPLACE(created_at, ' ', 'T') < ?",
        utc(from),
        utc(addLocalDays(to, 1)),
      ),
      all<Row>(
        "SELECT status, COUNT(*) AS count FROM subscriptions GROUP BY status",
      ),
      all<Row>(
        "SELECT a.*, COALESCE(s.customer_id, o.customer_id) AS customer_id, c.full_name FROM audit_log a LEFT JOIN subscriptions s ON a.entity_type = 'subscription' AND a.entity_id = s.id LEFT JOIN orders o ON a.entity_type = 'order' AND a.entity_id = o.id LEFT JOIN customers c ON c.id = COALESCE(s.customer_id, o.customer_id) WHERE a.action IN ('order.created','subscription.pause','subscription.resume','subscription.skip_next','subscription.cancel','subscription.update_item') ORDER BY a.created_at DESC LIMIT 12",
      ),
      all<Row>(
        "SELECT id, topic, last_error_message FROM outbox WHERE status = 'failed' OR (status = 'pending' AND last_error_code IS NOT NULL) ORDER BY created_at DESC LIMIT 20",
      ),
      getNextDeliveryWindow(),
    ]);
  // Show the next actual delivery day, even after the customer booking deadline.
  const settings = await getBusinessSettings();
  let nextDate = today;
  while (
    !settings.deliveryWeekdays.includes(
      new Date(`${nextDate}T12:00:00Z`).getUTCDay(),
    )
  )
    nextDate = addLocalDays(nextDate, 1);
  const upcoming = await generateDelivery(nextDate, "admin-preview", true);
  const due = await first<Row>(
    "SELECT COALESCE(SUM(total_minor),0) AS amount FROM orders WHERE delivery_date = ? AND payment_method = 'cash' AND payment_status = 'pending' AND fulfillment_status != 'cancelled'",
    nextDate,
  );
  return {
    from,
    to,
    daily,
    products,
    states,
    changes,
    failures,
    upcoming,
    nextDate,
    nextBookingDate: nextWindow.deliveryDate,
    totals: {
      paidMinor: sum(current),
      previousPaidMinor: sum(prior),
      orders: current.length,
      paidOrders: current.filter((o) => o.payment_status === "paid").length,
      newCustomers: Number(newCustomers?.count ?? 0),
      cashDueMinor: Number(due?.amount ?? 0),
    },
    kinds: [
      {
        kind: "one_time",
        label: "Jednokratne",
        count: current.filter((o) => o.kind === "one_time").length,
      },
      {
        kind: "subscription_invoice",
        label: "Redovne",
        count: current.filter((o) => o.kind === "subscription_invoice").length,
      },
      {
        kind: "adjustment",
        label: "Dodaci",
        count: current.filter((o) => o.kind === "adjustment").length,
      },
    ],
  };
}

export async function reminderPreview(date: string) {
  assertLocalDate(date);
  const payload = await generateDelivery(date, "reminder-preview", true);
  const eligible = date === addLocalDays(localDateAt(), 1);
  const recipients = await Promise.all(
    payload.orders.map(async (order) => {
      const snapshot = order.customer_snapshot as Record<string, unknown>;
      const key = `delivery-reminder:${order.subscription_id ? "subscription" : "order"}:${order.subscription_id ?? order.source_order_id}:${date}:v2`;
      const job = await first<Row>(
        "SELECT status, external_id, last_error_message FROM outbox WHERE idempotency_key = ?",
        key,
      );
      return {
        id: order.id,
        name: snapshot.fullName,
        email: contactEmail(snapshot.email),
        job,
        message: renderTransactionalMessage(
          "email.delivery_reminder.requested",
          { deliveryDate: date, items: order.items, note: order.note },
        ).text,
      };
    }),
  );
  return { date, eligible, emailAvailable: emailConfigured(), recipients };
}

export async function sendAdminReminders(date: string) {
  assertDomain(
    date === addLocalDays(localDateAt(), 1),
    "INVALID_REMINDER_DATE",
    "Podsetnike možete poslati samo za sutrašnju dostavu.",
    422,
  );
  assertDomain(
    emailConfigured(),
    "EMAIL_NOT_CONFIGURED",
    "Slanje emaila nije povezano. Podsetnici nisu poslati.",
    422,
  );
  await generateDelivery(date, `reminders:${crypto.randomUUID()}`);
  await queueDeliveryReminders(date);
  await processDeliveryReminders(date);
  return reminderPreview(date);
}
export { quoteCart };

export async function adminDelivery(date: string) {
  assertLocalDate(date);
  const payload = await generateDelivery(date, "admin-delivery-preview", true);
  const orders = await Promise.all(
    payload.orders.map(async (order) => {
      const due = order.source_order_id
        ? await first<Row>(
            "SELECT total_minor AS amount FROM orders WHERE id = ? AND payment_method = 'cash' AND payment_status = 'pending' AND fulfillment_status != 'cancelled'",
            order.source_order_id,
          )
        : await first<Row>(
            "SELECT COALESCE(SUM(total_minor),0) AS amount FROM orders WHERE subscription_id = ? AND payment_method = 'cash' AND payment_status = 'pending' AND fulfillment_status != 'cancelled' AND delivery_date <= ?",
            order.subscription_id,
            date,
          );
      return {
        ...order,
        cash_due_minor: Number(due?.amount ?? 0),
        billing_label: order.subscription_id
          ? "Preostali obračuni pretplate"
          : "Ova porudžbina",
      };
    }),
  );
  const excluded = await all<Row>(
    "SELECT s.id, c.full_name, s.status, s.pause_until, sk.delivery_date AS skipped_date FROM subscriptions s JOIN customers c ON c.id = s.customer_id LEFT JOIN subscription_skips sk ON sk.subscription_id = s.id AND sk.delivery_date = ? WHERE sk.delivery_date IS NOT NULL OR (s.status = 'paused' AND s.pause_until > ?)",
    date,
    date,
  );
  return { ...payload, orders, excluded };
}
