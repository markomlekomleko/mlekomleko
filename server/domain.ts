export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly status = 400,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "DomainError";
  }
}

export function assertDomain(condition: unknown, code: string, message: string, status = 400, details?: unknown): asserts condition {
  if (!condition) throw new DomainError(code, message, status, details);
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get("content-length") ?? 0);
  assertDomain(!length || length <= 64_000, "PAYLOAD_TOO_LARGE", "Request body is too large.", 413);
  try {
    const value = await request.json();
    assertDomain(value && typeof value === "object" && !Array.isArray(value), "INVALID_JSON", "JSON object expected.");
    return value as Record<string, unknown>;
  } catch (error) {
    if (error instanceof DomainError) throw error;
    throw new DomainError("INVALID_JSON", "Request body is not valid JSON.");
  }
}

export function requiredString(value: unknown, field: string, max = 200): string {
  assertDomain(typeof value === "string", "VALIDATION_ERROR", `${field} is required.`, 422, { field });
  const clean = value.trim();
  assertDomain(clean.length > 0 && clean.length <= max, "VALIDATION_ERROR", `${field} must contain 1-${max} characters.`, 422, { field });
  return clean;
}

export function optionalString(value: unknown, field: string, max = 500): string | null {
  if (value == null || value === "") return null;
  return requiredString(value, field, max);
}

export function positiveInt(value: unknown, field: string, max = 10_000): number {
  assertDomain(Number.isSafeInteger(value) && Number(value) > 0 && Number(value) <= max, "VALIDATION_ERROR", `${field} must be a positive integer.`, 422, { field });
  return Number(value);
}

export function nonNegativeInt(value: unknown, field: string, max = 100_000_000): number {
  assertDomain(Number.isSafeInteger(value) && Number(value) >= 0 && Number(value) <= max, "VALIDATION_ERROR", `${field} must be a non-negative integer.`, 422, { field });
  return Number(value);
}

export function emailAddress(value: unknown): string {
  const email = requiredString(value, "email", 254).toLowerCase();
  assertDomain(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), "VALIDATION_ERROR", "Email address is invalid.", 422, { field: "email" });
  return email;
}

export function enumValue<T extends string>(value: unknown, field: string, values: readonly T[]): T {
  assertDomain(typeof value === "string" && values.includes(value as T), "VALIDATION_ERROR", `${field} must be one of: ${values.join(", ")}.`, 422, { field });
  return value as T;
}

export function rejectCardData(value: unknown): void {
  const forbidden = /^(card(number)?|pan|cvc|cvv|expiry|expiration|cardholder)$/i;
  const walk = (current: unknown): void => {
    if (!current || typeof current !== "object") return;
    for (const [key, child] of Object.entries(current as Record<string, unknown>)) {
      assertDomain(!forbidden.test(key), "CARD_DATA_REJECTED", "Raw card data must never be sent to this service. Use a payment-provider token.", 422);
      walk(child);
    }
  };
  walk(value);
}

export function jsonResponse(data: unknown, status = 200, headers?: HeadersInit): Response {
  const responseHeaders = new Headers(headers);
  if (!responseHeaders.has("cache-control")) responseHeaders.set("cache-control", "no-store");
  return Response.json(data, { status, headers: responseHeaders });
}

export function routeError(error: unknown): Response {
  const requestId = crypto.randomUUID();
  if (error instanceof DomainError) {
    return jsonResponse({ error: { code: error.code, message: error.message, details: error.details }, requestId }, error.status, { "x-request-id": requestId });
  }
  const message = error instanceof Error ? error.message : "Unexpected server error";
  console.error(error);
  const unavailable = /no such table|Database (?:binding|is not configured|on Vercel)/i.test(message);
  return jsonResponse(
    { error: { code: unavailable ? "DATABASE_NOT_READY" : "INTERNAL_ERROR", message: unavailable ? "Baza podataka nije spremna. Proverite vezu i primenite migracije." : "Unexpected server error." }, requestId },
    unavailable ? 503 : 500,
    { "x-request-id": requestId },
  );
}

export function withRoute(handler: () => Promise<Response>): Promise<Response> {
  return handler().catch(routeError);
}
