import assert from "node:assert/strict";
import test from "node:test";

import {
  IntegrationConfigError,
  integrationConstants,
  publicIntegrationStatus,
  readIntegrationConfig,
} from "../integrations/config.mjs";
import {
  assertOutboxMessage,
  assertPaymentChargeRequest,
  integrationResult,
} from "../integrations/contracts.mjs";
import {
  buildSpokeCsv,
  neutralizeSpreadsheetFormula,
} from "../integrations/spoke-csv.mjs";
import {
  buildAnalyticsEvent,
  canDispatchTo,
  captureAttribution,
  normalizeConsent,
} from "../integrations/attribution.mjs";

test("integration config is local-safe and public status contains no secrets", () => {
  const config = readIntegrationConfig({ APP_ENV: "test" });
  assert.equal(config.integrations.payment.provider, "disabled");
  assert.equal(config.integrations.payment.mode, "disabled");
  assert.equal(config.integrations.fiscalization.mode, "mock");
  assert.equal(config.integrations.email.mode, "console");
  assert.equal(config.integrations.analytics.consentDefault, "denied");

  const status = publicIntegrationStatus(config);
  assert.deepEqual(status.payment, {
    provider: "disabled",
    mode: "disabled",
    configured: false,
  });
  assert.doesNotMatch(JSON.stringify(status), /secret|apiKey|webhook/i);
});

test("payment provider is explicit and production needs a dual latch", () => {
  assert.throws(
    () =>
      readIntegrationConfig({
        PAYMENT_PROVIDER: "otp/raiaccept",
        PAYMENT_MODE: "sandbox",
      }),
    IntegrationConfigError,
  );
  assert.throws(
    () =>
      readIntegrationConfig({
        PAYMENT_PROVIDER: "otp",
        PAYMENT_MODE: "production",
        PAYMENT_MERCHANT_ID: "merchant_test",
        PAYMENT_BASE_URL: "https://payments.example.test",
        PAYMENT_API_SECRET: "not-a-real-secret",
        PAYMENT_WEBHOOK_SECRET: "not-a-real-webhook-secret",
      }),
    /ALLOW_PRODUCTION_INTEGRATIONS/,
  );
});

test("remote integrations require HTTPS while local Badi is loopback-only", () => {
  assert.throws(
    () =>
      readIntegrationConfig({
        PAYMENT_PROVIDER: "otp",
        PAYMENT_MODE: "sandbox",
        PAYMENT_MERCHANT_ID: "merchant_test",
        PAYMENT_BASE_URL: "http://payments.example.test",
        PAYMENT_API_SECRET: "not-a-real-secret",
        PAYMENT_WEBHOOK_SECRET: "not-a-real-webhook-secret",
      }),
    /HTTPS/,
  );
  assert.throws(
    () =>
      readIntegrationConfig({
        BADI_MODE: "local",
        BADI_LOCAL_BASE_URL: "http://192.168.1.50:9999",
      }),
    /loopback/,
  );

  const local = readIntegrationConfig({
    BADI_MODE: "local",
    BADI_LOCAL_BASE_URL: "http://127.0.0.1:9999",
  });
  assert.equal(
    local.integrations.fiscalization.baseUrl,
    "http://127.0.0.1:9999",
  );
  assert.equal(
    integrationConstants.badiEndpoints.sandbox,
    "https://api.sandbox.badi.rs/v2",
  );
});

test("payment contract accepts provider tokens and rejects raw card data", () => {
  const request = {
    operationId: "bill_2026_08_sub_1",
    orderId: "order_1",
    amountMinor: 129900,
    currency: "RSD",
    kind: "recurring",
    paymentMethodToken: "provider-token-reference",
  };
  assert.equal(assertPaymentChargeRequest(request), request);
  assert.throws(
    () => assertPaymentChargeRequest({ ...request, cvv: "123" }),
    /must never enter the application/,
  );
  assert.throws(
    () => assertPaymentChargeRequest({ ...request, amountMinor: 1299.5 }),
    /positive safe integer/,
  );
});

test("outbox and integration result contracts preserve idempotency metadata", () => {
  const message = {
    idempotencyKey: "order_1:created:email:v1",
    aggregateId: "order_1",
    eventType: "order.created",
    channel: "email",
    payload: { templateVersion: 1 },
  };
  assert.equal(assertOutboxMessage(message), message);
  assert.throws(
    () => assertOutboxMessage({ ...message, eventType: "unknown.event" }),
    /Unsupported eventType/,
  );

  const result = integrationResult({
    provider: "local",
    externalId: "msg_1",
    status: "accepted",
    idempotencyKey: message.idempotencyKey,
    occurredAt: "2026-08-28T10:00:00.000Z",
  });
  assert.equal(result.idempotencyKey, message.idempotencyKey);
  assert.ok(Object.isFrozen(result));
});

