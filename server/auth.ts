import { env } from "@/server/runtime";
import { constantTimeEqual, randomToken, sha256 } from "./crypto";
import { DomainError, assertDomain, emailAddress } from "./domain";
import { batch, first, run } from "./sql";
import { enqueue } from "./outbox";
import { processOutboxFor } from "./integration-jobs";
import { enforceRateLimit } from "./rate-limit";

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

function runtimeEnv(): Record<string, string | undefined> {
  return env as Record<string, string | undefined>;
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
  const runtime = env as Record<string, string | undefined>;
  const local = runtime.APP_ENV !== "production" && (["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(request.url).hostname) || runtime.LOCAL_AUTH_EXPOSE_TOKEN === "true");
  assertDomain(local || (runtime.EMAIL_MODE === "provider" && runtime.EMAIL_PROVIDER?.toLowerCase() === "resend" && runtime.EMAIL_API_KEY && runtime.EMAIL_FROM), "EMAIL_NOT_CONFIGURED", "Prijava emailom trenutno nije dostupna. Obratite nam se preko kontakt stranice.", 503);
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
  return local ? { accepted: true, magicLink: url, localDevelopment: { url, token } } : { accepted: true };
}

export async function exchangeMagicLink(token: string): Promise<{ customerId: string; sessionToken: string; sessionExpiresAt: string }> {
  assertDomain(token.length >= 32 && token.length <= 200, "INVALID_TOKEN", "Link za prijavu nije važeći. Zatražite novi link.", 401);
  const hash = await sha256(token);
  const row = await first<AuthRow>("SELECT id, customer_id, email, kind, expires_at, used_at FROM auth_tokens WHERE token_hash = ?", hash);
  assertDomain(row?.kind === "magic_link" && !row.used_at && Date.parse(row.expires_at) > Date.now(), "INVALID_TOKEN", "Link je istekao ili je već iskorišćen. Zatražite novi link.", 401);
  const customer = row.customer_id ? await first<CustomerRow>("SELECT id, email FROM customers WHERE id = ?", row.customer_id) : await first<CustomerRow>("SELECT id, email FROM customers WHERE email = ?", row.email);
  assertDomain(customer, "ACCOUNT_NOT_FOUND", "Za ovu email adresu još nema porudžbine. Nalog se otvara nakon prve porudžbine.", 404);
  const sessionToken = randomToken();
  const sessionHash = await sha256(sessionToken);
  const expiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
  await batch([
    { sql: "INSERT INTO auth_tokens (id, customer_id, email, token_hash, kind, expires_at) SELECT ?, ?, ?, ?, 'session', ? WHERE EXISTS (SELECT 1 FROM auth_tokens WHERE id = ? AND used_at IS NULL)", bindings: [crypto.randomUUID(), customer.id, customer.email, sessionHash, expiresAt, row.id] },
    { sql: "UPDATE auth_tokens SET used_at = ? WHERE id = ? AND used_at IS NULL", bindings: [new Date().toISOString(), row.id] },
  ]);
  const issued = await first<Record<string, unknown>>("SELECT id FROM auth_tokens WHERE token_hash = ? AND kind = 'session'", sessionHash);
  assertDomain(issued, "INVALID_TOKEN", "Link je već iskorišćen. Zatražite novi link.", 401);
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

function adminCredentials() {
  const { ADMIN_USERNAME: username, ADMIN_PASSWORD: password } = runtimeEnv();
  return username && password && password.length >= 12 ? { username, password } : null;
}

// Compatibility for isolated legacy worker fixtures only. Never enabled on Vercel.
function legacyAdminAccess(): boolean {
  return runtimeEnv().ADMIN_LEGACY_ACCESS === "true" && runtimeEnv().APP_ENV !== "production"
    && !process.env.VERCEL && !runtimeEnv().ADMIN_USERNAME && !runtimeEnv().ADMIN_PASSWORD;
}

function adminToken(request: Request): string {
  return request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9_-]{43})$/)?.[1] ?? "";
}

async function credentialFingerprint(credentials: { username: string; password: string }) {
  return sha256(JSON.stringify([credentials.username, credentials.password]));
}

