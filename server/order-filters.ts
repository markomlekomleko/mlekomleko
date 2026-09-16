import { assertDomain, enumValue, optionalString, positiveInt } from "./domain";
import { addLocalDays, assertLocalDate, localDateTimeToUtc } from "./time";
import type { SqlValue } from "./sql";

export function orderFilters(params: URLSearchParams) {
  const conditions: string[] = [];
  const bindings: SqlValue[] = [];
  const dateField = enumValue(params.get("dateField") || "created", "dateField", ["created", "delivery"] as const);
  const from = params.get("from") ? assertLocalDate(params.get("from"), "from") : null;
  const to = params.get("to") ? assertLocalDate(params.get("to"), "to") : null;
  assertDomain(!from || !to || from <= to, "VALIDATION_ERROR", "Datum od ne može biti posle datuma do.", 422);
  // Legacy rows use a space in UTC timestamps; newer rows use ISO T/Z.
  const column = dateField === "delivery" ? "o.delivery_date" : "REPLACE(o.created_at, ' ', 'T')";
  if (from) {
    conditions.push(`${column} >= ?`);
    bindings.push(dateField === "delivery" ? from : localDateTimeToUtc(from, "00:00").toISOString().slice(0, 19));
  }
  if (to) {
    conditions.push(`${column} ${dateField === "delivery" ? "<=" : "<"} ?`);
    bindings.push(dateField === "delivery" ? to : localDateTimeToUtc(addLocalDays(to, 1), "00:00").toISOString().slice(0, 19));
  }
  if (params.get("date")) {
    conditions.push("o.delivery_date = ?");
    bindings.push(assertLocalDate(params.get("date"), "date"));
  }
  const enums = [
    ["paymentStatus", "o.payment_status", ["pending", "paid", "failed", "refunded"]],
    ["fulfillmentStatus", "o.fulfillment_status", ["planned", "locked", "delivered", "cancelled"]],
    ["paymentMethod", "o.payment_method", ["cash", "card"]],
    ["kind", "o.kind", ["one_time", "subscription_invoice", "adjustment"]],
  ] as const;
  for (const [key, field, values] of enums) {
    if (!params.get(key)) continue;
    conditions.push(`${field} = ?`);
    bindings.push(enumValue(params.get(key), key, values));
  }
  if (params.get("customerId")) { conditions.push("o.customer_id = ?"); bindings.push(params.get("customerId")!); }
  if (params.get("productId")) { conditions.push("EXISTS (SELECT 1 FROM order_items filter_item WHERE filter_item.order_id = o.id AND filter_item.product_id = ?)"); bindings.push(params.get("productId")!); }
  const query = optionalString(params.get("q")?.trim(), "q", 200);
  if (query) {
    const fields = ["o.order_number", "o.id", "c.full_name", "c.email", "c.phone"];
    conditions.push(`(${fields.map(field => `LOWER(${field}) LIKE LOWER(?) ESCAPE '!'`).join(" OR ")})`);
    const pattern = `%${query.replace(/[!%_]/g, "!$&")}%`;
    fields.forEach(() => bindings.push(pattern));
  }
  const sort = enumValue(params.get("sort") || "newest", "sort", ["newest", "oldest", "delivery", "total_desc", "total_asc"] as const);
  const orderBy = { newest: "REPLACE(o.created_at, ' ', 'T') DESC", oldest: "REPLACE(o.created_at, ' ', 'T') ASC", delivery: "o.delivery_date ASC, REPLACE(o.created_at, ' ', 'T') DESC", total_desc: "o.total_minor DESC", total_asc: "o.total_minor ASC" }[sort];
  const page = positiveInt(Number(params.get("page") || 1), "page", 1_000_000);
  const pageSize = positiveInt(Number(params.get("pageSize") || 50), "pageSize", 500);
  return { where: conditions.length ? `WHERE ${conditions.join(" AND ")}` : "", bindings, orderBy: `${orderBy}, o.id ASC`, page, pageSize };
}
