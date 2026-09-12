import { scrypt } from "node:crypto";
import { env } from "@/server/runtime";
import { assertSameOrigin, authenticateCustomer } from "./auth";
import { constantTimeEqual, randomToken, sha256 } from "./crypto";
import { assertDomain, DomainError, emailAddress, enumValue } from "./domain";
import { emailConfigured, whatsappConfigured, sendEmailMessage, sendWhatsAppCode } from "./messaging";
import { renderTransactionalMessage } from "./notifications";
import { enforceIdentityRateLimit, enforceRateLimit } from "./rate-limit";
import { batch, first, run, type SqlValue } from "./sql";

type Channel = "email" | "whatsapp" | "both";
type Purpose = "register" | "login" | "phone";
type Credentials = Record<string, unknown> & { customer_id: string; email: string; whatsapp_phone: string | null; whatsapp_verified_at: string | null; whatsapp_consent_at: string | null };
type Challenge = Record<string, unknown> & {
  id: string; email: string; customer_id: string | null; purpose: Purpose; channel: Channel;
  phone: string | null; password_hash: string | null; code_hash: string; expires_at: string;
};
const config = () => env as Record<string, string | undefined>;
const LOCAL_SECRET = randomToken();
const CODE_MINUTES = 5;

export function localAuth(request: Request): boolean {
  return config().AUTH_MODE === "local" && config().APP_ENV !== "production" && !process.env.VERCEL
    && ["localhost", "127.0.0.1", "[::1]"].includes(new URL(request.url).hostname);
}

function otpSecret(request: Request): string {
  const secret = config().AUTH_CODE_SECRET;
  assertDomain(localAuth(request) || (config().AUTH_MODE === "provider" && secret && secret.length >= 32),
    "AUTH_NOT_CONFIGURED", "Prijava kodom još nije aktivirana. Pokušajte kasnije.", 503);
  return secret && secret.length >= 32 ? secret : LOCAL_SECRET;
}

