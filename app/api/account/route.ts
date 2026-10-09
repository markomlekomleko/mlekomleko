import { updateProfile } from "../../../server/profile";
import { authenticateCustomer, assertSameOrigin } from "../../../server/auth";
import { getAccount } from "../../../server/commerce";
import { jsonResponse, readJson, withRoute } from "../../../server/domain";

export function GET(request: Request) {
  return withRoute(async () => {
    const auth = await authenticateCustomer(request);
    return jsonResponse(await getAccount(auth.customerId));
  });
}

export function PATCH(request: Request) { return withRoute(async()=>{ assertSameOrigin(request); const auth = await authenticateCustomer(request); return jsonResponse(await updateProfile(auth.customerId,await readJson(request))); }); }
