const APP_ENVIRONMENTS = new Set(["local", "test", "production"]);
const PAYMENT_PROVIDERS = new Set(["disabled", "otp", "raiaccept"]);
const PAYMENT_MODES = new Set(["disabled", "mock", "sandbox", "production"]);
const BADI_MODES = new Set([
  "disabled",
  "mock",
  "sandbox",
  "production",
  "local",
]);
const EMAIL_MODES = new Set(["console", "provider"]);
const WHATSAPP_MODES = new Set(["disabled", "queue", "provider"]);

const BADI_ENDPOINTS = Object.freeze({
  sandbox: "https://api.sandbox.badi.rs/v2",
  production: "https://api.production.badi.rs/v2",
});

export class IntegrationConfigError extends Error {
  constructor(message) {
    super(message);
    this.name = "IntegrationConfigError";
  }
}

function value(env, key, fallback = "") {
  const candidate = env[key];
  return typeof candidate === "string" && candidate.trim()
    ? candidate.trim()
    : fallback;
}

function choice(env, key, allowed, fallback) {
  const candidate = value(env, key, fallback).toLowerCase();
  if (!allowed.has(candidate)) {
    throw new IntegrationConfigError(
      `${key} must be one of: ${[...allowed].join(", ")}.`,
    );
  }
  return candidate;
}

function enabled(env, key) {
  return value(env, key, "false").toLowerCase() === "true";
}

function requireKeys(env, keys, context) {
  const missing = keys.filter((key) => !value(env, key));
  if (missing.length) {
    throw new IntegrationConfigError(
      `${context} requires: ${missing.join(", ")}.`,
    );
  }
}

function requireHttps(rawUrl, key) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new IntegrationConfigError(`${key} must be a valid URL.`);
  }
  if (parsed.protocol !== "https:") {
    throw new IntegrationConfigError(`${key} must use HTTPS.`);
  }
  return parsed.toString().replace(/\/$/, "");
}

function requireLoopbackHttp(rawUrl, key) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new IntegrationConfigError(`${key} must be a valid URL.`);
  }
  if (
    parsed.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "::1"].includes(parsed.hostname)
  ) {
    throw new IntegrationConfigError(
      `${key} local mode must use HTTP on a loopback host.`,
    );
  }
  return parsed.toString().replace(/\/$/, "");
}

function requireProductionLatch(env, mode, integration) {
  if (mode === "production" && !enabled(env, "ALLOW_PRODUCTION_INTEGRATIONS")) {
    throw new IntegrationConfigError(
      `${integration} production mode requires ALLOW_PRODUCTION_INTEGRATIONS=true.`,
    );
  }
}

/**
 * Reads integration configuration without performing network calls.
 *
 * Defaults are deliberately local-safe. A real provider and production mode
 * must both be selected explicitly, and production also needs a second latch.
 */
