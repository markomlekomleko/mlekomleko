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
import pg from 'pg';
import { postgresConfig } from '../../db/postgres-config.mjs';
import { postgresSql } from '../../db/postgres-sql.mjs';
import { migratePostgres } from '../../scripts/migrate-postgres.mjs';

let server, client, directory, origin;
let pgClient, schema;
let migratedTableNames;
const postgresTestUrl = process.env.TEST_POSTGRES_URL;
let serverOutput = '';
const adminSecret = randomUUID();
const adminUsername = "runtime-admin@example.test";
let adminSession;
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
    POSTGRES_URL: '', POSTGRES_PRISMA_URL: '', POSTGRES_URL_NON_POOLING: '', POSTGRES_SCHEMA: '',
    ADMIN_EMAIL: adminUsername, ADMIN_PASSWORD: adminSecret, ADMIN_SECRET: "ignored-legacy-key", ADMIN_LEGACY_ACCESS: "false", CRON_SECRET: cronSecret,
    PAYMENT_WEBHOOK_SECRET: randomUUID(), PAYMENT_PROVIDER: 'disabled', PAYMENT_MODE: 'disabled',
    BADI_MODE: 'mock', EMAIL_MODE: 'console', WHATSAPP_MODE: 'queue',
    ALLOW_PRODUCTION_INTEGRATIONS: 'false',
  };
  const migration = spawnSync(process.execPath, ['scripts/migrate.mjs', '--local'], { env, encoding: 'utf8' });
  assert.equal(migration.status, 0, migration.stderr);
  client = createClient({ url });
  if (postgresTestUrl) {
    schema = 'mleko_test_' + randomUUID().replaceAll('-', '');
    pgClient = new pg.Client(postgresConfig(postgresTestUrl));
    await pgClient.connect();
    await migratePostgres({ url: postgresTestUrl, schema });
    await pgClient.query(`SET search_path TO "${schema}", pg_catalog`);
    // Verify every migrated table has the same column names as the SQLite source.
    const tables = (await client.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name != '__mleko_migrations'")).rows;
    migratedTableNames = [...tables.map(table => table.name), "__mleko_migrations"].sort();
    for (const { name } of tables) {
      const expected = (await client.execute(`PRAGMA table_info("${name}")`)).rows.map(row => row.name).sort();
      const actual = (await pgClient.query('SELECT column_name FROM information_schema.columns WHERE table_schema=$1 AND table_name=$2', [schema, name])).rows.map(row => row.column_name).sort();
      assert.deepEqual(actual, expected, `PostgreSQL columns for ${name}`);
    }
    for (const table of ['products', 'settings', 'bundles', 'bundle_items', 'promo_codes']) {
      const order = table === 'settings' ? 'key' : 'id';
      const clean = rows => rows.map(row => Object.fromEntries(Object.entries(row).filter(([key]) => !['created_at', 'updated_at'].includes(key))));
      const expected = clean((await client.execute(`SELECT * FROM "${table}" ORDER BY "${order}"`)).rows);
      const actual = clean((await pgClient.query(`SELECT * FROM "${table}" ORDER BY "${order}"`)).rows);
      assert.deepEqual(actual, expected, `PostgreSQL seed data for ${table}`);
    }
    assert.deepEqual(await migratePostgres({ url: postgresTestUrl, schema }), [], 'A second migration must change nothing.');
    client.close();
    client = {
      async execute(query) {
        const result = await pgClient.query(typeof query === 'string' ? query : { text: postgresSql(query.sql), values: query.args });
        for (const field of result.fields ?? []) if ([20, 1700].includes(field.dataTypeID)) {
          for (const row of result.rows) if (row[field.name] !== null) row[field.name] = Number(row[field.name]);
        }
        return result;
      },
      close() {},
    };
    env.POSTGRES_URL = process.env.TEST_POSTGRES_RUNTIME_URL || postgresTestUrl;
    env.POSTGRES_SCHEMA = schema;
    env.DATABASE_URL = '';
    env.TURSO_DATABASE_URL = '';
  }
  server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', String(port)], { env, stdio: ['ignore', 'pipe', 'pipe'] });
  for (const stream of [server.stdout, server.stderr]) stream.on('data', chunk => { serverOutput = (serverOutput + chunk).slice(-12000); });
  for (let attempt = 0; attempt < 200; attempt++) {
    if (server.exitCode !== null) throw new Error(`Next exited: ${serverOutput}`);
    try { const response = await fetch(`${origin}/api/admin/access`); if (response.ok) return; } catch { /* Server is starting. */ }
    await delay(100);
  }
  throw new Error(`Next did not start: ${serverOutput}`);
}, { timeout: 120000 });

