import { rootCertificates } from 'node:tls';
import supabaseCA from './certs/supabase-ca.json' with { type: 'json' };

export function postgresUrl(env = process.env, migration = false) {
  return (migration && env.POSTGRES_URL_NON_POOLING?.trim())
    || env.POSTGRES_URL?.trim()
    || env.POSTGRES_PRISMA_URL?.trim()
    || (/^postgres(?:ql)?:\/\//.test(env.DATABASE_URL ?? '') ? env.DATABASE_URL : '');
}

/** @param {Record<string, string | undefined>} env */
export function postgresSchema(env = process.env) {
  const schema = env.POSTGRES_SCHEMA?.trim() || 'public';
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(schema)) throw new Error('Invalid PostgreSQL schema name.');
  return schema;
}

export function postgresConfig(connectionString) {
  const url = new URL(connectionString);
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw new Error('Expected a PostgreSQL connection URL.');
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  // Do not allow URL SSL options to replace certificate verification.
  for (const option of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert', 'uselibpqcompat', 'pgbouncer', 'supa']) url.searchParams.delete(option);
  return {
    connectionString: url.href,
    ssl: local ? false : {
      rejectUnauthorized: true,
      ca: url.hostname.endsWith('.supabase.com') || url.hostname.endsWith('.supabase.co')
        ? [...rootCertificates, supabaseCA.certificate] : [...rootCertificates],
    },
    connectionTimeoutMillis: 15000,
    idleTimeoutMillis: 10000,
    max: 3,
    allowExitOnIdle: true,
  };
}
