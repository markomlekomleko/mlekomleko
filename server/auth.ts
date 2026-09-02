import { env } from "cloudflare:workers";
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

function runtimeEnv(): { APP_ORIGIN?: string; ADMIN_SECRET?: string; LOCAL_AUTH_EXPOSE_TOKEN?: string } {
  return env as unknown as { APP_ORIGIN?: string; ADMIN_SECRET?: string; LOCAL_AUTH_EXPOSE_TOKEN?: string };
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
  const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(new URL(request.url).hostname) || runtimeEnv().LOCAL_AUTH_EXPOSE_TOKEN === "true";
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

export async function authenticateCustomer(request: Request, queryToken?: string | null): Promise<{ customerId: string; email: string }> {
  const authorization = request.headers.get("authorization");
  const token = authorization?.startsWith("Bearer ") ? authorization.slice(7).trim() : queryToken?.trim();
  assertDomain(token && token.length >= 32 && token.length <= 200, "AUTH_REQUIRED", "A valid customer session is required.", 401);
  const hash = await sha256(token);
  const row = await first<AuthRow>("SELECT id, customer_id, email, kind, expires_at, used_at FROM auth_tokens WHERE token_hash = ?", hash);
  assertDomain(row?.kind === "session" && row.customer_id && !row.used_at && Date.parse(row.expires_at) > Date.now(), "INVALID_SESSION", "Customer session is invalid or expired.", 401);
  return { customerId: row.customer_id, email: row.email };
}

export async function requireAdmin(request: Request): Promise<void> {
  const supplied = request.headers.get("x-admin-secret") ?? "";
  const configured = runtimeEnv().ADMIN_SECRET;
  const hostname = new URL(request.url).hostname;
  const local = ["localhost", "127.0.0.1", "::1", "[::1]"].includes(hostname);
  if (!configured && !local) throw new DomainError("ADMIN_NOT_CONFIGURED", "ADMIN_SECRET must be configured outside local development.", 503);
  const expected = configured ?? "local-dev-change-me";
  assertDomain(supplied.length > 0 && await constantTimeEqual(supplied, expected), "ADMIN_FORBIDDEN", "Admin access denied.", 403);
}

export async function revokeSession(token: string): Promise<void> {
  await run("UPDATE auth_tokens SET used_at = ? WHERE token_hash = ? AND kind = 'session'", new Date().toISOString(), await sha256(token));
}
