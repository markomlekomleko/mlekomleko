import { defineConfig } from "@playwright/test";

const chromium = process.env.CI
  ? { browserName: "chromium" as const }
  : { browserName: "chromium" as const, channel: "chrome" as const };
const e2eDatabaseUrl = `file:.data/e2e-${process.pid}.sqlite`;

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "line",
  use: {
    baseURL: "http://localhost:4173",
    actionTimeout: 15_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "sr-Latn-RS",
    timezoneId: "Europe/Belgrade",
  },
  webServer: {
    command: "node scripts/migrate.mjs --local && npm run dev -- --port 4173",
    env: {
      E2E_DIST_DIR: ".next-e2e",
      TURSO_DATABASE_URL: e2eDatabaseUrl,
      TURSO_AUTH_TOKEN: "",
      POSTGRES_URL: "",
      POSTGRES_PRISMA_URL: "",
      POSTGRES_URL_NON_POOLING: "",
      POSTGRES_SCHEMA: "",
      APP_ENV: "local",
      AUTH_MODE: "local",
      APP_ORIGIN: "http://localhost:4173",
      NEXT_PUBLIC_SITE_URL: "http://localhost:4173",
      ADMIN_EMAIL: "admin@example.test",
      ADMIN_PASSWORD: "e2e-admin-password",
      PAYMENT_WEBHOOK_SECRET: "e2e-webhook-secret",
      PAYMENT_PROVIDER: "disabled",
      PAYMENT_MODE: "disabled",
      BADI_MODE: "mock",
      EMAIL_MODE: "console",
      WHATSAPP_MODE: "queue",
      ALLOW_PRODUCTION_INTEGRATIONS: "false",
      GA4_API_SECRET: "",
      GA4_MEASUREMENT_ID: "",
      NEXT_PUBLIC_GA4_MEASUREMENT_ID: "",
      NEXT_PUBLIC_GTM_CONTAINER_ID: "",
      NEXT_PUBLIC_META_PIXEL_ID: "",
      META_CONVERSIONS_ACCESS_TOKEN: "",
      NEXT_PUBLIC_GOOGLE_ADS_ID: "",
    },
    url: "http://localhost:4173",
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
  projects: [
    { name: "mobile-390", use: { ...chromium, viewport: { width: 390, height: 844 }, extraHTTPHeaders: { "cf-connecting-ip": "192.0.2.10" } } },
    { name: "tablet-768", use: { ...chromium, viewport: { width: 768, height: 1024 }, extraHTTPHeaders: { "cf-connecting-ip": "192.0.2.11" } } },
    { name: "desktop-1440", use: { ...chromium, viewport: { width: 1440, height: 1000 }, extraHTTPHeaders: { "cf-connecting-ip": "192.0.2.12" } } },
  ],
});
