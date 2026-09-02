const DEFAULT_HEADERS = Object.freeze([
  "Address Line 1",
  "Address Line 2",
  "City",
  "Postal Code",
  "Customer name",
  "Phone",
  "Email",
  "Notes",
  "Order ID",
  "Products",
]);

function text(value) {
  return value == null ? "" : String(value).replaceAll("\0", "");
}

/** Prevents a CSV value from executing as a formula in Excel/Sheets. */
export function neutralizeSpreadsheetFormula(value) {
  const candidate = text(value);
  return /^[\t\r ]*[=+\-@]/.test(candidate) ? `'${candidate}` : candidate;
}

function csvCell(value) {
  const safe = neutralizeSpreadsheetFormula(value).replaceAll('"', '""');
  return `"${safe}"`;
}

function requiredString(value, field, orderIndex) {
  const candidate = text(value).trim();
  if (!candidate) {
    throw new TypeError(`orders[${orderIndex}].${field} is required.`);
  }
  return candidate;
}

function itemSummary(items, orderIndex) {
  if (!Array.isArray(items) || !items.length) {
    throw new TypeError(`orders[${orderIndex}].items must not be empty.`);
  }
  return items
    .map((item, itemIndex) => {
      const name = requiredString(
        item?.name,
        `items[${itemIndex}].name`,
        orderIndex,
      );
      const quantity = item?.quantity;
      if (typeof quantity !== "number" || !Number.isFinite(quantity) || quantity <= 0) {
        throw new TypeError(
          `orders[${orderIndex}].items[${itemIndex}].quantity must be positive.`,
        );
      }
      const unit = text(item.unit).trim();
      return `${quantity} x ${name}${unit ? ` (${unit})` : ""}`;
    })
    .join("; ");
}

/**
 * Builds a deterministic RFC 4180 CSV: one finalized delivery per row.
 * The UTF-8 BOM is on by default because this file is usually opened in Excel.
 */
export function buildSpokeCsv(orders, { includeBom = true } = {}) {
  if (!Array.isArray(orders)) {
    throw new TypeError("orders must be an array.");
  }

  const rows = orders.map((order, index) => {
    const address = order?.deliveryAddress ?? {};
    const customer = order?.customer ?? {};
    return [
      requiredString(address.line1, "deliveryAddress.line1", index),
      text(address.line2).trim(),
      text(address.city).trim(),
      text(address.postalCode).trim(),
      requiredString(customer.fullName, "customer.fullName", index),
      requiredString(customer.phone, "customer.phone", index),
      requiredString(customer.email, "customer.email", index),
      text(order.note).trim(),
      requiredString(order.orderId, "orderId", index),
      itemSummary(order.items, index),
    ];
  });

  const body = [DEFAULT_HEADERS, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");
  return `${includeBom ? "\uFEFF" : ""}${body}\r\n`;
}

export const SPOKE_CSV_HEADERS = DEFAULT_HEADERS;
