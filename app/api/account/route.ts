import { authenticateCustomer, exchangeMagicLink } from "../../../server/auth";
import { getAccount } from "../../../server/commerce";
import { assertDomain, jsonResponse, withRoute } from "../../../server/domain";

export function GET(request: Request) {
  return withRoute(async () => {
    const magicToken = new URL(request.url).searchParams.get("token");
    if (magicToken) {
      const auth = await exchangeMagicLink(magicToken);
      return jsonResponse({
        ...(await getAccount(auth.customerId)),
        session: { token: auth.sessionToken, expiresAt: auth.sessionExpiresAt },
      });
    }

    assertDomain(request.headers.get("authorization"), "AUTH_REQUIRED", "Bearer session is required.", 401);
    const auth = await authenticateCustomer(request);
    return jsonResponse(await getAccount(auth.customerId));
  });
}
