import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:net';
import { randomUUID } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import { createClient } from '@libsql/client';

let server, client, directory, origin;
let serverOutput = '';
const adminSecret = randomUUID();
const cronSecret = randomUUID();

before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'mleko-vercel-test-'));
  const portProbe = createServer();
  await new Promise(resolve => portProbe.listen(0, '127.0.0.1', resolve));
  const port = portProbe.address().port;
  await new Promise(resolve => portProbe.close(resolve));
  origin = `http://127.0.0.1:${port}`;
  const url = pathToFileURL(join(directory, 'test.sqlite')).href;
  const env = {
    ...process.env, NODE_ENV: 'production', APP_ENV: 'local', VERCEL: '',
    APP_ORIGIN: origin, NEXT_PUBLIC_SITE_URL: origin,
    TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: '', DATABASE_URL: url,
    ADMIN_SECRET: adminSecret, CRON_SECRET: cronSecret,
    PAYMENT_WEBHOOK_SECRET: randomUUID(), PAYMENT_PROVIDER: 'disabled', PAYMENT_MODE: 'disabled',
    BADI_MODE: 'mock', EMAIL_MODE: 'console', WHATSAPP_MODE: 'queue',
    ALLOW_PRODUCTION_INTEGRATIONS: 'false',
  };
  const migration = spawnSync(process.execPath, ['scripts/migrate.mjs', '--local'], { env, encoding: 'utf8' });
  assert.equal(migration.status, 0, migration.stderr);
  client = createClient({ url });
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [server.stdout, server.stderr]) stream.on('data', chunk => { serverOutput = (serverOutput + chunk).slice(-12000); });
  for (let attempt = 0; attempt < 200; attempt++) {
    if (server.exitCode !== null) throw new Error(`Next exited: ${serverOutput}`);
    try { const response = await fetch(`${origin}/api/admin/access`); if (response.ok) return; } catch { /* Server is starting. */ }
    await delay(100);
  }
  throw new Error(`Next did not start: ${serverOutput}`);
}, { timeout: 30000 });

