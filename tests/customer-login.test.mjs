import assert from 'node:assert/strict';
import { beforeEach, afterEach, test } from 'node:test';
import { register } from 'node:module';
import { createDatabase } from './sqlite-d1.mjs';

const realDate = Date;
const realFetch = globalThis.fetch;
let database, instant;
const env = {};
globalThis.__mlekoTestCloudflareEnv = env;
register(new URL('./cloudflare-loader.mjs', import.meta.url));
const worker = (await import('../dist/server/index.js')).default;
beforeEach(() => {
  for (const key of Object.keys(env)) delete env[key];
  Object.assign(env, { APP_ENV: 'local', AUTH_MODE: 'local', APP_ORIGIN: 'http://localhost', EMAIL_MODE: 'console', WHATSAPP_MODE: 'queue' });
  instant = realDate.parse('2026-09-12T10:00:00Z');
  globalThis.Date = class extends realDate { constructor(...args) { super(...(args.length ? args : [instant])); } static now() { return instant; } };
  database = createDatabase(); env.DB = database;
});
afterEach(() => { database.close(); globalThis.Date = realDate; globalThis.fetch = realFetch; });
const tick = () => { instant += 61_000; };
async function api(path, data, { cookie, method = 'POST', origin = env.APP_ORIGIN, ip = '127.0.0.1', authorization } = {}) {
  const headers = { 'content-type': 'application/json', origin, 'x-real-ip': ip, ...(cookie ? { cookie } : {}), ...(authorization ? { authorization } : {}) };
  const response = await worker.fetch(new Request(env.APP_ORIGIN + path, { method, headers, ...(method !== 'GET' ? { body: JSON.stringify(data) } : {}) }), env, { waitUntil() {}, passThroughOnException() {} });
  return { status: response.status, body: await response.json(), headers: response.headers };
}
function ok(response, status = 200) { assert.equal(response.status, status, JSON.stringify(response.body)); return response.body; }
const signup = (email = 'kupac@example.test', password = 'dugacka-test-lozinka') => api('/api/auth/register', { email, password });
const verify = (challenge, options) => api('/api/auth/code/verify', { challengeId: challenge.challengeId, code: challenge.localDevelopment.code }, options);
async function registered(email = 'kupac@example.test') {
  const challenge = ok(await signup(email), 202);
  const response = await verify(challenge); ok(response);
  return response.headers.get('set-cookie').split(';')[0];
}
function live() {
  Object.assign(env, { APP_ENV: 'production', AUTH_MODE: 'provider', AUTH_CODE_SECRET: 'test-code-secret-with-more-than-32-characters',
    EMAIL_MODE: 'provider', EMAIL_PROVIDER: 'infobip', EMAIL_API_KEY: 'email-test-key', EMAIL_FROM: 'Mleko <noreply@example.test>',
    WHATSAPP_MODE: 'provider', WHATSAPP_PROVIDER: 'infobip', WHATSAPP_API_KEY: 'whatsapp-test-key', WHATSAPP_SENDER_ID: '381601111111',
    INFOBIP_BASE_URL: 'https://test.api.infobip.com', WHATSAPP_AUTH_TEMPLATE: 'mm_login_code', WHATSAPP_TEMPLATE_LANGUAGE: 'sr' });
}
function accepted(messageId = 'provider-id') { return Response.json({ messages: [{ messageId, status: { groupId: 1, name: 'PENDING_ENROUTE' } }] }); }