test("Spoke CSV is deterministic, UTF-8 friendly and formula-safe", () => {
  const orders = [
    {
      orderId: "ORD-001",
      customer: {
        fullName: "Željko Petrović",
        phone: "+381601234567",
        email: "zeljko@example.com",
      },
      deliveryAddress: {
        line1: "Bulevar oslobođenja 10",
        line2: "Stan 4",
        city: "Beograd",
        postalCode: "11000",
      },
      note: '=HYPERLINK("https://attacker.invalid","klik")',
      items: [
        { name: "Kravlje mleko", quantity: 3, unit: "L" },
        { name: 'Sir, "mladi"', quantity: 1, unit: "kom" },
      ],
    },
  ];
  const csv = buildSpokeCsv(orders);
  assert.ok(csv.startsWith("\uFEFF"));
  assert.match(csv, /"Address Line 1"/);
  assert.match(csv, /Željko Petrović/);
  assert.match(csv, /3 x Kravlje mleko \(L\); 1 x Sir, ""mladi"" \(kom\)/);
  assert.match(csv, /"'=HYPERLINK\(""https:\/\/attacker\.invalid/);
  assert.ok(csv.endsWith("\r\n"));
  assert.equal(csv, buildSpokeCsv(orders));
  assert.equal(neutralizeSpreadsheetFormula("  -2+3"), "'  -2+3");
});

test("Spoke CSV rejects incomplete stops instead of exporting broken routes", () => {
  assert.throws(
    () =>
      buildSpokeCsv([
        {
          orderId: "ORD-002",
          customer: { fullName: "Test", phone: "+381600000", email: "a@example.com" },
          deliveryAddress: { line1: "" },
          items: [{ name: "Mleko", quantity: 1 }],
        },
      ]),
    /deliveryAddress\.line1 is required/,
  );
});

test("attribution keeps first touch and updates last touch", () => {
  const first = captureAttribution({
    landingUrl: "/prodavnica?utm_source=instagram&utm_medium=social&utm_campaign=leto",
    now: "2026-08-01T10:00:00.000Z",
  });
  const second = captureAttribution({
    landingUrl: "/checkout?gclid=abc123",
    previous: first,
    now: "2026-08-10T10:00:00.000Z",
  });
  assert.equal(second.firstTouch.source, "instagram");
  assert.equal(second.firstTouch.campaign, "leto");
  assert.equal(second.lastTouch.source, "google");
  assert.equal(second.lastTouch.medium, "cpc");
  assert.equal(second.lastTouch.parameters.gclid, "abc123");
});

test("analytics stays denied by default and recursively removes PII", () => {
  assert.deepEqual(normalizeConsent(), {
    necessary: true,
    analytics: false,
    marketing: false,
  });
  assert.equal(canDispatchTo("necessary", {}), true);
  assert.equal(canDispatchTo("ga4", {}), false);
  assert.equal(canDispatchTo("meta", { analytics: true }), false);
  assert.equal(buildAnalyticsEvent("purchase", { value: 1200 }, {}), null);

  const event = buildAnalyticsEvent(
    "purchase",
    {
      transaction_id: "ORD-001",
      value: 1200,
      currency: "RSD",
      email: "do-not-send@example.com",
      customer: { phone: "+381600000", segment: "weekly" },
      items: [{ item_id: "milk-1", item_name: "Mleko" }],
    },
    { analytics: true },
  );
  assert.equal(event.name, "purchase");
  assert.equal(event.payload.email, undefined);
  assert.equal(event.payload.customer.phone, undefined);
  assert.equal(event.payload.customer.segment, "weekly");
  assert.equal(event.payload.transaction_id, "ORD-001");
  assert.equal(event.payload.items[0].item_name, "Mleko");
});

test("attribution never persists arbitrary query parameters", () => {
  const attribution = captureAttribution({
    landingUrl:
      "/checkout?email=private%40example.com&utm_source=newsletter&utm_content=cta",
  });
  assert.equal(attribution.lastTouch.landingPath, "/checkout");
  assert.equal(attribution.lastTouch.parameters.utm_source, "newsletter");
  assert.equal(attribution.lastTouch.parameters.email, undefined);
  assert.doesNotMatch(JSON.stringify(attribution), /private@example\.com/);
});
