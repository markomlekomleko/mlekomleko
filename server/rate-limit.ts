import { sha256 } from "./crypto";
import { DomainError } from "./domain";
import { env } from "./runtime";
import { first } from "./sql";

type RateLimitRow = Record<string, unknown> & { request_count: number; expires_at: string };

function firstForwarded(value: string | null): string | undefined {
  const address = value?.split(",", 1)[0]?.trim();
  return address || undefined;
}

/** The client address must come from a header the platform itself overwrites, never
 * from one the client may send. Vercel sets x-real-ip and x-forwarded-for; Cloudflare
 * sets cf-connecting-ip only when it fronts the deployment (TRUSTED_PROXY=cloudflare).
 * Local development and isolated tests set the header from the test harness. */
export function clientAddress(request: Request): string {
  const headers = request.headers;
  const runtime = env as Record<string, string | undefined>;
  const proxy = runtime.TRUSTED_PROXY?.trim().toLowerCase();
  if (proxy === "cloudflare") return headers.get("cf-connecting-ip")?.trim() || firstForwarded(headers.get("x-forwarded-for")) || "unknown";
  if (process.env.VERCEL || proxy === "vercel" || runtime.APP_ENV === "production") {
    return headers.get("x-real-ip")?.trim() || firstForwarded(headers.get("x-vercel-forwarded-for")) || firstForwarded(headers.get("x-forwarded-for")) || "unknown";
  }
  return headers.get("cf-connecting-ip")?.trim() || headers.get("x-real-ip")?.trim() || firstForwarded(headers.get("x-forwarded-for")) || "unknown";
}

export async function enforceRateLimit(request: Request, scope: string, limit: number, windowSeconds: number, discriminator = "") {
  return enforceKeyLimit(`${clientAddress(request)}:${discriminator.trim().toLowerCase().slice(0, 254)}`, scope, limit, windowSeconds);
}

// Recipient limits must survive IP changes and distributed requests.
export async function enforceIdentityRateLimit(identity: string, scope: string, limit: number, windowSeconds: number) {
  return enforceKeyLimit(identity.trim().toLowerCase(), scope, limit, windowSeconds);
}

async function enforceKeyLimit(identity: string, scope: string, limit: number, windowSeconds: number) {
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + windowSeconds * 1_000).toISOString();
  const keyHash = await sha256(`${scope}:${identity}`);
  const result = await first<RateLimitRow>(
    `INSERT INTO rate_limits (key_hash, scope, window_started_at, request_count, expires_at)
     VALUES (?, ?, ?, 1, ?)
     ON CONFLICT(key_hash, scope) DO UPDATE SET
       window_started_at = CASE WHEN rate_limits.expires_at <= excluded.window_started_at THEN excluded.window_started_at ELSE rate_limits.window_started_at END,
       request_count = CASE WHEN rate_limits.expires_at <= excluded.window_started_at THEN 1 ELSE rate_limits.request_count + 1 END,
       expires_at = CASE WHEN rate_limits.expires_at <= excluded.window_started_at THEN excluded.expires_at ELSE rate_limits.expires_at END
     RETURNING request_count, expires_at`,
    keyHash, scope, nowIso, expiresAt,
  );
  if (Number(result?.request_count ?? 1) > limit) {
    const retryAfter = Math.max(1, Math.ceil((Date.parse(result?.expires_at ?? expiresAt) - now.getTime()) / 1_000));
    throw new DomainError("RATE_LIMITED", "Previše zahteva. Pokušajte ponovo kasnije.", 429, { retryAfter });
  }
}
