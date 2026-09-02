import { recordAnalyticsEvent } from "../../../server/analytics";
import { jsonResponse, readJson, withRoute } from "../../../server/domain";

export function POST(request: Request) {
  return withRoute(async () => jsonResponse(await recordAnalyticsEvent(await readJson(request)), 202));
}
