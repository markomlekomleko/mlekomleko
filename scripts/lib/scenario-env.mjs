import { resolve } from 'node:path';
export function scenarioEnvironment(databasePath, port = 4191) {
  const result = { ...process.env };
  // No remote database, provider secret or analytics credential may enter this process.
  for (const key of Object.keys(result)) if (/^(POSTGRES_|TURSO_|VERCEL|FISCOMM_|BADI_|EMAIL_|WHATSAPP_|SMS_|INFOBIP_|RESEND_|PAYMENT_|META_|GA4_|GOOGLE_ADS_|NEXT_PUBLIC_(GA4|GTM|META|GOOGLE_ADS))/.test(key)) result[key] = '';
  return { ...result, APP_ENV: 'local', DATABASE_URL: `file:${resolve(databasePath)}`, TURSO_DATABASE_URL: `file:${resolve(databasePath)}`, APP_ORIGIN: `http://localhost:${port}`, NEXT_PUBLIC_SITE_URL: `http://localhost:${port}`, ALLOW_PRODUCTION_INTEGRATIONS: 'false', FISCAL_PROVIDER: 'fiscomm', FISCOMM_MODE: 'disabled', BADI_MODE: 'disabled', PAYMENT_PROVIDER: 'disabled', PAYMENT_MODE: 'disabled', EMAIL_MODE: 'console', WHATSAPP_MODE: 'disabled', SMS_MODE: 'disabled', AUTH_MODE: 'local', ADMIN_EMAIL: 'test-admin@example.invalid', ADMIN_PASSWORD: 'Test-scenariji-2026', E2E_DIST_DIR: '.next-admin-scenarios' };
}