export function readIntegrationConfig(env = process.env) {
  const inferredEnvironment =
    value(env, "NODE_ENV") === "production" ? "production" : "local";
  const appEnvironment = choice(
    env,
    "APP_ENV",
    APP_ENVIRONMENTS,
    inferredEnvironment,
  );

  const paymentProvider = choice(
    env,
    "PAYMENT_PROVIDER",
    PAYMENT_PROVIDERS,
    "disabled",
  );
  const paymentMode = choice(
    env,
    "PAYMENT_MODE",
    PAYMENT_MODES,
    paymentProvider === "disabled" ? "disabled" : "mock",
  );

  if (paymentProvider === "disabled" && !["disabled", "mock"].includes(paymentMode)) {
    throw new IntegrationConfigError(
      "Select PAYMENT_PROVIDER=otp or PAYMENT_PROVIDER=raiaccept before enabling a remote payment mode.",
    );
  }
  if (paymentProvider !== "disabled" && paymentMode !== "disabled") {
    requireKeys(env, ["PAYMENT_MERCHANT_ID"], "Configured payment provider");
  }
  requireProductionLatch(env, paymentMode, "Payment");

  let paymentBaseUrl = null;
  if (["sandbox", "production"].includes(paymentMode)) {
    requireKeys(
      env,
      ["PAYMENT_BASE_URL", "PAYMENT_API_SECRET", "PAYMENT_WEBHOOK_SECRET"],
      "Remote payment mode",
    );
    paymentBaseUrl = requireHttps(value(env, "PAYMENT_BASE_URL"), "PAYMENT_BASE_URL");
  }

  const badiMode = choice(env, "BADI_MODE", BADI_MODES, "mock");
  requireProductionLatch(env, badiMode, "Badi");
  let badiBaseUrl = null;
  if (badiMode === "sandbox" || badiMode === "production") {
    requireKeys(env, ["BADI_API_KEY", "BADI_API_SECRET", "BADI_CLIENT_ID"], "Badi");
    badiBaseUrl = BADI_ENDPOINTS[badiMode];
  } else if (badiMode === "local") {
    badiBaseUrl = requireLoopbackHttp(
      value(env, "BADI_LOCAL_BASE_URL", "http://127.0.0.1:9999"),
      "BADI_LOCAL_BASE_URL",
    );
  }

  const emailMode = choice(env, "EMAIL_MODE", EMAIL_MODES, "console");
  if (emailMode === "provider") {
    requireKeys(
      env,
      ["EMAIL_PROVIDER", "EMAIL_API_KEY", "EMAIL_FROM"],
      "Transactional email provider",
    );
  }

  const whatsappMode = choice(
    env,
    "WHATSAPP_MODE",
    WHATSAPP_MODES,
    "disabled",
  );
  if (whatsappMode === "provider") {
    requireKeys(
      env,
      ["WHATSAPP_PROVIDER", "WHATSAPP_API_KEY", "WHATSAPP_SENDER_ID"],
      "WhatsApp provider",
    );
  }

  return Object.freeze({
    appEnvironment,
    integrations: Object.freeze({
      payment: Object.freeze({
        provider: paymentProvider,
        mode: paymentMode,
        merchantId: value(env, "PAYMENT_MERCHANT_ID") || null,
        baseUrl: paymentBaseUrl,
      }),
      fiscalization: Object.freeze({
        provider: "badi",
        mode: badiMode,
        baseUrl: badiBaseUrl,
        receiptPath: "/fiscalization/receipts",
        clientId: value(env, "BADI_CLIENT_ID") || null,
      }),
      email: Object.freeze({
        mode: emailMode,
        provider: value(env, "EMAIL_PROVIDER") || null,
        from: value(env, "EMAIL_FROM") || null,
      }),
      whatsapp: Object.freeze({
        mode: whatsappMode,
        provider: value(env, "WHATSAPP_PROVIDER") || null,
        senderId: value(env, "WHATSAPP_SENDER_ID") || null,
      }),
      analytics: Object.freeze({
        ga4MeasurementId: value(env, "NEXT_PUBLIC_GA4_MEASUREMENT_ID") || null,
        gtmContainerId: value(env, "NEXT_PUBLIC_GTM_CONTAINER_ID") || null,
        metaPixelId: value(env, "NEXT_PUBLIC_META_PIXEL_ID") || null,
        consentDefault: "denied",
      }),
    }),
  });
}

/** Returns status information that is safe to expose in an admin health view. */
export function publicIntegrationStatus(config) {
  return Object.freeze({
    appEnvironment: config.appEnvironment,
    payment: {
      provider: config.integrations.payment.provider,
      mode: config.integrations.payment.mode,
      configured: Boolean(config.integrations.payment.merchantId),
    },
    fiscalization: {
      provider: "badi",
      mode: config.integrations.fiscalization.mode,
      configured: config.integrations.fiscalization.mode === "mock" || Boolean(config.integrations.fiscalization.baseUrl),
    },
    email: {
      mode: config.integrations.email.mode,
      provider: config.integrations.email.provider,
    },
    whatsapp: {
      mode: config.integrations.whatsapp.mode,
      provider: config.integrations.whatsapp.provider,
    },
    analytics: {
      ga4: Boolean(config.integrations.analytics.ga4MeasurementId),
      gtm: Boolean(config.integrations.analytics.gtmContainerId),
      meta: Boolean(config.integrations.analytics.metaPixelId),
      consentDefault: config.integrations.analytics.consentDefault,
    },
  });
}

export const integrationConstants = Object.freeze({
  badiEndpoints: BADI_ENDPOINTS,
  paymentProviders: Object.freeze([...PAYMENT_PROVIDERS]),
});