after(async () => {
  if (server && server.exitCode === null) {
    const exited = new Promise(resolve => server.once('exit', resolve));
    server.kill('SIGTERM');
    const forced = setTimeout(() => server.kill('SIGKILL'), 5000);
    await exited;
    clearTimeout(forced);
  }
  client?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

async function api(path, { admin = false, body, headers = {}, ...options } = {}) {
  const response = await fetch(origin + path, {
    ...options,
    headers: { ...(admin ? { 'x-admin-secret': adminSecret } : {}), ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, headers: response.headers, body: await response.json() };
}

test('production admin requires a key even with APP_ENV=local and loopback headers', async () => {
  const access = await api('/api/admin/access', { headers: { 'x-forwarded-for': '127.0.0.1' } });
  assert.deepEqual(access.body, { authenticated: false, configured: true, mode: 'key' });
  assert.equal((await api('/api/admin/products')).status, 403);
  assert.equal((await api('/api/admin/access', { headers: { 'x-admin-secret': 'wrong' } })).status, 403);
  assert.deepEqual((await api('/api/admin/access', { admin: true })).body, { authenticated: true, configured: true, mode: 'key' });
});

test('all ten admin sections load from the migrated database with no cache', async () => {
  for (const section of ['dashboard', 'products', 'orders', 'customers', 'subscriptions', 'deliveries', 'promos', 'bundles', 'settings', 'integrations']) {
    const result = await api(`/api/admin/${section}`, { admin: true });
    assert.equal(result.status, 200, `${section}: ${JSON.stringify(result.body)}`);
    assert.equal(result.headers.get('cache-control'), 'no-store');
  }
});

test('product edits persist and roll back when the audit statement fails', async () => {
  const product = (await api('/api/admin/products', { admin: true })).body.products[0];
  const changed = await api(`/api/admin/products/${product.id}`, { admin: true, method: 'PATCH', body: { name: 'Migraciona provera mleka', priceMinor: 27100 } });
  assert.equal(changed.status, 200, JSON.stringify(changed.body));
  assert.equal((await api(`/api/products/${product.slug}`)).body.product.priceMinor, 27100);
  await client.execute("CREATE TRIGGER test_audit_failure BEFORE INSERT ON audit_log BEGIN SELECT RAISE(ABORT, 'Test transaction rollback'); END");
  try {
    const failed = await api(`/api/admin/products/${product.id}`, { admin: true, method: 'PATCH', body: { priceMinor: 29000 } });
    assert.equal(failed.status, 500);
    const row = (await client.execute({ sql: 'SELECT price_minor FROM products WHERE id = ?', args: [product.id] })).rows[0];
    assert.equal(row.price_minor, 27100, 'The product write must roll back with the failed audit insert.');
  } finally { await client.execute('DROP TRIGGER test_audit_failure'); }
});

test('checkout persists one cash order across an idempotent retry', async () => {
  const product = (await api('/api/products')).body.products[0];
  const items = [{ productId: product.id, quantity: 2, purchaseType: 'one_time' }];
  const quote = await api('/api/cart', { method: 'POST', body: { items } });
  assert.equal(quote.status, 200);
  const body = { items, paymentMethod: 'cash', customer: { email: 'migration@example.test', fullName: 'Test Kupac', phone: '+381600000000', addressLine1: 'Test ulica 1', city: 'Beograd', postalCode: '11000' } };
  const headers = { 'idempotency-key': randomUUID() };
  const first = await api('/api/checkout', { method: 'POST', headers, body });
  assert.equal(first.status, 201, JSON.stringify(first.body));
  assert.equal(first.body.order.totalMinor, quote.body.totalMinor);
  const repeated = await api('/api/checkout', { method: 'POST', headers, body });
  assert.equal(repeated.status, 201);
  assert.equal(repeated.body.order.id, first.body.order.id);
  assert.equal((await client.execute('SELECT COUNT(*) AS count FROM orders')).rows[0].count, 1);
});

test('raw card data is rejected and security headers survive the runtime migration', async () => {
  const result = await api('/api/checkout', { method: 'POST', body: { payment: { cardNumber: '4111111111111111' } } });
  assert.equal(result.status, 422);
  assert.equal(result.body.error.code, 'CARD_DATA_REJECTED');
  assert.equal(result.headers.get('x-frame-options'), 'DENY');
  assert.equal(result.headers.get('x-content-type-options'), 'nosniff');
  assert.match(result.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.ok(result.headers.get('x-request-id'));
});

test('cron denies missing or wrong secrets and HEAD never runs jobs', async () => {
  for (const headers of [{}, { authorization: 'Bearer wrong' }]) {
    assert.equal((await api('/api/jobs/scheduled', { headers })).status, 401);
  }
  const head = await fetch(origin + '/api/jobs/scheduled', { method: 'HEAD', headers: { authorization: `Bearer ${cronSecret}` } });
  assert.equal(head.status, 405);
  assert.equal((await client.execute('SELECT COUNT(*) AS count FROM deliveries')).rows[0].count, 0);
  const headers = { authorization: `Bearer ${cronSecret}` };
  const first = await api('/api/jobs/scheduled', { headers });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.equal(first.body.ok, true);
  const count = (await client.execute('SELECT COUNT(*) AS count FROM deliveries')).rows[0].count;
  assert.ok(count > 0);
  assert.equal((await api('/api/jobs/scheduled', { headers })).status, 200);
  assert.equal((await client.execute('SELECT COUNT(*) AS count FROM deliveries')).rows[0].count, count);
});

test('Next renders the admin gate and real public product pages', async () => {
  const admin = await fetch(origin + '/admin');
  const html = await admin.text();
  assert.equal(admin.status, 200);
  assert.ok(!html.includes(adminSecret));
  assert.ok(!html.includes('Nisu učitane sekcije:'));
  const product = (await api('/api/products')).body.products[0];
  const page = await fetch(origin + '/proizvodi/' + product.slug);
  assert.equal(page.status, 200);
  assert.ok((await page.text()).includes(product.name));
  const missing = await fetch(origin + '/proizvodi/nepostojeci-proizvod');
  const missingHtml = await missing.text();
  // Next's root loading boundary can send headers before product lookup finishes.
  // Streamed notFound responses use 200 + noindex; non-streamed responses use 404.
  assert.ok([200, 404].includes(missing.status));
  assert.match(missingHtml, /Ova stranica ne postoji/);
  assert.match(missingHtml, /<meta name="robots" content="noindex/);
  assert.equal((await api('/api/products/nepostojeci-proizvod')).status, 404);
});

test('the redesigned homepage ships purchase navigation and a product fallback before WebGL', async () => {
  const response = await fetch(origin + '/');
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<h1[^>]*id="hero-title"/);
  assert.match(html, /milk-scene-poster/);
  assert.match(html, /class="header-shop" href="\/prodavnica"/);
  assert.match(html, /id="delivery-check-title"/);
  assert.match(html, /Da li moram da se pretplatim/);
  for (const asset of ['/images/pastoral-morning.avif', '/images/demo/kravlje-mleko.avif', '/images/mleko-i-mleko-seal.webp']) {
    const image = await fetch(origin + asset);
    assert.equal(image.status, 200, asset);
    assert.match(image.headers.get('content-type'), /^image\//, asset);
  }
});
