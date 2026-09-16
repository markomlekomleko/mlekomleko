import { requireAdmin } from "@/server/auth";
import { first, all, type Row } from "@/server/sql";
import { assertDomain, jsonResponse, withRoute } from "@/server/domain";
export function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return withRoute(async () => {
    await requireAdmin(request);
    const id = (await context.params).id;
    const order = await first<Row>(
      "SELECT o.*, c.full_name, c.phone, c.address_line_1, c.address_line_2, c.city, c.postal_code FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.id = ?",
      id,
    );
    assertDomain(order, "ORDER_NOT_FOUND", "Porudžbina nije pronađena.", 404);
    return jsonResponse({
      order,
      items: await all<Row>("SELECT * FROM order_items WHERE order_id = ?", id),
    });
  });
}