test('registration requires a strong password and email proof; the session works without an order', async () => {
  ok(await signup('bad@example.test', 'short'), 422);
  tick();
  const challenge = ok(await signup(), 202);
  assert.equal(database.raw.prepare('SELECT COUNT(*) n FROM customers').get().n, 0);
  const pending = database.raw.prepare('SELECT * FROM auth_challenges').get();
  assert.match(pending.password_hash, /^scrypt\$32768\$8\$3\$/);
  assert.notEqual(pending.code_hash, challenge.localDevelopment.code);
  assert.equal(database.raw.prepare('SELECT COUNT(*) n FROM outbox').get().n, 0);
  const result = await verify(challenge); ok(result);
  assert.match(result.headers.get('set-cookie'), /HttpOnly; SameSite=Lax/);
  const cookie = result.headers.get('set-cookie').split(';')[0];
  const account = ok(await api('/api/account', null, { cookie, method: 'GET' }));
  assert.equal(account.customer.email, 'kupac@example.test');
  assert.equal(database.raw.prepare('SELECT password_hash FROM auth_challenges').get().password_hash, null);
  ok(await verify(challenge), 401);
  ok(await api('/api/auth/logout', {}, { cookie }));
  ok(await api('/api/account', null, { cookie, method: 'GET' }), 401);
});

test('registration claims an existing guest customer without changing delivery details or replacing a password', async () => {
  database.raw.exec("INSERT INTO customers (id,email,full_name,phone,address_line_1,city,postal_code) VALUES ('existing','kupac@example.test','Existing Buyer','+381600000000','Existing 1','Beograd','11000')");
  await registered();
  assert.equal(database.raw.prepare('SELECT COUNT(*) n FROM customers').get().n, 1);
  assert.equal(database.raw.prepare('SELECT full_name FROM customers').get().full_name, 'Existing Buyer');
  const hash = database.raw.prepare('SELECT password_hash FROM customer_credentials').get().password_hash;
  tick();
  const duplicate = ok(await signup('kupac@example.test', 'different-password'), 202);
  assert.equal(duplicate.localDevelopment, undefined);
  assert.equal(database.raw.prepare('SELECT password_hash FROM customer_credentials').get().password_hash, hash);
});

test('later email login needs only a code; old link issuance is retired in code mode', async () => {
  await registered(); tick();
  const challenge = ok(await api('/api/auth/code', { email: 'kupac@example.test', channel: 'email' }), 202);
  ok(await verify(challenge));
  ok(await api('/api/auth/magic-link', { email: 'kupac@example.test' }), 410);
});

test('codes expire, lock after five failures, and cannot create two sessions concurrently', async () => {
  const challenge = ok(await signup(), 202);
  const wrong = challenge.localDevelopment.code === '000000' ? '111111' : '000000';
  for (let index = 0; index < 5; index++) ok(await api('/api/auth/code/verify', { challengeId: challenge.challengeId, code: wrong }), 401);
  ok(await verify(challenge), 401);
  tick();
  const expired = ok(await signup(), 202); instant += 301_000;
  ok(await verify(expired), 401);
  const fresh = ok(await signup(), 202);
  const results = await Promise.all([verify(fresh), verify(fresh)]);
  assert.deepEqual(results.map(result => result.status).sort(), [200, 401]);
  assert.equal(database.raw.prepare("SELECT COUNT(*) n FROM auth_tokens WHERE kind='session'").get().n, 1);
});

test('recipient cooldown works across IP addresses and registration rejects cross-origin requests', async () => {
  ok(await api('/api/auth/register', { email: 'kupac@example.test', password: 'dugacka-test-lozinka' }, { origin: 'https://attacker.test' }), 403);
  ok(await signup(), 202);
  ok(await api('/api/auth/code', { email: 'kupac@example.test' }, { ip: '10.1.2.3' }), 429);
});

test('checkout phone and unknown email cannot be used as WhatsApp login credentials', async () => {
  await registered(); tick();
  database.raw.exec("UPDATE customers SET phone='+381601234567'");
  const unknown = ok(await api('/api/auth/code', { email: 'unknown@example.test', channel: 'whatsapp' }), 202);
  const unverified = ok(await api('/api/auth/code', { email: 'kupac@example.test', channel: 'whatsapp' }), 202);
  assert.deepEqual(Object.keys(unknown).sort(), Object.keys(unverified).sort());
  assert.equal(unverified.localDevelopment, undefined);
});

