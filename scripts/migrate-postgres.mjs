import pg from 'pg';
import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { postgresConfig, postgresSchema, postgresUrl } from '../db/postgres-config.mjs';

export async function migratePostgres({ url = postgresUrl(process.env, true), schema = postgresSchema(), log = console.log } = {}) {
  if (!url) throw new Error('PostgreSQL is not configured. Set POSTGRES_URL_NON_POOLING or POSTGRES_URL.');
  postgresSchema({ POSTGRES_SCHEMA: schema });
  const client = new pg.Client(postgresConfig(url));
  const completed = [];
  try {
    await client.connect();
    await client.query('BEGIN');
    // One transaction and a transaction-scoped lock protect the full migration run.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('mleko-migrations'), hashtext($1))", [schema]);
    await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
    await client.query(`SET LOCAL search_path TO "${schema}", pg_catalog`);
    await client.query('CREATE TABLE IF NOT EXISTS __mleko_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP)');
    const applied = new Map((await client.query('SELECT name, checksum FROM __mleko_migrations')).rows.map(row => [row.name, row.checksum]));
    const directory = new URL('../migrations/postgres/', import.meta.url);
    const tables = new Set(['__mleko_migrations']);
    for (const name of (await readdir(directory)).filter(name => name.endsWith('.sql')).sort()) {
      const sql = await readFile(new URL(name, directory), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      for (const match of sql.matchAll(/CREATE TABLE "([a-z_]+)"/g)) tables.add(match[1]);
      if (applied.has(name)) {
        if (applied.get(name) !== checksum) throw new Error(`Previously applied PostgreSQL migration changed: ${name}`);
        continue;
      }
      await client.query(sql);
      await client.query('INSERT INTO __mleko_migrations (name, checksum) VALUES ($1, $2)', [name, checksum]);
      completed.push(name);
    }
    // Only the server accesses commerce data; public Supabase keys grant no access.
    const roles = (await client.query("SELECT rolname FROM pg_roles WHERE rolname IN ('anon', 'authenticated')")).rows.map(row => `"${row.rolname}"`);
    for (const table of tables) {
      await client.query(`ALTER TABLE "${table}" ENABLE ROW LEVEL SECURITY`);
      await client.query(`REVOKE ALL ON TABLE "${table}" FROM PUBLIC${roles.length ? ', ' + roles.join(', ') : ''}`);
    }
    await client.query('COMMIT');
    for (const name of completed) log(`Applied PostgreSQL migration: ${name}`);
    log('PostgreSQL migrations are up to date.');
    return completed;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { await client.end(); }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  await migratePostgres().catch(error => {
    console.error(`PostgreSQL migration failed (${error.code ?? 'ERROR'}): ${error.message}`);
    process.exitCode = 1;
  });
}
