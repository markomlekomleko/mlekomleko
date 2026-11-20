import { submitLead } from "@/server/leads";
import { assertDomain, jsonResponse, readJson, withRoute } from "@/server/domain";

export function POST(request: Request) {
  return withRoute(async () => {
    assertDomain(request.headers.get("content-type")?.split(";", 1)[0].trim() === "application/json", "INVALID_CONTENT_TYPE", "Format prijave nije ispravan.", 415);
    return jsonResponse(await submitLead(request, await readJson(request)), 201);
  });
}
