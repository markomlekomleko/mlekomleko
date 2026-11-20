import { assertSameOrigin, requireAdmin } from "../../../../server/auth";
import { jsonResponse, readJson, withRoute } from "../../../../server/domain";
import { listLeads, setLeadStatus } from "../../../../server/leads";

/** Stored mlekomat partnership requests and goat-milk waiting-list sign-ups. */
export function GET(request: Request) {
  return withRoute(async () => {
    await requireAdmin(request);
    return jsonResponse({ leads: await listLeads() });
  });
}

/** Marks a lead as handled („Obrađeno") or back to new. */
export function PATCH(request: Request) {
  return withRoute(async () => {
    await requireAdmin(request);
    assertSameOrigin(request);
    return jsonResponse(await setLeadStatus(await readJson(request)));
  });
}