test('WhatsApp verification belongs to the signed-in account, and disconnect invalidates pending codes', async () => {
  const cookie = await registered(); tick();
  ok(await api('/api/account/whatsapp', { phone: '+381601234567', consent: true }), 401);
  ok(await api('/api/account/whatsapp', { phone: '+381601234567', consent: false }, { cookie }), 422);
  const challenge = ok(await api('/api/account/whatsapp', { phone: '+381 (60) 1234567', consent: true }, { cookie }), 202);
  const other = await registered('other@example.test');
  ok(await verify(challenge, { cookie: other }), 401);
  ok(await verify(challenge, { cookie }));
  const settings = ok(await api('/api/account/login-settings', null, { cookie, method: 'GET' }));
  assert.equal(settings.whatsappPhone, '+381601234567');
  assert.equal(settings.notifications, false);
  tick();
  const login = ok(await api('/api/auth/code', { email: 'kupac@example.test', channel: 'both' }), 202);
  ok(await verify(login));
  tick();
  const pending = ok(await api('/api/auth/code', { email: 'kupac@example.test', channel: 'whatsapp' }), 202);
  ok(await api('/api/account/login-settings', { action: 'disconnect' }, { cookie, method: 'PATCH' }));
  ok(await verify(pending), 401);
});

test('Infobip email request uses App auth and multipart, with no code exposed to the client', async () => {
  live(); let code;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://test.api.infobip.com/email/3/send');
    assert.equal(init.headers.authorization, 'App email-test-key');
    assert.ok(init.body instanceof FormData);
    assert.equal(init.body.get('to'), 'kupac@example.test');
    code = init.body.get('text').match(/Vaš kod je (\d{6})/)[1];
    return accepted();
  };
  const challenge = ok(await signup(), 202);
  assert.equal(challenge.localDevelopment, undefined);
  assert.ok(!JSON.stringify(challenge).includes(code));
  ok(await api('/api/auth/code/verify', { challengeId: challenge.challengeId, code }));
});

test('Infobip WhatsApp code uses the approved authentication template and copy-code URL parameter', async () => {
  const cookie = await registered(); tick(); live(); let code;
  globalThis.fetch = async (url, init) => {
    assert.equal(url, 'https://test.api.infobip.com/whatsapp/1/message/template');
    assert.equal(init.headers.authorization, 'App whatsapp-test-key');
    const message = JSON.parse(init.body).messages[0];
    assert.equal(message.to, '381601234567');
    assert.equal(message.content.templateName, 'mm_login_code');
    assert.equal(message.content.language, 'sr');
    code = message.content.templateData.body.placeholders[0];
    assert.deepEqual(message.content.templateData.buttons, [{ type: 'URL', parameter: code }]);
    return accepted(message.messageId);
  };
  const challenge = ok(await api('/api/account/whatsapp', { phone: '+381601234567', consent: true }, { cookie }), 202);
  ok(await api('/api/auth/code/verify', { challengeId: challenge.challengeId, code }, { cookie }));
});

test('both-channel login tolerates one provider failure; total failure removes the challenge', async () => {
  const cookie = await registered(); tick();
  const phone = ok(await api('/api/account/whatsapp', { phone: '+381601234567', consent: true }, { cookie }), 202);
  ok(await verify(phone, { cookie })); tick(); live();
  const channels = []; let code;
  globalThis.fetch = async (url, init) => {
    channels.push(url);
    if (url.includes('/email/')) { code = init.body.get('text').match(/Vaš kod je (\d{6})/)[1]; return accepted(); }
    return Response.json({ message: 'sensitive provider detail' }, { status: 503 });
  };
  const challenge = ok(await api('/api/auth/code', { email: 'kupac@example.test', channel: 'both' }), 202);
  assert.equal(channels.length, 2);
  ok(await api('/api/auth/code/verify', { challengeId: challenge.challengeId, code }));
  tick(); globalThis.fetch = async () => Response.json({ messages: [{ messageId: 'rejected', status: { groupId: 5 } }] });
  const count = database.raw.prepare('SELECT COUNT(*) n FROM auth_challenges').get().n;
  const failed = await api('/api/auth/code', { email: 'kupac@example.test', channel: 'both' }); ok(failed, 503);
  assert.equal(database.raw.prepare('SELECT COUNT(*) n FROM auth_challenges').get().n, count);
  assert.ok(!JSON.stringify(failed.body).includes('sensitive'));
});

