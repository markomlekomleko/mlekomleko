import assert from 'node:assert/strict';
import { test } from 'node:test';
import '../scripts/lib/domain-loader.mjs';

const { env } = await import('../server/runtime.ts');
const { demoLoginAvailable, loginDemoCustomer, getDemoAccount } = await import('../server/demo-account.ts');
const { sessionCookie } = await import('../server/auth.ts');

test('demo can be disabled before any database access, including in production', async () => {
  env.APP_ENV = 'production';
  env.APP_ORIGIN = 'https://shop.example.test';
  env.DEMO_LOGIN_ENABLED = 'false';
  assert.equal(demoLoginAvailable(), false);
  await assert.rejects(loginDemoCustomer(new Request(env.APP_ORIGIN + '/api/auth/demo', { method: 'POST', headers: { origin: env.APP_ORIGIN } })), error => error.code === 'DEMO_UNAVAILABLE' && error.status === 404);
  delete env.DEMO_LOGIN_ENABLED;
  assert.equal(demoLoginAvailable(), true);
});

test('demo HTTPS sessions use host-only secure cookies and sample history is in the past', () => {
  const cookie = sessionCookie(new Request('https://shop.example.test/api/auth/demo'), 'a'.repeat(43), new Date(Date.now() + 3_600_000).toISOString());
  assert.match(cookie, /^__Host-mm_session=/);
  assert.match(cookie, /; Path=\/; HttpOnly; SameSite=Lax;/);
  assert.match(cookie, /; Secure$/);
  assert.ok(!cookie.includes('Domain='));
  const account = getDemoAccount();
  assert.ok(account.deliveryHistory.every(delivery => delivery.date < account.currentDate));
  assert.equal(account.customer.email, 'demo@example.invalid');
});