export async function loginAdmin(request: Request, input: Record<string, unknown>) {
  assertSameOrigin(request);
  const credentials = adminCredentials();
  if (!credentials) throw new DomainError("ADMIN_NOT_CONFIGURED", "Postavite ADMIN_USERNAME i ADMIN_PASSWORD (najmanje 12 znakova) na serveru.", 503);
  await enforceRateLimit(request, "admin-login", 10, 15 * 60);
  const username = typeof input.username === "string" ? input.username : "";
  const password = typeof input.password === "string" ? input.password : "";
  const [nameMatches, passwordMatches] = await Promise.all([
    constantTimeEqual(username, credentials.username), constantTimeEqual(password, credentials.password),
  ]);
  assertDomain(nameMatches && passwordMatches, "ADMIN_FORBIDDEN", "Korisničko ime ili lozinka nisu ispravni.", 403);
  const sessionToken = randomToken();
  const expiresAt = new Date(Date.now() + 8 * 60 * 60_000).toISOString();
  await batch([
    { sql: "DELETE FROM admin_sessions WHERE expires_at <= ? OR revoked_at IS NOT NULL", bindings: [new Date().toISOString()] },
    { sql: "INSERT INTO admin_sessions (token_hash, credential_hash, expires_at) VALUES (?, ?, ?)", bindings: [await sha256(sessionToken), await credentialFingerprint(credentials), expiresAt] },
  ]);
  return { authenticated: true, configured: true, mode: "password" as const, sessionToken, expiresAt };
}

export async function logoutAdmin(request: Request) {
  const token = adminToken(request);
  if (token) await run("UPDATE admin_sessions SET revoked_at = ? WHERE token_hash = ?", new Date().toISOString(), await sha256(token));
  return { authenticated: false };
}

export async function requireAdmin(request: Request): Promise<void> {
  if (isLocalAdminRequest(request)) return;
  if (legacyAdminAccess()) {
    const configured = runtimeEnv().ADMIN_SECRET;
    if (!configured) throw new DomainError("ADMIN_NOT_CONFIGURED", "Admin pristup nije podešen.", 503);
    assertDomain(await constantTimeEqual(request.headers.get("x-admin-secret") ?? "", configured), "ADMIN_FORBIDDEN", "Admin pristup nije dozvoljen.", 403);
    return;
  }
  const credentials = adminCredentials();
  if (!credentials) throw new DomainError("ADMIN_NOT_CONFIGURED", "Postavite ADMIN_USERNAME i ADMIN_PASSWORD (najmanje 12 znakova) na serveru.", 503);
  const token = adminToken(request);
  assertDomain(token, "ADMIN_FORBIDDEN", "Prijavite se korisničkim imenom i lozinkom.", 403);
  const session = await first<Record<string, unknown>>("SELECT credential_hash, expires_at, revoked_at FROM admin_sessions WHERE token_hash = ?", await sha256(token));
  assertDomain(session && !session.revoked_at && Date.parse(String(session.expires_at)) > Date.now()
    && session.credential_hash === await credentialFingerprint(credentials), "ADMIN_FORBIDDEN", "Prijava je istekla. Prijavite se ponovo.", 403);
}

// Production builds disable this branch. A hostname or runtime
// environment variable alone must never enable unauthenticated admin access.
export function isLocalAdminRequest(request: Request): boolean {
  if (runtimeEnv().ADMIN_USERNAME || runtimeEnv().ADMIN_PASSWORD) return false;
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
  const configured = legacyAdminAccess() ? Boolean(runtimeEnv().ADMIN_SECRET) : Boolean(adminCredentials());
  const mode = legacyAdminAccess() ? "key" as const : "password" as const;
  if (isLocalAdminRequest(request)) return { authenticated: true, configured, mode: "local" as const };
  if (!request.headers.has("authorization") && !request.headers.has("x-admin-secret")) return { authenticated: false, configured, mode };
  await requireAdmin(request);
  return { authenticated: true, configured, mode };
}

export async function revokeSession(token: string): Promise<void> {
  if (!token) return;
  await run("UPDATE auth_tokens SET used_at = ? WHERE token_hash = ? AND kind = 'session'", new Date().toISOString(), await sha256(token));
}
