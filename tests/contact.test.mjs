import assert from 'node:assert/strict';
import { beforeEach, afterEach, test } from 'node:test';
import { register } from 'node:module';
import { createDatabase } from './sqlite-d1.mjs';

const env = {};
globalThis.__mlekoTestCloudflareEnv = env;
register(new URL('./cloudflare-loader.mjs', import.meta.url));
const worker = (await import('../dist/server/index.js')).default;
// Initialize Vinext's lazy fetch wrapper before installing the provider mock.
await worker.fetch(new Request('http://localhost/api/contact', {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}',
}), env, { waitUntil() {}, passThroughOnException() {} });
const realFetch = globalThis.fetch;
let database, sent;
beforeEach(() => {
  for (const key of Object.keys(env)) delete env[key];
  database = createDatabase();
  Object.assign(env, { DB: database, APP_ENV: 'local', CONTACT_EMAIL_TO: 'inbox@example.test', EMAIL_MODE: 'provider', EMAIL_PROVIDER: 'resend', EMAIL_API_KEY: 'test-key', EMAIL_FROM: 'sender@example.test' });
  sent = [];
  globalThis.fetch = async (url, init) => { sent.push({ url, body: JSON.parse(init.body) }); return Response.json({ id: 'accepted' }); };
});
afterEach(() => { database.close(); globalThis.fetch = realFetch; });
const valid = { name: 'Ana', email: 'ana@example.test', topic: 'Dostava', orderNumber: '', message: 'Da li dostavljate na moju adresu?', website: '' };
async function submit(data = valid, origin = 'http://localhost') {
  const response = await worker.fetch(new Request('http://localhost/api/contact', { method: 'POST', headers: { 'content-type': 'application/json', origin, 'x-real-ip': '127.0.0.1' }, body: JSON.stringify(data) }), env, { waitUntil() {}, passThroughOnException() {} });
  return { status: response.status, body: await response.json() };
}

test('contact uses configured recipient and escapes user content in email HTML', async () => {
  const result = await submit({ ...valid, message: '<script>alert("unsafe")</script>' });
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.sent, true);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].body.to, ['inbox@example.test']);
  assert.ok(sent[0].body.html.includes('&lt;script&gt;'));
  assert.ok(!sent[0].body.html.includes('<script>'));
  assert.ok(sent[0].body.text.includes('ana@example.test'));
});
test('contact rejects malformed, spam and cross-origin submissions without sending', async () => {
  for (const input of [{ ...valid, email: 'bad' }, { ...valid, message: 'short' }, { ...valid, topic: 'unknown' }, { ...valid, name: ' ' }, { ...valid, website: 'spam' }]) {
    assert.equal((await submit(input)).status, 422);
  }
  assert.equal((await submit(valid, 'https://other.test')).status, 403);
  assert.equal(sent.length, 0);
});
test('contact reports missing configuration and provider failure without a false success', async () => {
  delete env.CONTACT_EMAIL_TO;
  assert.equal((await submit()).status, 503);
  assert.equal(sent.length, 0);
  env.CONTACT_EMAIL_TO = 'inbox@example.test';
  globalThis.fetch = async () => Response.json({ error: 'unavailable' }, { status: 503 });
  const result = await submit();
  assert.equal(result.status, 503);
  assert.equal(result.body.sent, undefined);
});
test('contact limits repeated sends', async () => {
  for (let i = 0; i < 5; i++) assert.equal((await submit()).status, 200);
  assert.equal((await submit()).status, 429);
  assert.equal(sent.length, 5);
});
