import { assertSameOrigin, authenticateCustomer } from "@/server/auth";
import { updateOrder } from "@/server/admin";
import {
  assertDomain,
  jsonResponse,
  readJson,
  withRoute,
} from "@/server/domain";
import { processOutboxFor } from "@/server/integration-jobs";
import { orderDetail } from "@/server/order-detail";
export function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return withRoute(async () => {
    const customer = await authenticateCustomer(request);
    return jsonResponse(
      await orderDetail((await context.params).id, customer.customerId),
    );
  });
}
export function PATCH(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  return withRoute(async () => {
    assertSameOrigin(request);
    const customer = await authenticateCustomer(request);
    const id = (await context.params).id;
    const input = await readJson(request);
    assertDomain(
      Object.keys(input).every((key) =>
        ["items", "customerNote", "action", "expectedUpdatedAt"].includes(key),
      ),
      "VALIDATION_ERROR",
      "Poslato je nepoznato polje.",
      422,
    );
    assertDomain(
      input.action === undefined || input.action === "cancel",
      "VALIDATION_ERROR",
      "Nepoznata izmena porudžbine.",
      422,
    );
    const current = await orderDetail(id, customer.customerId);
    assertDomain(
      current.editable,
      "ORDER_NOT_EDITABLE",
      current.editReason,
      409,
    );
    const change =
      input.action === "cancel"
        ? { fulfillmentStatus: "cancelled" }
        : { items: input.items, customerNote: input.customerNote };
    await updateOrder(
      { ...change, id, expectedUpdatedAt: input.expectedUpdatedAt },
      { type: "customer", id: customer.customerId },
    );
    await processOutboxFor("order", id);
    return jsonResponse(await orderDetail(id, customer.customerId));
  });
}
