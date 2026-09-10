import assert from 'node:assert/strict';
import { test } from 'node:test';
import { postgresSql } from '../db/postgres-sql.mjs';
import { postgresConfig, postgresUrl } from '../db/postgres-config.mjs';

test('PostgreSQL parameters preserve literal question marks, comments and dollar quotes', () => {
  const sql = `SELECT ?, 'what? it''s fine', "question?", $$body?$$, $body$?$body$ /* ? */ -- ?\n, ?`;
  assert.equal(postgresSql(sql), `SELECT $1, 'what? it''s fine', "question?", $$body?$$, $body$?$body$ /* ? */ -- ?\n, $2`);
});

test('PostgreSQL translates the dashboard date and JSON expressions', () => {
  assert.equal(postgresSql("SELECT json_extract(o.source_json, '$.utm_source'), date('now'), datetime('now', '-30 days') WHERE id = ?"),
    "SELECT (o.source_json::jsonb ->> 'utm_source'), to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD'), to_char((CURRENT_TIMESTAMP AT TIME ZONE 'UTC') - INTERVAL '30 days', 'YYYY-MM-DD HH24:MI:SS') WHERE id = $1");
  assert.equal(postgresSql("SELECT 'date(''now'')?'"), "SELECT 'date(''now'')?'");
});

test('Vercel Postgres variables take precedence over a local SQLite URL', () => {
  const env = { POSTGRES_URL: 'postgres://pool/db', POSTGRES_URL_NON_POOLING: 'postgres://direct/db', DATABASE_URL: 'file:local.sqlite' };
  assert.equal(postgresUrl(env), env.POSTGRES_URL);
  assert.equal(postgresUrl(env, true), env.POSTGRES_URL_NON_POOLING);
  assert.equal(postgresUrl({ DATABASE_URL: 'file:local.sqlite' }), '');
});

test('remote PostgreSQL verifies TLS even when connection URL requests disabled SSL', () => {
  const config = postgresConfig('postgres://user:password@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=disable&pgbouncer=true');
  assert.equal(config.ssl.rejectUnauthorized, true);
  assert.ok(config.ssl.ca.some(certificate => certificate.includes('BEGIN CERTIFICATE')));
  assert.equal(new URL(config.connectionString).searchParams.has('sslmode'), false);
});
