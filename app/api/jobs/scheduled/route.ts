import { constantTimeEqual } from "@/server/crypto";
import { assertDomain, jsonResponse, withRoute } from "@/server/domain";
import { runScheduledJobs } from "@/server/jobs";
import { env } from "@/server/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export function GET(request: Request) {
  return withRoute(async () => {
    const secret = (env as { CRON_SECRET?: string }).CRON_SECRET;
    assertDomain(secret && await constantTimeEqual(request.headers.get("authorization") ?? "", `Bearer ${secret}`),
      "CRON_FORBIDDEN", "Neispravan pristup zakazanom zadatku.", 401);
    return jsonResponse({ ok: true, ...await runScheduledJobs() });
  });
}

// Next otherwise forwards HEAD requests to GET. Probes must never run jobs.
export function HEAD() { return new Response(null, { status: 405, headers: { Allow: "GET", "Cache-Control": "no-store" } }); }