async function codeHash(id: string, code: string, request: Request) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(otpSecret(request)), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}:${code}`));
  return Array.from(new Uint8Array(signature), byte => byte.toString(16).padStart(2, "0")).join("");
}

function newCode(): string {
  const data = new Uint32Array(1);
  // Rejection sampling avoids modulo bias.
  do { crypto.getRandomValues(data); } while (data[0] >= 4_294_000_000);
  return String(data[0] % 1_000_000).padStart(6, "0");
}

async function passwordHash(value: unknown): Promise<string> {
  assertDomain(typeof value === "string" && value.length >= 12 && value.length <= 128,
    "INVALID_PASSWORD", "Lozinka mora imati od 12 do 128 znakova.", 422);
  const salt = randomToken(16);
  const hash = await new Promise<Buffer>((resolve, reject) => {
    scrypt(value, salt, 64, { N: 32768, r: 8, p: 3, maxmem: 64 * 1024 * 1024 }, (error, result) => error ? reject(error) : resolve(result));
  });
  return `scrypt$32768$8$3$${salt}$${hash.toString("base64url")}`;
}

function normalizePhone(value: unknown): string {
  assertDomain(typeof value === "string" && value.length <= 40, "INVALID_PHONE", "Unesite broj sa pozivnim brojem države, npr. +381601234567.", 422);
  const phone = value.replace(/[\s()-]/g, "").replace(/^00/, "+");
  assertDomain(/^\+[1-9]\d{7,14}$/.test(phone), "INVALID_PHONE", "Unesite broj sa pozivnim brojem države, npr. +381601234567.", 422);
  return phone;
}

async function credentials(email: string) {
  return first<Credentials>("SELECT a.*, c.email FROM customer_credentials a JOIN customers c ON c.id = a.customer_id WHERE c.email = ?", email);
}

async function requestLimits(request: Request, identity: string) {
  await enforceRateLimit(request, "customer-code-ip", 12, 15 * 60);
  await enforceIdentityRateLimit(identity, "customer-code-cooldown", 1, 60);
  await enforceIdentityRateLimit(identity, "customer-code-recipient", 6, 60 * 60);
  await run("DELETE FROM auth_challenges WHERE expires_at <= ?", new Date().toISOString());
}

function assertChannelReady(channel: Channel, request: Request) {
  otpSecret(request);
  if (localAuth(request)) return;
  if (channel !== "whatsapp") assertDomain(emailConfigured(), "EMAIL_NOT_CONFIGURED", "Slanje emaila još nije aktivirano.", 503);
  if (channel !== "email") assertDomain(whatsappConfigured(), "WHATSAPP_NOT_CONFIGURED", "WhatsApp slanje još nije aktivirano. Izaberite email.", 503);
}

export function loginOptions(request: Request) {
  const configured = localAuth(request) || (config().AUTH_MODE === "provider" && (config().AUTH_CODE_SECRET?.length ?? 0) >= 32);
  return { email: configured && (localAuth(request) || emailConfigured()), whatsapp: configured && (localAuth(request) || whatsappConfigured()) };
}

async function issue(input: { email: string; customerId?: string; purpose: Purpose; channel: Channel; phone?: string; passwordHash?: string; eligible: boolean }, request: Request) {
  assertChannelReady(input.channel, request);
  const id = randomToken();
  const code = newCode();
  const expiresAt = new Date(Date.now() + CODE_MINUTES * 60_000).toISOString();
  const response = { accepted: true, challengeId: id, expiresAt, channel: input.channel, retryAfter: 60 };
  // Same response shape for unknown accounts and unverified WhatsApp destinations.
  if (!input.eligible) return response;
  await run(`INSERT INTO auth_challenges (id, email, customer_id, purpose, channel, phone, password_hash, code_hash, expires_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, id, input.email, input.customerId ?? null, input.purpose, input.channel, input.phone ?? null, input.passwordHash ?? null, await codeHash(id, code, request), expiresAt);
  if (localAuth(request)) return { ...response, localDevelopment: { code } };

  const sends: Promise<string>[] = [];
  if (input.channel !== "whatsapp") sends.push(sendEmailMessage(input.email,
    renderTransactionalMessage("auth.code.requested", { code, purpose: input.purpose, minutes: CODE_MINUTES }), `${id}-email`));
  if (input.channel !== "email" && input.phone) sends.push(sendWhatsAppCode(input.phone, code, `${id}-wa`));
  const results = await Promise.allSettled(sends);
  if (!results.some(result => result.status === "fulfilled")) {
    await run("DELETE FROM auth_challenges WHERE id = ?", id);
    throw new DomainError("MESSAGE_SEND_FAILED", "Kod nije poslat. Pokušajte ponovo za minut ili izaberite drugi kanal.", 503);
  }
  // An accepted API request is not proof of delivery. Avoid promising delivery on either channel.
  return response;
}

export async function registerCustomer(request: Request, input: Record<string, unknown>) {
  assertSameOrigin(request);
  const email = emailAddress(input.email);
  assertChannelReady("email", request);
  await requestLimits(request, email);
  const hash = await passwordHash(input.password);
  const existing = await credentials(email);
  return issue({ email, purpose: "register", channel: "email", passwordHash: hash, eligible: !existing }, request);
}

export async function requestLoginCode(request: Request, input: Record<string, unknown>) {
  assertSameOrigin(request);
  const email = emailAddress(input.email);
  const channel = enumValue(input.channel ?? "email", "channel", ["email", "whatsapp", "both"] as const);
  assertChannelReady(channel, request);
  await requestLimits(request, email);
  const account = await credentials(email);
  const phoneReady = Boolean(account?.whatsapp_phone && account.whatsapp_verified_at && account.whatsapp_consent_at);
  return issue({ email, customerId: account?.customer_id, purpose: "login", channel,
    phone: phoneReady ? account!.whatsapp_phone! : undefined, eligible: Boolean(account) && (channel === "email" || phoneReady) }, request);
}