after(async () => {
  if (server && server.exitCode === null) {
    const exited = new Promise(resolve => server.once('exit', resolve));
    server.kill('SIGTERM');
    const forced = setTimeout(() => server.kill('SIGKILL'), 5000);
    await exited;
    clearTimeout(forced);
  }
  client?.close();
  if (pgClient) {
    // This schema was generated by this test run; production tables are untouched.
    if (schema) await pgClient.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await pgClient.end();
  }
  if (directory) await rm(directory, { recursive: true, force: true });
});

async function api(path, { admin = false, body, headers = {}, ...options } = {}) {
  if (admin && !adminSession) {
    const login = await api('/api/admin/access', { method: 'POST', body: { username: adminUsername, password: adminSecret } });
    assert.equal(login.status, 200, JSON.stringify(login.body));
    adminSession = login.body.sessionToken;
  }
  const response = await fetch(origin + path, {
    ...options,
    headers: { origin, ...(admin ? { authorization: `Bearer ${adminSession}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}), ...headers },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, headers: response.headers, body: await response.json() };
}

test('production admin requires username and password; expired, revoked and rotated sessions fail', async () => {
  const access = await api('/api/admin/access', { headers: { 'x-forwarded-for': '127.0.0.1' } });
  assert.deepEqual(access.body, { authenticated: false, configured: true, mode: 'password' });
  assert.equal((await api('/api/admin/products')).status, 403);
  assert.equal((await api('/api/admin/products', { headers: { 'x-admin-secret': 'ignored-legacy-key' } })).status, 403);
  assert.equal((await api('/api/admin/access', { method: 'POST', headers: { origin: 'https://wrong.example' }, body: { username: adminUsername, password: adminSecret } })).status, 403);
  for (const body of [{ username: 'wrong', password: adminSecret }, { username: adminUsername, password: 'wrong' }]) {
    assert.equal((await api('/api/admin/access', { method: 'POST', body })).status, 403);
  }
  assert.deepEqual((await api('/api/admin/access', { admin: true })).body, { authenticated: true, configured: true, mode: 'password' });
  const stored = (await client.execute('SELECT * FROM admin_sessions')).rows[0];
  assert.ok(stored.token_hash && stored.token_hash !== adminSession);
  await client.execute({ sql: 'UPDATE admin_sessions SET expires_at = ? WHERE token_hash = ?', args: ['2000-01-01T00:00:00.000Z', stored.token_hash] });
  assert.equal((await api('/api/admin/products', { admin: true })).status, 403);
  adminSession = null;
  await api('/api/admin/access', { admin: true });
  await client.execute("UPDATE admin_sessions SET credential_hash = 'rotated'");
  assert.equal((await api('/api/admin/products', { admin: true })).status, 403);
  adminSession = null;
  await api('/api/admin/access', { admin: true });
  const revokedToken = adminSession;
  assert.equal((await api('/api/admin/access', { admin: true, method: 'DELETE' })).status, 200);
  assert.equal((await api('/api/admin/products', { headers: { authorization: `Bearer ${revokedToken}` } })).status, 403);
  adminSession = null;
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
  await client.execute(postgresTestUrl
    ? "CREATE FUNCTION test_audit_failure_guard() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Test transaction rollback'; END; $$; CREATE TRIGGER test_audit_failure BEFORE INSERT ON audit_log FOR EACH ROW EXECUTE FUNCTION test_audit_failure_guard()"
    : "CREATE TRIGGER test_audit_failure BEFORE INSERT ON audit_log BEGIN SELECT RAISE(ABORT, 'Test transaction rollback'); END");
  try {
    const failed = await api(`/api/admin/products/${product.id}`, { admin: true, method: 'PATCH', body: { priceMinor: 29000 } });
    assert.equal(failed.status, 500);
    const row = (await client.execute({ sql: 'SELECT price_minor FROM products WHERE id = ?', args: [product.id] })).rows[0];
    assert.equal(row.price_minor, 27100, 'The product write must roll back with the failed audit insert.');
  } finally { await client.execute(postgresTestUrl ? 'DROP TRIGGER test_audit_failure ON audit_log' : 'DROP TRIGGER test_audit_failure'); }
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

test('subscription checkout, account login and versioned pause work with persistent data', async () => {
  const product = (await api('/api/products')).body.products[0];
  const email = 'subscription-migration@example.test';
  const checkout = await api('/api/checkout', {
    method: 'POST', headers: { 'idempotency-key': randomUUID() },
    body: { items: [{ productId: product.id, quantity: 2, purchaseType: 'subscription', cadence: 'weekly' }], paymentMethod: 'cash',
      customer: { email, fullName: 'Test Pretplatnik', phone: '+381600000000', addressLine1: 'Test 2', city: 'Beograd', postalCode: '11000' } },
  });
  assert.equal(checkout.status, 201, JSON.stringify(checkout.body));
  const link = await api('/api/auth/magic-link', { method: 'POST', body: { email } });
  assert.equal(link.status, 202);
  const login = await api('/api/auth/magic-link/exchange', { method: 'POST', body: { token: link.body.localDevelopment.token } });
  assert.equal(login.status, 200);
  const headers = { cookie: login.headers.get('set-cookie').split(';')[0], origin };
  const account = await api('/api/account', { headers });
  assert.equal(account.status, 200);
  const subscription = account.body.subscriptions[0];
  assert.equal(subscription.version, 1);
  const paused = await api(`/api/account/subscriptions/${subscription.id}`, {
    method: 'PATCH', headers: { ...headers, 'idempotency-key': randomUUID() },
    body: { action: 'pause', expectedVersion: 1, pauseUntil: new Date(Date.now() + 21 * 86400000).toISOString().slice(0, 10) },
  });
  assert.equal(paused.status, 200, JSON.stringify(paused.body));
  const updated = (await api('/api/account', { headers })).body.subscriptions[0];
  assert.equal(updated.status, 'paused');
  assert.equal(updated.version, 2);
  const stale = await api(`/api/account/subscriptions/${subscription.id}`, {
    method: 'PATCH', headers: { ...headers, 'idempotency-key': randomUUID() }, body: { action: 'resume', expectedVersion: 1 },
  });
  assert.equal(stale.status, 409);
  assert.equal(stale.body.error.code, 'SUBSCRIPTION_VERSION_CONFLICT');
  for (const section of ['dashboard', 'customers', 'subscriptions']) assert.equal((await api(`/api/admin/${section}`, { admin: true })).status, 200);
});

test('migration preserves append-only history and foreign keys', async () => {
  await assert.rejects(client.execute("UPDATE audit_log SET action = 'changed'"), /append-only/);
  await assert.rejects(client.execute('DELETE FROM outbox'), /cannot be deleted/);
  await assert.rejects(client.execute("INSERT INTO auth_tokens (id, customer_id, email, token_hash, kind, expires_at) VALUES ('invalid-fk', 'missing-customer', 'invalid@example.test', 'invalid-hash', 'session', '2099-01-01')"), /foreign key/i);
});

test('Supabase public roles have no access to commerce tables', { skip: !postgresTestUrl }, async () => {
  const tables = (await pgClient.query('SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname=$1', [schema])).rows;
  assert.deepEqual(tables.map(table => table.tablename).sort(), migratedTableNames);
  assert.ok(tables.some(table => table.tablename === "admin_sessions"));
  assert.ok(tables.every(table => table.rowsecurity));
  const grants = await pgClient.query("SELECT table_name FROM information_schema.role_table_grants WHERE table_schema=$1 AND grantee IN ('anon', 'authenticated', 'PUBLIC')", [schema]);
  assert.equal(grants.rowCount, 0);
});


test('order confirmations export saved items and totals; protected downloads reject anonymous callers', async () => {
  const order = (await api('/api/admin/orders', { admin: true })).body.orders[0];
  const path = `/api/admin/orders/${order.id}/export`;
  assert.equal((await fetch(origin + path)).status, 403);
  assert.equal((await api(path + '?format=pdf', { admin: true })).status, 422);
  assert.equal((await api('/api/admin/orders/missing/export', { admin: true })).status, 404);
  const headers = { authorization: `Bearer ${adminSession}` };
  const csv = await fetch(origin + path + '?format=csv', { headers });
  assert.equal(csv.status, 200);
  assert.equal(csv.headers.get('cache-control'), 'no-store');
  assert.match(csv.headers.get('content-disposition'), /attachment/);
  const text = await csv.text();
  assert.ok(text.includes(order.order_number));
  assert.ok(text.includes('Cena po jedinici (RSD)'));
  assert.ok(text.includes(String(order.total_minor / 100)));
  const workbook = await fetch(origin + path + '?format=xlsx', { headers });
  const bytes = Buffer.from(await workbook.arrayBuffer());
  assert.equal(bytes.readUInt32LE(0), 0x04034b50);
  assert.ok(bytes.includes(Buffer.from('name="Potvrda"')));
  assert.ok(bytes.includes(Buffer.from('name="Stavke"')));
  assert.ok(bytes.includes(Buffer.from(order.order_number)));
  assert.ok(bytes.includes(Buffer.from(`<v>${order.total_minor / 100}</v>`)));
});

test('admin login attempts are rate limited', async () => {
  for (let attempt = 0; attempt < 11; attempt++) {
    const response = await api('/api/admin/access', { method: 'POST', headers: { 'x-real-ip': '192.0.2.200' }, body: { username: adminUsername, password: 'wrong' } });
    assert.equal(response.status, attempt < 10 ? 403 : 429);
  }
});