test('production rejects local bypass, missing secrets and non-Infobip API hosts without sending', async () => {
  env.APP_ENV = 'production';
  ok(await signup(), 503);
  live(); delete env.AUTH_CODE_SECRET;
  ok(await signup(), 503);
  live(); env.INFOBIP_BASE_URL = 'https://attacker.test';
  let calls = 0; globalThis.fetch = async () => { calls++; return accepted(); };
  ok(await signup(), 503);
  assert.equal(calls, 0);
});

test('utility jobs require separate consent, use a static account button, and recheck opt-out', async () => {
  const cookie = await registered(); tick();
  const phone = ok(await api('/api/account/whatsapp', { phone: '+381601234567', consent: true }, { cookie }), 202);
  ok(await verify(phone, { cookie }));
  const customerId = database.raw.prepare('SELECT customer_id FROM customer_credentials').get().customer_id;
  database.raw.prepare("INSERT INTO orders (id,order_number,customer_id,kind,payment_method,payment_status,delivery_date,subtotal_minor,total_minor,idempotency_key) VALUES ('test-order','MM-TEST',?,'one_time','cash','pending','2026-09-18',50000,50000,'test-order-key')").run(customerId);
  live(); env.WHATSAPP_UPDATE_TEMPLATE = 'mm_account_update'; env.CRON_SECRET = 'test-cron-secret';
  env.PAYMENT_PROVIDER = 'disabled'; env.PAYMENT_MODE = 'disabled'; env.BADI_MODE = 'mock';
  const sent = [];
  globalThis.fetch = async (url, init) => {
    if (url.includes('/whatsapp/')) {
      const message = JSON.parse(init.body).messages[0]; sent.push(message);
      assert.equal(message.content.templateName, 'mm_account_update');
      assert.equal(message.content.templateData.body.placeholders.length, 1);
      assert.match(message.content.templateData.body.placeholders[0], /Porudžbina MM-TEST je primljena/);
      assert.equal(message.content.templateData.buttons, undefined);
      return accepted(message.messageId);
    }
    return accepted();
  };
  const event = (id) => database.raw.prepare("INSERT INTO outbox (id,topic,aggregate_type,aggregate_id,payload_json,available_at,idempotency_key) VALUES (?,'email.order_confirmation.requested','order','test-order','{}',?,?)").run(id, new Date().toISOString(), id);
  const jobs = () => api('/api/jobs/scheduled', null, { method: 'GET', authorization: 'Bearer test-cron-secret' });
  event('without-consent'); ok(await jobs());
  assert.equal(database.raw.prepare("SELECT COUNT(*) n FROM outbox WHERE topic='whatsapp.account_update'").get().n, 0);
  ok(await api('/api/account/login-settings', { notifications: true }, { cookie, method: 'PATCH' }));
  event('with-consent'); ok(await jobs()); ok(await jobs());
  assert.equal(sent.length, 1);
  database.raw.prepare("INSERT INTO outbox (id,topic,aggregate_type,aggregate_id,payload_json,available_at,idempotency_key) VALUES ('before-opt-out','whatsapp.account_update','order','test-order',?,?,'before-opt-out')").run(JSON.stringify({sourceTopic:'email.order_confirmation.requested',customerId}),new Date().toISOString());
  ok(await api('/api/account/login-settings', { notifications: false }, { cookie, method: 'PATCH' }));
  ok(await jobs()); assert.equal(sent.length, 1);
  assert.equal(database.raw.prepare("SELECT COUNT(*) n FROM outbox WHERE topic='whatsapp.account_update' AND external_id LIKE 'suppressed:%'").get().n, 1);
});
