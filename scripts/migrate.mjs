import { createClient } from '@libsql/client';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { postgresUrl } from '../db/postgres-config.mjs';

const localOnly = process.argv.includes('--local');
if (!localOnly && postgresUrl(process.env, true)) {
  const { migratePostgres } = await import('./migrate-postgres.mjs');
  await migratePostgres();
} else {
  const url = process.env.TURSO_DATABASE_URL ?? process.env.DATABASE_URL ?? 'file:.data/mleko.sqlite';
  if (localOnly && !url.startsWith('file:')) throw new Error('--local refuses to migrate a remote database.');
  if (!localOnly && process.env.VERCEL && !/^(libsql|https):\/\//.test(url)) throw new Error('Vercel needs a persistent remote database.');
  if (url.startsWith('file:')) await mkdir(dirname(fileURLToPath(new URL(url, `file://${process.cwd()}/`))), { recursive: true });
  const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });
  try {
    await client.execute('CREATE TABLE IF NOT EXISTS __mleko_migrations (name TEXT PRIMARY KEY, checksum TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)');
    const applied = new Map((await client.execute('SELECT name, checksum FROM __mleko_migrations')).rows.map(row => [row.name, row.checksum]));
    const legacy = (await client.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'd1_migrations'")).rows.length
      ? new Set((await client.execute('SELECT name FROM d1_migrations')).rows.map(row => row.name)) : new Set();
    for (const name of (await readdir(new URL('../migrations/', import.meta.url))).filter(name => name.endsWith('.sql')).sort()) {
      const sql = await readFile(new URL(`../migrations/${name}`, import.meta.url), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      if (applied.has(name)) {
        if (applied.get(name) !== checksum) throw new Error(`Previously applied migration changed: ${name}`);
        continue;
      }
      const transaction = await client.transaction('write');
      try {
        if (!legacy.has(name)) await transaction.executeMultiple(sql);
        await transaction.execute({ sql: 'INSERT INTO __mleko_migrations (name, checksum) VALUES (?, ?)', args: [name, checksum] });
        await transaction.commit();
        console.log(`${legacy.has(name) ? 'Imported migration history' : 'Applied'}: ${name}`);
      } catch (error) { await transaction.rollback(); throw error; }
      finally { transaction.close(); }
    }
    console.log('Database migrations are up to date.');
  } finally { client.close(); }
}
