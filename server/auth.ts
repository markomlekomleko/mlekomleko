import { env } from "@/server/runtime";
import { constantTimeEqual, randomToken, sha256 } from "./crypto";
import { DomainError, assertDomain, emailAddress } from "./domain";
import { batch, first, run } from "./sql";
import { enqueue } from "./outbox";
import { processOutboxFor } from "./integration-jobs";

interface AuthRow extends Record<string, unknown> {
  id: string;
  customer_id: string | null;
  email: string;
  kind: "magic_link" | "session";
  expires_at: string;
  used_at: string | null;
}

interface CustomerRow extends Record<string, unknown> {
  id: string;
  email: string;
}

function runtimeEnv(): { APP_ENV?: string; APP_ORIGIN?: string; ADMIN_SECRET?: string; LOCAL_AUTH_EXPOSE_TOKEN?: string } {
  return env as unknown as { APP_ENV?: string; APP_ORIGIN?: string; ADMIN_SECRET?: string; LOCAL_AUTH_EXPOSE_TOKEN?: string };
}

const PRODUCTION_SESSION_COOKIE = "__Host-mm_session";
const LOCAL_SESSION_COOKIE = "mm_session";

function cookies(request: Request): Map<string, string> {
  return new Map((request.headers.get("cookie") ?? "").split(";").map((part): [string, string] => {
    const separator = part.indexOf("=");
    return separator < 0 ? [part.trim(), ""] : [part.slice(0, separator).trim(), decodeURIComponent(part.slice(separator + 1))];
  }).filter(([name]) => Boolean(name)));
}

export function sessionTokenFromRequest(request: Request): string {
  const values = cookies(request);
  return values.get(PRODUCTION_SESSION_COOKIE) ?? values.get(LOCAL_SESSION_COOKIE) ?? "";
}

export function sessionCookie(request: Request, token: string, expiresAt: string): string {
  const secure = new URL(request.url).protocol === "https:";
  const name = secure ? PRODUCTION_SESSION_COOKIE : LOCAL_SESSION_COOKIE;
  return `${name}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.max(0, Math.floor((Date.parse(expiresAt) - Date.now()) / 1_000))}; Expires=${new Date(expiresAt).toUTCString()}${secure ? "; Secure" : ""}`;
}

export function expiredSessionCookies(): string[] {
  return [PRODUCTION_SESSION_COOKIE, LOCAL_SESSION_COOKIE].map((name) => `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT${name === PRODUCTION_SESSION_COOKIE ? "; Secure" : ""}`);
}

export function assertSameOrigin(request: Request): void {
  const supplied = request.headers.get("origin");
  const expected = runtimeEnv().APP_ORIGIN ?? new URL(request.url).origin;
  assertDomain(Boolean(supplied) && supplied === expected, "CSRF_REJECTED", "Zahtev nije poslat sa dozvoljenog porekla.", 403);
}

