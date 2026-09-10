import { sha256 } from "./crypto";
import { DomainError } from "./domain";
import { first } from "./sql";

type RateLimitRow = Record<string, unknown> & { request_count: number; expires_at: string };

function clientAddress(request: Request): string {
  return request.headers.get("cf-connecting-ip")
    ?? request.headers.get("x-real-ip")
    ?? request.headers.get("x-forwarded-for")?.split(",", 1)[0]?.trim()
    ?? "unknown";
}

export async function enforceRateLimit(request: Request, scope: string, limit: number, windowSeconds: number, discriminator = "") {
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + windowSeconds * 1_000).toISOString();
  const keyHash = await sha256(`${scope}:${clientAddress(request)}:${discriminator.trim().toLowerCase().slice(0, 254)}`);
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
