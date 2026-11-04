// QA-critical authentication / authorization suite (Agent F).
// Run: node --test tests/qa-auth.test.mjs   (needs dist/ from `npm run build:worker`)
import assert from 'node:assert/strict';
import { afterEach, beforeEach, test } from 'node:test';
import {
  TEST_CUSTOMER, advance, call, checkout, checkoutBody, count, database, env, expectError, expectStatus, hash, line, rows, setup, sql, teardown, instant,
} from './qa-harness.mjs';

beforeEach(() => setup());
afterEach(() => teardown());

const EMAIL = 'test-f-auth@example.test';
const register = (email = EMAIL, options = {}) => call('/api/auth/register', { body: { email }, ...options });
const verify = (challenge, code = challenge.localDevelopment?.code, options = {}) => call('/api/auth/code/verify', { body: { challengeId: challenge.challengeId, code }, ...options });
const wrongCode = (code) => (code === '000000' ? '111111' : '000000');
const cookieOf = (response) => response.headers.get('set-cookie').split(';')[0];
async function signedIn(email = EMAIL) {
  const challenge = expectStatus(await register(email), 202);
  const verified = await verify(challenge);
  expectStatus(verified);
  return { cookie: cookieOf(verified), response: verified, challenge };
}

// ---------- A. customer sessions ---------------------------------------------
test('F-A01 passwordless register -> verify -> session: cookie flags, 30-day expiry, only hashes stored', async () => {
  const challenge = expectStatus(await register(), 202);
  assert.match(challenge.challengeId, /^[A-Za-z0-9_-]{43}$/);
  assert.match(challenge.localDevelopment.code, /^\d{6}$/);
  assert.equal(count('customers'), 0, 'no customer before the email is proven');
  assert.equal(count('auth_tokens'), 0);
  const pending = sql('SELECT * FROM auth_challenges');
  assert.notEqual(pending.code_hash, challenge.localDevelopment.code, 'the code is stored only as an HMAC');
  assert.match(pending.password_hash, /^passwordless:/);
  const verified = await verify(challenge);
  expectStatus(verified);
  const header = verified.headers.get('set-cookie');
  assert.match(header, /^mm_session=[A-Za-z0-9_%-]{40,}/);
  assert.match(header, /HttpOnly/);
  assert.match(header, /SameSite=Lax/);
  assert.match(header, /Path=\//);
  assert.doesNotMatch(header, /Secure/, 'plain-http localhost cookie is not Secure');
  const token = decodeURIComponent(header.split(';')[0].slice('mm_session='.length));
  const session = sql("SELECT * FROM auth_tokens WHERE kind='session'");
  assert.equal(session.token_hash, hash(token), 'only the SHA-256 of the session token is stored');
  assert.notEqual(session.token_hash, token);
  assert.equal(Date.parse(session.expires_at) - instant, 30 * 86_400_000);
  assert.equal(session.email, EMAIL);
  assert.equal(count('customers', 'email=?', EMAIL), 1);
  assert.equal(sql('SELECT email_verified_at v FROM customer_credentials').v !== null, true);
  assert.equal(sql('SELECT used_at u FROM auth_challenges').u !== null, true);
  const account = expectStatus(await call('/api/account', { cookie: cookieOf(verified) }));
  assert.equal(account.customer.email, EMAIL);
  assert.equal(JSON.stringify(account).includes(token), false, 'the session token is never echoed back');
});

test('F-A02 wrong-code boundary: 4 wrong + correct succeeds; a locked challenge rejects even the correct code and creates nothing', async () => {
  const ok = expectStatus(await register('test-f-a02-ok@example.test'), 202);
  for (let index = 0; index < 4; index += 1) expectError(await verify(ok, wrongCode(ok.localDevelopment.code)), 401, 'INVALID_CODE');
  assert.equal(sql('SELECT attempts a FROM auth_challenges WHERE email=?', 'test-f-a02-ok@example.test').a, 4);
  expectStatus(await verify(ok));
  assert.equal(count('auth_tokens', "kind='session'"), 1);

  const locked = expectStatus(await register('test-f-a02-locked@example.test'), 202);
  for (let index = 0; index < 5; index += 1) expectError(await verify(locked, wrongCode(locked.localDevelopment.code)), 401, 'INVALID_CODE');
  expectError(await verify(locked), 401, 'INVALID_CODE');
  expectError(await verify(locked), 401, 'INVALID_CODE');
  assert.equal(sql('SELECT attempts a FROM auth_challenges WHERE email=?', 'test-f-a02-locked@example.test').a, 5, 'attempts stop counting once locked');
  assert.equal(sql('SELECT used_at u FROM auth_challenges WHERE email=?', 'test-f-a02-locked@example.test').u, null);
  assert.equal(count('customers', 'email=?', 'test-f-a02-locked@example.test'), 0);
  assert.equal(count('auth_tokens', "kind='session'"), 1);
});

test('F-A03 challenge expiry is exact: valid up to 1 ms before 5 minutes, dead at 5:00.000', async () => {
  const early = expectStatus(await register('test-f-a03-early@example.test'), 202);
  const late = expectStatus(await register('test-f-a03-late@example.test'), 202);
  assert.equal(Date.parse(early.expiresAt) - instant, 300_000);
  advance(299_999);
  expectStatus(await verify(early));
  advance(1);
  expectError(await verify(late), 401, 'INVALID_CODE');
  assert.equal(count('customers', 'email=?', 'test-f-a03-late@example.test'), 0);
  assert.equal(count('auth_tokens', "kind='session'"), 1);
});

test('F-A04 a code is bound to its own challenge and cannot be replayed after use; malformed input is a 422', async () => {
  const first = expectStatus(await register('test-f-a04-a@example.test'), 202);
  const other = expectStatus(await register('test-f-a04-b@example.test'), 202);
  const borrowed = first.localDevelopment.code === other.localDevelopment.code ? wrongCode(first.localDevelopment.code) : first.localDevelopment.code;
  expectError(await verify(other, borrowed), 401, 'INVALID_CODE');
  expectStatus(await verify(first));
  expectError(await verify(first), 401, 'INVALID_CODE');
  expectError(await verify(first), 401, 'INVALID_CODE');
  assert.equal(count('auth_tokens', "kind='session'"), 1);
  for (const body of [{ challengeId: first.challengeId, code: '12345' }, { challengeId: first.challengeId, code: '1234567' }, { challengeId: first.challengeId, code: 'abcdef' }, { challengeId: first.challengeId, code: 123456 }, { challengeId: 'short', code: '123456' }, { challengeId: first.challengeId }, {}]) {
    expectError(await call('/api/auth/code/verify', { body }), 422, 'INVALID_CODE');
  }
});

test('F-A05 requesting a code for an unknown account looks identical to a known one (no enumeration) and stores no challenge', async () => {
  await signedIn('test-f-known@example.test');
  advance(61_000);
  const known = expectStatus(await call('/api/auth/code', { body: { email: 'test-f-known@example.test', channel: 'email' } }), 202);
  const unknown = expectStatus(await call('/api/auth/code', { body: { email: 'test-f-unknown@example.test', channel: 'email' } }), 202);
  assert.deepEqual(Object.keys(unknown).filter((key) => key !== 'localDevelopment').sort(), Object.keys(known).filter((key) => key !== 'localDevelopment').sort());
  assert.match(unknown.challengeId, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(unknown.localDevelopment, undefined);
  assert.equal(count('auth_challenges', 'email=?', 'test-f-unknown@example.test'), 0);
  expectError(await verify(unknown, '123456'), 401, 'INVALID_CODE');
  assert.equal(count('customers', 'email=?', 'test-f-unknown@example.test'), 0);
});

test('F-A06 per-recipient cooldown (1/min) and hourly cap (6) hold across different IP addresses', async () => {
  expectStatus(await register(EMAIL, { ip: '203.0.113.1' }), 202);
  expectError(await call('/api/auth/code', { body: { email: EMAIL }, ip: '203.0.113.2' }), 429, 'RATE_LIMITED');
  for (let index = 0; index < 5; index += 1) {
    advance(61_000);
    expectStatus(await call('/api/auth/code', { body: { email: EMAIL }, ip: `203.0.113.${10 + index}` }), 202);
  }
  advance(61_000);
  expectError(await call('/api/auth/code', { body: { email: EMAIL }, ip: '203.0.113.99' }), 429, 'RATE_LIMITED');
  assert.ok(Number(sql("SELECT COUNT(*) n FROM auth_challenges").n) <= 6);
});

test('F-A07 logout revokes the server-side session; a foreign or missing Origin cannot log out; logout without a cookie is harmless', async () => {
  const { cookie } = await signedIn();
  expectError(await call('/api/auth/logout', { body: {}, cookie, origin: 'https://evil.example' }), 403, 'CSRF_REJECTED');
  expectError(await call('/api/auth/logout', { body: {}, cookie, origin: null }), 403, 'CSRF_REJECTED');
  expectStatus(await call('/api/account', { cookie }));
  const out = expectStatus(await call('/api/auth/logout', { body: {}, cookie }));
  assert.equal(out.loggedOut, true);
  const cleared = out && (await call('/api/auth/logout', { body: {}, cookie })).headers.get('set-cookie');
  assert.match(cleared, /Max-Age=0/);
  expectError(await call('/api/account', { cookie }), 401, 'INVALID_SESSION');
  assert.notEqual(sql("SELECT used_at u FROM auth_tokens WHERE kind='session'").u, null);
  expectStatus(await call('/api/auth/logout', { body: {} }));
  // The revoked token cannot be revived by presenting the same cookie to a mutation either.
  expectError(await call('/api/account', { method: 'PATCH', body: { phone: '+381611111111' }, cookie }), 401, 'INVALID_SESSION');
});

test('F-A08 expired and invalid session cookies are rejected: expires_at in the past, unknown token, short token, no cookie', async () => {
  const { cookie } = await signedIn();
  expectStatus(await call('/api/account', { cookie }));
  database.raw.exec("UPDATE auth_tokens SET expires_at='2026-12-30T09:59:59.999Z' WHERE kind='session'");
  expectError(await call('/api/account', { cookie }), 401, 'INVALID_SESSION');
  database.raw.exec("UPDATE auth_tokens SET expires_at='2026-12-30T10:00:00.000Z' WHERE kind='session'");
  expectError(await call('/api/account', { cookie }), 401, 'INVALID_SESSION');
  database.raw.exec("UPDATE auth_tokens SET expires_at='2026-12-30T10:00:00.001Z' WHERE kind='session'");
  expectStatus(await call('/api/account', { cookie }));
  expectError(await call('/api/account', { cookie: 'mm_session=' + 'A'.repeat(43) }), 401, 'INVALID_SESSION');
  expectError(await call('/api/account', { cookie: 'mm_session=short' }), 401, 'AUTH_REQUIRED');
  expectError(await call('/api/account', { cookie: 'mm_session=' }), 401, 'AUTH_REQUIRED');
  expectError(await call('/api/account', {}), 401, 'AUTH_REQUIRED');
  expectError(await call('/api/account', { cookie: 'mm_session=' + 'A'.repeat(201) }), 401, 'AUTH_REQUIRED');
  // A real expired session also blocks mutations.
  database.raw.exec("UPDATE auth_tokens SET expires_at='2020-01-01T00:00:00.000Z' WHERE kind='session'");
  expectError(await call('/api/account', { method: 'PATCH', body: { phone: '+381611111111' }, cookie }), 401, 'INVALID_SESSION');
  assert.notEqual(sql('SELECT phone p FROM customers').p, '+381611111111');
});

test('F-A09 a session token is not accepted as the admin Bearer, and a magic-link row is not a session', async () => {
  const { cookie } = await signedIn();
  const token = decodeURIComponent(cookie.slice('mm_session='.length));
  env.ADMIN_EMAIL = 'test-f-owner@example.test'; env.ADMIN_PASSWORD = 'test-f-owner-password'; delete env.ADMIN_LEGACY_ACCESS;
  expectError(await call('/api/admin/orders', { bearer: token }), 403, 'ADMIN_FORBIDDEN');
  const customerId = sql('SELECT id FROM customers').id;
  database.raw.prepare("INSERT INTO auth_tokens(id,customer_id,email,token_hash,kind,expires_at) VALUES('f-ml',?,?,?, 'magic_link','2030-01-01T00:00:00Z')").run(customerId, EMAIL, hash('m'.repeat(43)));
  expectError(await call('/api/account', { cookie: 'mm_session=' + 'm'.repeat(43) }), 401, 'INVALID_SESSION');
});

// ---------- demo session -----------------------------------------------------
test('F-A10 demo session is strictly read-only: GET works, every mutation (profile, refund, subscription, order, checkout) is 403 DEMO_READ_ONLY', async () => {
  expectError(await call('/api/auth/demo', { method: 'POST', body: {}, origin: null }), 403, 'CSRF_REJECTED');
  expectError(await call('/api/auth/demo', { method: 'POST', body: {}, origin: 'https://evil.example' }), 403, 'CSRF_REJECTED');
  const login = await call('/api/auth/demo', { method: 'POST', body: {} });
  expectStatus(login);
  assert.equal(login.body.demo, true);
  assert.match(login.headers.get('set-cookie'), /HttpOnly/);
  const cookie = cookieOf(login);
  const account = expectStatus(await call('/api/account', { cookie }));
  assert.equal(account.demo, true);
  assert.equal(expectStatus(await call('/api/account/login-settings', { cookie })).email, 'demo@example.invalid');
  const ordersBefore = count('orders');
  const attempts = [
    ['/api/account', 'PATCH', { phone: '+381611111111' }],
    ['/api/account/subscriptions/demo-subscription', 'PATCH', { action: 'cancel', expectedVersion: 1 }],
    ['/api/account/orders/ord_demo', 'PATCH', { action: 'cancel' }],
    ['/api/account/refunds', 'POST', { orderId: 'ord_demo', reason: 'TEST-F' }],
    ['/api/account/login-settings', 'PATCH', { action: 'disconnect' }],
    ['/api/account/whatsapp', 'POST', { phone: '+381601234567', consent: true }],
  ];
  for (const [path, method, body] of attempts) expectError(await call(path, { method, body, cookie }), 403, 'DEMO_READ_ONLY');
  expectError(await call('/api/checkout', { body: checkoutBody([line()], { customer: { ...TEST_CUSTOMER } }), cookie }), 403, 'DEMO_READ_ONLY');
  assert.equal(count('orders'), ordersBefore, 'demo can create no orders');
  assert.equal(count('customers', "email<>'demo@example.invalid'"), 0);
  assert.equal(count('outbox'), 0, 'demo mutations enqueue nothing');
  // Session lifetime: 8 hours, and the kill switch invalidates live demo sessions.
  assert.equal(Date.parse(sql("SELECT expires_at e FROM auth_tokens WHERE customer_id='mm-public-demo-customer'").e) - instant, 8 * 3_600_000);
  env.DEMO_LOGIN_ENABLED = 'false';
  expectError(await call('/api/account', { cookie }), 401, 'INVALID_SESSION');
  expectError(await call('/api/auth/demo', { method: 'POST', body: {} }), 404, 'DEMO_UNAVAILABLE');
});

// ---------- CSRF ----------------------------------------------------------------
test('F-A11 every cookie-authenticated or session-minting mutation rejects a foreign, missing or look-alike Origin with CSRF_REJECTED', async () => {
  const { cookie } = await signedIn();
  await checkout([line()], { customer: { ...TEST_CUSTOMER, email: EMAIL } });
  const order = sql('SELECT id FROM orders');
  const mutations = [
    ['/api/account', 'PATCH', { phone: '+381611111111' }],
    ['/api/account/orders/' + order.id, 'PATCH', { action: 'cancel' }],
    ['/api/account/subscriptions/sub_x', 'PATCH', { action: 'pause', expectedVersion: 1 }],
    ['/api/account/refunds', 'POST', { orderId: order.id }],
    ['/api/account/login-settings', 'PATCH', { action: 'disconnect' }],
    ['/api/account/whatsapp', 'POST', { phone: '+381601234567', consent: true }],
    ['/api/auth/register', 'POST', { email: 'test-f-csrf@example.test' }],
    ['/api/auth/code', 'POST', { email: EMAIL, channel: 'email' }],
    ['/api/auth/code/verify', 'POST', { challengeId: 'a'.repeat(43), code: '123456' }],
    ['/api/auth/logout', 'POST', {}],
    ['/api/auth/demo', 'POST', {}],
  ];
  const origins = ['https://evil.example', 'http://localhost:3000', 'https://localhost', 'http://localhost.evil.example', 'null', null];
  const snapshot = JSON.stringify([rows('SELECT * FROM customers'), rows('SELECT id,used_at FROM auth_tokens'), count('auth_challenges'), rows('SELECT id,fulfillment_status,customer_note FROM orders')]);
  for (const [path, method, body] of mutations) {
    for (const origin of origins) {
      const result = await call(path, { method, body, cookie, origin, ip: '203.0.113.7' });
      assert.equal(result.status, 403, `${method} ${path} origin=${origin} -> ${result.status} ${JSON.stringify(result.body)}`);
      assert.equal(result.code, 'CSRF_REJECTED', `${method} ${path} origin=${origin}`);
    }
  }
  assert.equal(JSON.stringify([rows('SELECT * FROM customers'), rows('SELECT id,used_at FROM auth_tokens'), count('auth_challenges'), rows('SELECT id,fulfillment_status,customer_note FROM orders')]), snapshot, 'no state changed');
  // Reads are not Origin-bound; the genuine origin still works.
  expectStatus(await call('/api/account', { cookie, origin: 'https://evil.example' }));
  const profile = { fullName: 'TEST-F Kupac', phone: '+381611111111', addressLine1: 'TEST-F 1', city: 'Beograd', postalCode: '11000' };
  expectStatus(await call('/api/account', { method: 'PATCH', body: profile, cookie }));
  assert.equal(sql('SELECT phone p FROM customers').p, '+381611111111');
});

test('F-A12 the retired magic-link endpoint answers 410-class refusal in code mode and mints nothing', async () => {
  const response = await call('/api/auth/magic-link', { body: { email: EMAIL } });
  assert.equal(response.status, 410, JSON.stringify(response.body));
  assert.equal(count('auth_tokens'), 0);
  assert.equal(count('outbox'), 0);
  assert.equal(count('customers'), 0);
  const second = await call('/api/auth/magic-link', { body: { email: EMAIL } });
  assert.equal(second.status, 410);
});

// ---------- B. admin authentication ------------------------------------------
const ADMIN = { email: 'test-f-owner@example.test', password: 'test-f-owner-password-2026' };
function realAdmin() {
  Object.assign(env, { ADMIN_EMAIL: ADMIN.email, ADMIN_PASSWORD: ADMIN.password });
  delete env.ADMIN_LEGACY_ACCESS; delete env.ADMIN_SECRET;
}
const adminLogin = (body = ADMIN, options = {}) => call('/api/admin/access', { body, ...options });
async function ownerToken() { return expectStatus(await adminLogin()).sessionToken; }
async function staffLogin(owner, { email, role, password = 'test-f-staff-password-1' }) {
  const created = expectStatus(await call('/api/admin/staff', { bearer: owner, body: { email, fullName: `TEST-F ${role}`, role, password } })).staff;
  const session = expectStatus(await adminLogin({ email, password }));
  assert.equal(session.role, role);
  return { id: created.id, token: session.sessionToken, email, password };
}

test('F-A13 admin login: wrong password / unknown user / missing Origin refused; success returns an 8h bearer; only its hash is stored', async () => {
  realAdmin();
  expectError(await adminLogin({ email: ADMIN.email, password: 'wrong-password-123' }), 403, 'ADMIN_FORBIDDEN');
  expectError(await adminLogin({ email: 'nobody@example.test', password: ADMIN.password }), 403, 'ADMIN_FORBIDDEN');
  expectError(await adminLogin({ email: ADMIN.email }), 403, 'ADMIN_FORBIDDEN');
  expectError(await adminLogin({ email: ADMIN.email, password: ADMIN.password }, { origin: null }), 403, 'CSRF_REJECTED');
  expectError(await adminLogin({ email: ADMIN.email, password: ADMIN.password }, { origin: 'https://evil.example' }), 403, 'CSRF_REJECTED');
  assert.equal(count('admin_sessions'), 0);
  const login = expectStatus(await adminLogin({ email: ADMIN.email.toUpperCase(), password: ADMIN.password }));
  assert.equal(login.authenticated, true);
  assert.equal(login.role, 'owner');
  assert.match(login.sessionToken, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(Date.parse(login.expiresAt) - instant, 8 * 3_600_000);
  const stored = sql('SELECT * FROM admin_sessions');
  assert.equal(stored.token_hash, hash(login.sessionToken));
  assert.equal(JSON.stringify(stored).includes(login.sessionToken), false);
  const probe = expectStatus(await call('/api/admin/access', { bearer: login.sessionToken }));
  assert.deepEqual([probe.authenticated, probe.role], [true, 'owner']);
  assert.equal(expectStatus(await call('/api/admin/access')).authenticated, false);
});

test('F-A14 admin login throttle: 10 attempts per IP per 15 minutes, 11th is 429 even with the right password; other IPs and the next window are fine', async () => {
  realAdmin();
  for (let index = 0; index < 10; index += 1) expectError(await adminLogin({ email: ADMIN.email, password: `wrong-password-${index}` }, { ip: '198.51.100.61' }), 403, 'ADMIN_FORBIDDEN');
  const limited = await adminLogin(ADMIN, { ip: '198.51.100.61' });
  expectError(limited, 429, 'RATE_LIMITED');
  assert.ok(limited.body.error.details.retryAfter >= 1 && limited.body.error.details.retryAfter <= 900);
  assert.equal(count('admin_sessions'), 0, 'the throttled attempt must not mint a session');
  expectStatus(await adminLogin(ADMIN, { ip: '198.51.100.62' }));
  advance(15 * 60_000 + 1000);
  expectStatus(await adminLogin(ADMIN, { ip: '198.51.100.61' }));
});

test('F-A15 DELETE /api/admin/access revokes the bearer token immediately; repeated or tokenless DELETE is harmless', async () => {
  realAdmin();
  const token = await ownerToken();
  expectStatus(await call('/api/admin/orders', { bearer: token }));
  const out = expectStatus(await call('/api/admin/access', { method: 'DELETE', bearer: token }));
  assert.equal(out.authenticated, false);
  assert.notEqual(sql('SELECT revoked_at r FROM admin_sessions').r, null);
  expectError(await call('/api/admin/orders', { bearer: token }), 403, 'ADMIN_FORBIDDEN');
  expectError(await call('/api/admin/access', { bearer: token }), 403, 'ADMIN_FORBIDDEN');
  expectStatus(await call('/api/admin/access', { method: 'DELETE', bearer: token }));
  expectStatus(await call('/api/admin/access', { method: 'DELETE' }));
  const other = await ownerToken();
  expectStatus(await call('/api/admin/orders', { bearer: other }));
});

test('F-A16 admin session validity: expires_at in the past, revoked, malformed bearer, rotated ADMIN_PASSWORD, and ignored legacy secret', async () => {
  realAdmin();
  const token = await ownerToken();
  database.raw.exec("UPDATE admin_sessions SET expires_at='2026-12-30T09:59:59.999Z'");
  expectError(await call('/api/admin/orders', { bearer: token }), 403, 'ADMIN_FORBIDDEN');
  database.raw.exec("UPDATE admin_sessions SET expires_at='2026-12-30T10:00:00.001Z'");
  expectStatus(await call('/api/admin/orders', { bearer: token }));
  advance(2);
  expectError(await call('/api/admin/orders', { bearer: token }), 403, 'ADMIN_FORBIDDEN');
  database.raw.exec("UPDATE admin_sessions SET expires_at='2030-01-01T00:00:00.000Z'");
  expectStatus(await call('/api/admin/orders', { bearer: token }));
  for (const bad of ['', 'short', 'A'.repeat(42), 'A'.repeat(44), 'A'.repeat(43)]) expectError(await call('/api/admin/orders', { headers: bad ? { Authorization: `Bearer ${bad}` } : {} }), 403, 'ADMIN_FORBIDDEN');
  expectError(await call('/api/admin/orders', { headers: { Authorization: `Basic ${token}` } }), 403, 'ADMIN_FORBIDDEN');
  // With real credentials configured the legacy shared secret must be dead, even if the flag is still set.
  env.ADMIN_LEGACY_ACCESS = 'true'; env.ADMIN_SECRET = 'test-f-legacy-secret';
  expectError(await call('/api/admin/orders', { headers: { 'x-admin-secret': 'test-f-legacy-secret' } }), 403, 'ADMIN_FORBIDDEN');
  // Rotating the configured password invalidates sessions minted under the old one.
  env.ADMIN_PASSWORD = 'test-f-rotated-password-2027';
  expectError(await call('/api/admin/orders', { bearer: token }), 403, 'ADMIN_FORBIDDEN');
  expectError(await adminLogin(ADMIN), 403, 'ADMIN_FORBIDDEN');
  expectStatus(await adminLogin({ email: ADMIN.email, password: env.ADMIN_PASSWORD }));
});

test('F-A17 admin is refused (503) when credentials are not configured or shorter than 10 characters', async () => {
  Object.assign(env, { ADMIN_EMAIL: ADMIN.email, ADMIN_PASSWORD: 'short' }); delete env.ADMIN_LEGACY_ACCESS;
  expectError(await adminLogin({ email: ADMIN.email, password: 'short' }), 503, 'ADMIN_NOT_CONFIGURED');
  delete env.ADMIN_EMAIL; delete env.ADMIN_PASSWORD;
  expectError(await call('/api/admin/orders', { bearer: 'A'.repeat(43) }), 503, 'ADMIN_NOT_CONFIGURED');
  assert.equal(expectStatus(await call('/api/admin/access')).configured, false);
});

// ---------- staff roles ------------------------------------------------------
test('F-A18 staff matrix: driver / finance / manager permissions on orders, deliveries, staff, products', async () => {
  realAdmin();
  const owner = await ownerToken();
  const driver = await staffLogin(owner, { email: 'test-f-driver@example.test', role: 'driver' });
  const finance = await staffLogin(owner, { email: 'test-f-finance@example.test', role: 'finance' });
  const manager = await staffLogin(owner, { email: 'test-f-manager@example.test', role: 'manager' });
  const { order } = expectStatus(await checkout([line()], { paymentMethod: 'cash' }), 201);

  // driver: routes only
  expectError(await call('/api/admin/orders', { bearer: driver.token }), 403, 'ROLE_FORBIDDEN');
  expectError(await call('/api/admin/orders', { method: 'PATCH', bearer: driver.token, body: { id: order.id, paymentStatus: 'paid' } }), 403, 'ROLE_FORBIDDEN');
  expectError(await call('/api/admin/customers', { bearer: driver.token }), 403, 'ROLE_FORBIDDEN');
  expectError(await call('/api/admin/staff', { bearer: driver.token }), 403, 'ROLE_FORBIDDEN');
  expectError(await call('/api/admin/settings', { bearer: driver.token }), 403, 'ROLE_FORBIDDEN');
  expectError(await call('/api/admin/integrations', { bearer: driver.token }), 403, 'ROLE_FORBIDDEN');
  expectStatus(await call('/api/admin/deliveries', { bearer: driver.token }));
  expectStatus(await call('/api/admin/deliveries?date=2027-01-01', { bearer: driver.token }));

  // finance: read orders/dashboard, never write them; no delivery or product access
  expectStatus(await call('/api/admin/orders', { bearer: finance.token }));
  expectStatus(await call('/api/admin/dashboard', { bearer: finance.token }));
  expectError(await call('/api/admin/orders', { method: 'PATCH', bearer: finance.token, body: { id: order.id, paymentStatus: 'paid' } }), 403, 'ROLE_FORBIDDEN');
  expectError(await call('/api/admin/orders', { bearer: finance.token, body: { items: [line()] } }), 403, 'ROLE_FORBIDDEN');
  expectError(await call('/api/admin/orders/bulk-payment', { bearer: finance.token, body: { confirmed: true, orders: [] } }), 403, 'ROLE_FORBIDDEN');
  expectError(await call('/api/admin/deliveries', { bearer: finance.token }), 403, 'ROLE_FORBIDDEN');
  expectError(await call('/api/admin/products', { bearer: finance.token }), 403, 'ROLE_FORBIDDEN');
  expectError(await call('/api/admin/staff', { bearer: finance.token }), 403, 'ROLE_FORBIDDEN');
  expectStatus(await call('/api/admin/integrations', { bearer: finance.token }));
  assert.equal(sql('SELECT payment_status p FROM orders').p, 'pending', 'the refused finance PATCH changed nothing');
  assert.equal(count('fiscal_receipts'), 0);

  // manager: everything except staff administration
  expectStatus(await call('/api/admin/orders', { bearer: manager.token }));
  expectStatus(await call('/api/admin/products', { bearer: manager.token }));
  expectError(await call('/api/admin/staff', { bearer: manager.token }), 403, 'ROLE_FORBIDDEN');
  expectError(await call('/api/admin/staff', { bearer: manager.token, body: { email: 'test-f-escalate@example.test', fullName: 'TEST-F Escalate', role: 'manager', password: 'test-f-escalate-pass-1' } }), 403, 'ROLE_FORBIDDEN');
  assert.equal(count('admin_users', "email='test-f-escalate@example.test'"), 0);

  // owner: everything, including staff, and every audit row carries the personal actor
  expectStatus(await call('/api/admin/staff', { bearer: owner }));
  expectStatus(await call('/api/admin/orders', { method: 'PATCH', bearer: owner, body: { id: order.id, paymentStatus: 'paid' } }));
  assert.equal(sql("SELECT actor_id a FROM audit_log WHERE action='order.updated'").a, ADMIN.email);
});

test('F-A19 staff creation rules: weak password, owner role, bad email and duplicate email are refused cleanly', async () => {
  realAdmin();
  const owner = await ownerToken();
  const base = { email: 'test-f-new@example.test', fullName: 'TEST-F Novi', role: 'driver', password: 'test-f-long-password-1' };
  expectError(await call('/api/admin/staff', { bearer: owner, body: { ...base, password: 'kratka' } }), 422, 'PASSWORD_WEAK');
  expectError(await call('/api/admin/staff', { bearer: owner, body: { ...base, password: undefined } }), 422, 'PASSWORD_REQUIRED');
  expectError(await call('/api/admin/staff', { bearer: owner, body: { ...base, role: 'owner' } }), 422, 'VALIDATION_ERROR');
  expectError(await call('/api/admin/staff', { bearer: owner, body: { ...base, role: 'root' } }), 422, 'VALIDATION_ERROR');
  expectError(await call('/api/admin/staff', { bearer: owner, body: { ...base, email: 'not-an-email' } }), 422, 'VALIDATION_ERROR');
  assert.equal(count('admin_users'), 0);
  const created = expectStatus(await call('/api/admin/staff', { bearer: owner, body: base })).staff;
  assert.equal(JSON.stringify(created).includes(base.password), false);
  const stored = sql('SELECT * FROM admin_users');
  assert.notEqual(stored.password_hash, base.password);
  assert.match(stored.password_hash, /^[0-9a-f]{32}:[0-9a-f]{128}$/, 'salted scrypt hash');
  assert.ok(!JSON.stringify(expectStatus(await call('/api/admin/staff', { bearer: owner }))).includes('password'), 'listing never exposes password material');
});

test('F-A19b creating a second staff member with an already used email is a clean 4xx, not a 500', async () => {
  realAdmin();
  const owner = await ownerToken();
  const base = { email: 'test-f-dup@example.test', fullName: 'TEST-F Prvi', role: 'driver', password: 'test-f-long-password-1' };
  expectStatus(await call('/api/admin/staff', { bearer: owner, body: base }));
  const duplicate = await call('/api/admin/staff', { bearer: owner, body: { ...base, fullName: 'TEST-F Duplikat' } });
  assert.ok(duplicate.status >= 400 && duplicate.status < 500, `duplicate staff email must be a clean 4xx, got ${duplicate.status} ${JSON.stringify(duplicate.body)}`);
  assert.equal(count('admin_users'), 1);
  assert.equal(sql('SELECT full_name n FROM admin_users').n, 'TEST-F Prvi', 'the existing account is untouched');
});

test('F-A20 deactivating a staff member kills live sessions and blocks login; a password change also revokes sessions', async () => {
  realAdmin();
  const owner = await ownerToken();
  const finance = await staffLogin(owner, { email: 'test-f-fin2@example.test', role: 'finance' });
  expectStatus(await call('/api/admin/orders', { bearer: finance.token }));
  expectStatus(await call('/api/admin/staff', { bearer: owner, body: { id: finance.id, isActive: false } }));
  expectError(await call('/api/admin/orders', { bearer: finance.token }), 403, 'ADMIN_FORBIDDEN');
  expectError(await adminLogin({ email: finance.email, password: finance.password }), 403, 'ADMIN_FORBIDDEN');
  assert.equal(sql('SELECT is_active a FROM admin_users').a, 0);
  expectStatus(await call('/api/admin/staff', { bearer: owner, body: { id: finance.id, isActive: true } }));
  const again = expectStatus(await adminLogin({ email: finance.email, password: finance.password }));
  expectStatus(await call('/api/admin/orders', { bearer: again.sessionToken }));
  expectStatus(await call('/api/admin/staff', { bearer: owner, body: { id: finance.id, password: 'test-f-changed-password-2' } }));
  expectError(await call('/api/admin/orders', { bearer: again.sessionToken }), 403, 'ADMIN_FORBIDDEN');
  expectError(await adminLogin({ email: finance.email, password: finance.password }), 403, 'ADMIN_FORBIDDEN');
  expectStatus(await adminLogin({ email: finance.email, password: 'test-f-changed-password-2' }));
});

test('F-A21 a partial staff update (e.g. only fullName) must not silently re-activate a deactivated account', async () => {
  realAdmin();
  const owner = await ownerToken();
  const driver = await staffLogin(owner, { email: 'test-f-driver2@example.test', role: 'driver' });
  expectStatus(await call('/api/admin/staff', { bearer: owner, body: { id: driver.id, isActive: false } }));
  expectStatus(await call('/api/admin/staff', { bearer: owner, body: { id: driver.id, fullName: 'TEST-F Preimenovan' } }));
  assert.equal(sql('SELECT is_active a FROM admin_users WHERE id=?', driver.id).a, 0, 'renaming a deactivated person re-enabled their access');
  expectError(await adminLogin({ email: driver.email, password: driver.password }), 403, 'ADMIN_FORBIDDEN');
});

test('F-A22 role escalation by edit is impossible: a manager cannot call staff APIs and the role enum excludes owner', async () => {
  realAdmin();
  const owner = await ownerToken();
  const manager = await staffLogin(owner, { email: 'test-f-mgr2@example.test', role: 'manager' });
  expectError(await call('/api/admin/staff', { bearer: manager.token, body: { id: manager.id, role: 'manager', isActive: true } }), 403, 'ROLE_FORBIDDEN');
  expectError(await call('/api/admin/staff', { bearer: owner, body: { id: manager.id, role: 'owner' } }), 422, 'VALIDATION_ERROR');
  assert.equal(sql('SELECT role r FROM admin_users WHERE id=?', manager.id).r, 'manager');
});
