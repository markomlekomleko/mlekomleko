import { all, first, type Row } from "./sql";
import { assertDomain } from "./domain";
import { buildXlsx } from "./xlsx";
import { neutralizeSpreadsheetFormula } from "../integrations/spoke-csv.mjs";

const text = (value: unknown) => String(value ?? "");
const amount = (value: unknown) => Number(value ?? 0) / 100;
const labels: Record<string, string> = {
  pending: "Na čekanju", paid: "Plaćeno", failed: "Neuspešno", refunded: "Refundirano",
  planned: "Planirano", locked: "Zaključano", delivered: "Isporučeno", cancelled: "Otkazano",
  cash: "Gotovina", card: "Kartica", weekly: "Nedeljno", biweekly: "Svake druge nedelje", monthly: "Mesečno",
};
const label = (value: unknown) => labels[text(value)] ?? text(value);

export async function orderConfirmation(id: string, format: "csv" | "xlsx") {
  const order = await first<Row>(`SELECT o.*, c.full_name, c.email, c.phone, c.address_line_1, c.address_line_2, c.city, c.postal_code
    FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = ?`, id);
  assertDomain(order, "ORDER_NOT_FOUND", "Porudžbina nije pronađena.", 404);
  const items = await all<Row>("SELECT * FROM order_items WHERE order_id = ? ORDER BY created_at, id", id);
  const summary = [
    ["Potvrda porudžbine", "Vrednost"],
    ["Broj porudžbine", text(order.order_number)], ["ID porudžbine", id],
    ["Datum porudžbine", text(order.created_at)], ["Prva dostava", text(order.delivery_date)],
    ["Kupac", text(order.full_name)], ["Email", text(order.email)], ["Telefon", text(order.phone)],
    ["Adresa", [order.address_line_1, order.address_line_2].filter(Boolean).join(", ")],
    ["Grad", text(order.city)], ["Poštanski broj", text(order.postal_code)],
    ["Napomena kupca", text(order.customer_note)], ["Način plaćanja", label(order.payment_method)],
    ["Status plaćanja", label(order.payment_status)], ["Status isporuke", label(order.fulfillment_status)],
    ["Valuta", text(order.currency)], ["Međuzbir (RSD)", amount(order.subtotal_minor)],
    ["Popust (RSD)", amount(order.discount_minor)], ["Kredit (RSD)", amount(order.credit_applied_minor)],
    ["Dostava (RSD)", amount(order.delivery_fee_minor)], ["Ukupno porudžbine (RSD)", amount(order.total_minor)],
  ];
  const itemRows = [
    ["Proizvod", "Jedinica", "Količina po dostavi", "Cena po jedinici (RSD)", "Broj obračunatih dostava", "Iznos stavke (RSD)", "Kupovina", "Učestalost"],
    ...items.map(item => [text(item.product_name), text(item.unit_label), Number(item.quantity), amount(item.unit_price_minor),
      Number(item.unit_price_minor) > 0 ? Number(item.line_total_minor) / (Number(item.unit_price_minor) * Number(item.quantity)) : "",
      amount(item.line_total_minor), item.purchase_type === "subscription" ? "Redovna dostava" : "Jednokratno", label(item.cadence)]),
  ];
  if (format === "xlsx") return buildXlsx([{ name: "Potvrda", rows: summary }, { name: "Stavke", rows: itemRows }]);
  // Repeat order fields on every item row so CSV remains a rectangular importable table.
  const columns = summary.slice(1);
  const rows = [[...columns.map(row => row[0]), ...itemRows[0]], ...itemRows.slice(1).map(row => [...columns.map(field => field[1]), ...row])];
  return "\uFEFF" + rows.map(row => row.map(cell => `"${neutralizeSpreadsheetFormula(cell).replaceAll('"', '""')}"`).join(",")).join("\r\n") + "\r\n";
}
