import { createClient, type Client, type InStatement, type ResultSet } from "@libsql/client";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { postgresUrl } from "./postgres-config.mjs";
import { connectPostgresDatabase } from "./postgres";

let database: D1Database | undefined;

function result<T>(value: ResultSet): D1Result<T> {
  return {
    success: true,
    results: value.rows.map((row) => Object.fromEntries(Object.entries(row))) as T[],
    meta: { changes: value.rowsAffected, last_row_id: Number(value.lastInsertRowid ?? 0) },
  };
}

// Preserve the domain's prepared-statement and atomic-batch contract while
// replacing the platform binding with a normal Node/remote SQL connection.
class Statement implements D1PreparedStatement {
  constructor(readonly client: Client, readonly sql: string, readonly args: unknown[] = []) {}
  bind(...values: unknown[]) { return new Statement(this.client, this.sql, values); }
  query(): InStatement { return { sql: this.sql, args: this.args as never[] }; }
  async first<T>() { return (await this.all<T>()).results[0] ?? null; }
  async all<T>() { return result<T>(await this.client.execute(this.query())); }
  async run<T>() { return this.all<T>(); }
}

export function createDatabase(client: Client): D1Database {
  return {
    prepare: (sql) => new Statement(client, sql),
    async batch<T>(statements: D1PreparedStatement[]) {
      const queries = statements.map((statement) => {
        if (!(statement instanceof Statement) || statement.client !== client) throw new Error("Database batch contains a foreign statement.");
        return statement.query();
      });
      return (await client.batch(queries, "write")).map((value) => result<T>(value));
    },
  };
}

export function getDatabase(): D1Database {
  if (database) return database;
  const postgres = postgresUrl();
  if (postgres) {
    database = connectPostgresDatabase(postgres);
    return database;
  }
  const hosted = Boolean(process.env.VERCEL) || process.env.APP_ENV === "production";
  const url = process.env.TURSO_DATABASE_URL ?? process.env.DATABASE_URL ?? (hosted ? "" : "file:.data/mleko.sqlite");
  if (!url) throw new Error("Database is not configured. Set POSTGRES_URL for Supabase, or TURSO_DATABASE_URL and TURSO_AUTH_TOKEN for libSQL.");
  if (hosted && !/^(libsql|https):\/\//.test(url)) throw new Error("Database on Vercel must be a persistent remote libSQL database.");
  if (url.startsWith("file:")) {
    const path = fileURLToPath(new URL(url, `file://${process.cwd()}/`));
    mkdirSync(dirname(path), { recursive: true });
  }
  const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN, intMode: "number" });
  database = createDatabase(client);
  return database;
}
