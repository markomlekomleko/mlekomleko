import { sessionCookie } from "@/server/auth";
import { loginDemoCustomer } from "@/server/demo-account";
import { jsonResponse, withRoute } from "@/server/domain";

export function POST(request: Request) {
  return withRoute(async () => {
    const result = await loginDemoCustomer(request);
    return jsonResponse({ authenticated: true, demo: true, expiresAt: result.sessionExpiresAt }, 200,
      { "set-cookie": sessionCookie(request, result.sessionToken, result.sessionExpiresAt) });
  });
}
