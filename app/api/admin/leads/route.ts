import { requireAdmin } from "../../../../server/auth";
import { jsonResponse, withRoute } from "../../../../server/domain";
import { listLeads } from "../../../../server/leads";

/** Stored mlekomat partnership requests and goat-milk waiting-list sign-ups. */
export function GET(request: Request) {
  return withRoute(async () => {
    await requireAdmin(request);
    return jsonResponse({ leads: await listLeads() });
  });
}
