import { authenticateCustomer } from "../../../server/auth";
import { getAccount } from "../../../server/commerce";
import { jsonResponse, withRoute } from "../../../server/domain";

export function GET(request: Request) {
  return withRoute(async () => {
    const auth = await authenticateCustomer(request);
    return jsonResponse(await getAccount(auth.customerId));
  });
}
