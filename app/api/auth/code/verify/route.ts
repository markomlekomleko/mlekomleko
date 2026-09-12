import { verifyCustomerCode } from "@/server/customer-login";
import { sessionCookie } from "@/server/auth";
import { jsonResponse, readJson, withRoute } from "@/server/domain";

export function POST(request: Request) {
  return withRoute(async () => {
    const result = await verifyCustomerCode(request, await readJson(request));
    if (result.sessionToken && result.sessionExpiresAt) return jsonResponse({ authenticated: true, expiresAt: result.sessionExpiresAt }, 200,
      { "set-cookie": sessionCookie(request, result.sessionToken, result.sessionExpiresAt) });
    return jsonResponse(result);
  });
}