export async function requestPhoneCode(request: Request, input: Record<string, unknown>) {
  assertSameOrigin(request);
  const auth = await authenticateCustomer(request);
  const account = await credentials(auth.email);
  assertDomain(account, "REGISTRATION_REQUIRED", "Prvo napravite nalog email adresom i lozinkom.", 409);
  assertDomain(input.consent === true, "CONSENT_REQUIRED", "Potvrdite da želite kodove za prijavu na WhatsApp.", 422);
  const phone = normalizePhone(input.phone);
  assertChannelReady("whatsapp", request);
  await requestLimits(request, auth.email);
  await enforceIdentityRateLimit(phone, "customer-phone-recipient", 3, 60 * 60);
  return issue({ email: auth.email, customerId: auth.customerId, phone, purpose: "phone", channel: "whatsapp", eligible: true }, request);
}

export async function verifyCustomerCode(request: Request, input: Record<string, unknown>) {
  assertSameOrigin(request);
  await enforceRateLimit(request, "customer-code-verify", 30, 15 * 60);
  const id = typeof input.challengeId === "string" ? input.challengeId : "";
  const code = typeof input.code === "string" ? input.code : "";
  assertDomain(/^[A-Za-z0-9_-]{43}$/.test(id) && /^\d{6}$/.test(code), "INVALID_CODE", "Unesite šestocifreni kod.", 422);
  const now = new Date().toISOString();
  const challenge = await first<Challenge>(`UPDATE auth_challenges SET attempts = attempts + 1
    WHERE id = ? AND used_at IS NULL AND expires_at > ? AND attempts < 5 RETURNING *`, id, now);
  assertDomain(challenge && await constantTimeEqual(challenge.code_hash, await codeHash(id, code, request)),
    "INVALID_CODE", "Kod nije ispravan, istekao je ili je već iskorišćen. Zatražite novi kod.", 401);
  if (challenge.purpose === "phone") {
    const auth = await authenticateCustomer(request);
    assertDomain(auth.customerId === challenge.customer_id, "INVALID_CODE", "Kod ne pripada ovom nalogu.", 401);
    const occupied = await first<Record<string, unknown>>("SELECT customer_id FROM customer_credentials WHERE whatsapp_phone = ? AND customer_id != ?", challenge.phone, auth.customerId);
    assertDomain(!occupied, "PHONE_UNAVAILABLE", "Ovaj broj nije dostupan za povezivanje. Koristite drugi broj ili kontaktirajte podršku.", 409);
  }
  const claim = randomToken();
  const gate = "EXISTS (SELECT 1 FROM auth_challenges WHERE id = ? AND claim_token = ?)";
  const statements: Array<{ sql: string; bindings: SqlValue[] }> = [{
    sql: "UPDATE auth_challenges SET used_at = ?, claim_token = ? WHERE id = ? AND used_at IS NULL AND expires_at > ? AND attempts <= 5",
    bindings: [now, claim, id, now],
  }];
  if (challenge.purpose === "register") {
    statements.push({
      sql: `INSERT INTO customers (id, email, full_name, phone, address_line_1, city, postal_code)
        SELECT ?, ?, '', '', '', '', '' WHERE ${gate} ON CONFLICT(email) DO NOTHING`,
      bindings: [crypto.randomUUID(), challenge.email, id, claim],
    }, {
      sql: `INSERT INTO customer_credentials (customer_id, password_hash, email_verified_at)
        SELECT c.id, ?, ? FROM customers c WHERE c.email = ? AND ${gate} ON CONFLICT(customer_id) DO NOTHING`,
      bindings: [challenge.password_hash, now, challenge.email, id, claim],
    });
  }
  if (challenge.purpose === "phone") {
    statements.push({
      sql: `UPDATE customer_credentials SET whatsapp_phone = ?, whatsapp_verified_at = ?, whatsapp_consent_at = ?, whatsapp_notifications_at = NULL WHERE customer_id = ? AND ${gate}`,
      bindings: [challenge.phone, now, now, challenge.customer_id, id, claim],
    });
  }
  const sessionToken = randomToken();
  const sessionHash = await sha256(sessionToken);
  const sessionExpiresAt = new Date(Date.now() + 30 * 86_400_000).toISOString();
  if (challenge.purpose !== "phone") {
    const extraGate = challenge.purpose === "register" ? "AND a.password_hash = ?" : challenge.channel !== "email" ? "AND a.whatsapp_phone = ? AND a.whatsapp_verified_at IS NOT NULL AND a.whatsapp_consent_at IS NOT NULL" : "";
    statements.push({
      sql: `INSERT INTO auth_tokens (id, customer_id, email, token_hash, kind, expires_at)
        SELECT ?, c.id, c.email, ?, 'session', ? FROM customers c JOIN customer_credentials a ON a.customer_id = c.id
        WHERE c.email = ? AND ${gate} ${extraGate}`,
      bindings: [crypto.randomUUID(), sessionHash, sessionExpiresAt, challenge.email, id, claim,
        ...(challenge.purpose === "register" ? [challenge.password_hash] : challenge.channel !== "email" ? [challenge.phone] : [])],
    });
  }
  // Erase pending password material after consumption; keep only the credential's slow hash.
  statements.push({ sql: "UPDATE auth_challenges SET password_hash = NULL WHERE id = ? AND claim_token = ?", bindings: [id, claim] });
  try { await batch(statements); }
  catch (error) {
    if (challenge.purpose === "phone" && /unique/i.test(error instanceof Error ? error.message : "")) throw new DomainError("PHONE_UNAVAILABLE", "Ovaj broj nije dostupan za povezivanje.", 409);
    throw error;
  }
  const claimed = await first<Record<string, unknown>>("SELECT id FROM auth_challenges WHERE id = ? AND claim_token = ?", id, claim);
  assertDomain(claimed, "INVALID_CODE", "Kod je već iskorišćen. Zatražite novi kod.", 401);
  if (challenge.purpose === "phone") return { phoneVerified: true as const };
  const session = await first<Record<string, unknown>>("SELECT id FROM auth_tokens WHERE token_hash = ?", sessionHash);
  assertDomain(session, "INVALID_CODE", "Zatražite novi kod za prijavu na nalog.", 401);
  return { authenticated: true as const, sessionToken, sessionExpiresAt };
}