export async function issueMagicLink(rawEmail: unknown, request: Request): Promise<{ accepted: true; magicLink?: string; localDevelopment?: { url: string; token: string } }> {
  const email = emailAddress(rawEmail);
  const token = randomToken();
  const tokenHash = await sha256(token);
  const customer = await first<CustomerRow>("SELECT id, email FROM customers WHERE email = ?", email);
  const expiresAt = new Date(Date.now() + 15 * 60_000).toISOString();
  const origin = runtimeEnv().APP_ORIGIN ?? new URL(request.url).origin;
  const url = `${origin}/prijava/potvrda?token=${encodeURIComponent(token)}`;
  await batch([
    {
      sql: "INSERT INTO auth_tokens (id, customer_id, email, token_hash, kind, expires_at) VALUES (?, ?, ?, ?, 'magic_link', ?)",
      bindings: [crypto.randomUUID(), customer?.id ?? null, email, tokenHash, expiresAt],
    },
    enqueue("auth.magic_link.requested", "customer", customer?.id ?? email, { email, expiresAt, url }),
  ]);
  await processOutboxFor("customer", customer?.id ?? email);

  // The raw token is exposed only on localhost (or when explicitly opted into local mode).
  const runtime = runtimeEnv();
  const local = runtime.APP_ENV !== "production" && (["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(request.url).hostname) || runtime.LOCAL_AUTH_EXPOSE_TOKEN === "true");
  return local ? { accepted: true, magicLink: url, localDevelopment: { url, token } } : { accepted: true };
}

export async function exchangeMagicLink(token: string): Promise<{ customerId: string; sessionToken: string; sessionExpiresAt: string }> {
  assertDomain(token.length >= 32 && token.length <= 200, "INVALID_TOKEN", "Magic-link token is invalid.", 401);
  const hash = await sha256(token);
  const row = await first<AuthRow>("SELECT id, customer_id, email, kind, expires_at, used_at FROM auth_tokens WHERE token_hash = ?", hash);
  assertDomain(row?.kind === "magic_link" && !row.used_at && Date.parse(row.expires_at) > Date.now(), "INVALID_TOKEN", "Magic link is invalid, expired, or already used.", 401);
  const customer = row.customer_id ? await first<CustomerRow>("SELECT id, email FROM customers WHERE id = ?", row.customer_id) : await first<CustomerRow>("SELECT id, email FROM customers WHERE email = ?", row.email);
  assertDomain(customer, "ACCOUNT_NOT_FOUND", "No completed order exists for this email address.", 404);
  const sessionToken = randomToken();
  const sessionHash = await sha256(sessionToken);
  const expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
  await batch([
    { sql: "INSERT INTO auth_tokens (id, customer_id, email, token_hash, kind, expires_at) SELECT ?, ?, ?, ?, 'session', ? WHERE EXISTS (SELECT 1 FROM auth_tokens WHERE id = ? AND used_at IS NULL)", bindings: [crypto.randomUUID(), customer.id, customer.email, sessionHash, expiresAt, row.id] },
    { sql: "UPDATE auth_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL", bindings: [new Date().toISOString(), row.id] },
  ]);
  const issued = await first<Record<string, unknown>>("SELECT id FROM auth_tokens WHERE token_hash = ? AND kind = 'session'", sessionHash);
  assertDomain(issued, "INVALID_TOKEN", "Magic link was already used.", 401);
  return { customerId: customer.id, sessionToken, sessionExpiresAt: expiresAt };
}

export async function authenticateCustomer(request: Request): Promise<{ customerId: string; email: string }> {
  const token = sessionTokenFromRequest(request);
  assertDomain(token && token.length >= 32 && token.length <= 200, "AUTH_REQUIRED", "A valid customer session is required.", 401);
  const hash = await sha256(token);
  const row = await first<AuthRow>("SELECT id, customer_id, email, kind, expires_at, used_at FROM auth_tokens WHERE token_hash = ?", hash);
  assertDomain(row?.kind === "session" && row.customer_id && !row.used_at && Date.parse(row.expires_at) > Date.now(), "INVALID_SESSION", "Customer session is invalid or expired.", 401);
  return { customerId: row.customer_id, email: row.email };
}

export async function requireAdmin(request: Request): Promise<void> {
  if (isLocalAdminRequest(request)) return;
  const supplied = request.headers.get("x-admin-secret") ?? "";
  const configured = runtimeEnv().ADMIN_SECRET;
  if (!configured) throw new DomainError("ADMIN_NOT_CONFIGURED", "Admin pristup nije podešen na serveru. Postavite ADMIN_SECRET i ponovo pokrenite aplikaciju.", 503);
  assertDomain(supplied.length > 0 && await constantTimeEqual(supplied, configured), "ADMIN_FORBIDDEN", "Admin ključ nije ispravan. Pokušajte ponovo.", 403);
}

// Production builds disable this branch. A hostname or runtime
// environment variable alone must never enable unauthenticated admin access.
export function isLocalAdminRequest(request: Request): boolean {
  if (process.env.NODE_ENV !== "development" || process.env.VERCEL || runtimeEnv().APP_ENV === "production") return false;
  const url = new URL(request.url);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return false;
  if (request.headers.has("forwarded")) return false;
  const loopback = ["127.0.0.1", "::1", "::ffff:127.0.0.1"];
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor && !forwardedFor.split(",").every((ip) => loopback.includes(ip.trim()))) return false;
  // Next.js and Miniflare add forwarding headers even for direct local requests.
  const forwardedHost = request.headers.get("x-forwarded-host");
  const clientIp = request.headers.get("cf-connecting-ip") ?? request.headers.get("x-real-ip");
  if (forwardedHost && forwardedHost !== url.host) return false;
  if (clientIp && !loopback.includes(clientIp)) return false;
  const origin = request.headers.get("origin");
  const fetchSite = request.headers.get("sec-fetch-site");
  return (!origin || origin === url.origin) && (!fetchSite || fetchSite === "same-origin" || fetchSite === "none");
}

export async function adminAccess(request: Request) {
  const local = isLocalAdminRequest(request);
  const configured = Boolean(runtimeEnv().ADMIN_SECRET);
  if (local) return { authenticated: true, configured, mode: "local" as const };
  if (!request.headers.get("x-admin-secret")) return { authenticated: false, configured, mode: "key" as const };
  await requireAdmin(request);
  return { authenticated: true, configured, mode: "key" as const };
}

export async function revokeSession(token: string): Promise<void> {
  if (!token) return;
  await run("UPDATE auth_tokens SET used_at = ? WHERE token_hash = ? AND kind = 'session'", new Date().toISOString(), await sha256(token));
}