export async function getLoginSettings(request: Request) {
  const auth = await authenticateCustomer(request);
  const account = await credentials(auth.email);
  return { registered: Boolean(account), email: auth.email, whatsappPhone: account?.whatsapp_phone ?? null,
    whatsappVerified: Boolean(account?.whatsapp_verified_at), notifications: Boolean(account?.whatsapp_notifications_at),
    whatsappAvailable: loginOptions(request).whatsapp };
}

export async function updateLoginSettings(request: Request, input: Record<string, unknown>) {
  assertSameOrigin(request);
  const auth = await authenticateCustomer(request);
  if (input.action === "disconnect") {
    await batch([
      { sql: "UPDATE customer_credentials SET whatsapp_phone = NULL, whatsapp_verified_at = NULL, whatsapp_consent_at = NULL, whatsapp_notifications_at = NULL WHERE customer_id = ?", bindings: [auth.customerId] },
      { sql: "UPDATE auth_challenges SET used_at = ? WHERE customer_id = ? AND channel != 'email' AND used_at IS NULL", bindings: [new Date().toISOString(), auth.customerId] },
    ]);
  } else {
    assertDomain(typeof input.notifications === "boolean", "VALIDATION_ERROR", "Izaberite podešavanje obaveštenja.", 422);
    const account = await credentials(auth.email);
    assertDomain(account?.whatsapp_verified_at && account.whatsapp_consent_at, "PHONE_NOT_VERIFIED", "Prvo potvrdite WhatsApp broj.", 409);
    await run("UPDATE customer_credentials SET whatsapp_notifications_at = ? WHERE customer_id = ?", input.notifications ? new Date().toISOString() : null, auth.customerId);
  }
  return getLoginSettings(request);
}
