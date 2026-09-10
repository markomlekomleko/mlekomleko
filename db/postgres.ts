import { Pool, types, type QueryResult } from "pg";
import { postgresConfig, postgresSchema } from "./postgres-config.mjs";
import { postgresSql } from "./postgres-sql.mjs";

function result<T>(value: QueryResult): D1Result<T> {
  return { success: true, results: value.rows as T[], meta: { changes: value.rowCount ?? 0 } };
}

// Keep monetary aggregates and counts numeric, matching the existing API.
function safeInteger(value: string) {
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error("Database integer exceeds the supported safe range.");
  return number;
}

class PostgresStatement implements D1PreparedStatement {
  readonly pool: Pool;
  readonly sql: string;
  readonly args: unknown[];
  readonly schema: string;
  constructor(pool: Pool, sql: string, schema: string, args: unknown[] = []) {
    this.pool = pool; this.sql = sql; this.schema = schema; this.args = args;
  }
  bind(...args: unknown[]) { return new PostgresStatement(this.pool, this.sql, this.schema, args); }
  async first<T>() { return (await this.all<T>()).results[0] ?? null; }
  async all<T>() {
    if (this.schema === "public") return result<T>(await this.pool.query(postgresSql(this.sql), this.args));
    return (await executeBatch<T>(this.pool, this.schema, [this]))[0];
  }
  async run<T>() { return this.all<T>(); }
}

async function executeBatch<T>(pool: Pool, schema: string, statements: PostgresStatement[]) {
  const client = await pool.connect();
  try {
    await client.query(`BEGIN; SET LOCAL search_path TO "${schema}", pg_catalog;`);
    const results: D1Result<T>[] = [];
    for (const statement of statements) results.push(result<T>(await client.query(postgresSql(statement.sql), statement.args)));
    await client.query("COMMIT");
    return results;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally { client.release(); }
}

export function createPostgresDatabase(pool: Pool, schema = "public"): D1Database {
  // Validate before using a schema as an SQL identifier (also used by isolated tests).
  postgresSchema({ POSTGRES_SCHEMA: schema });
  return {
    prepare: sql => new PostgresStatement(pool, sql, schema),
    async batch<T>(statements: D1PreparedStatement[]) {
      const owned = statements.map(statement => {
        if (!(statement instanceof PostgresStatement) || statement.pool !== pool || statement.schema !== schema) throw new Error("Database batch contains a foreign statement.");
        return statement;
      });
      return executeBatch<T>(pool, schema, owned);
    },
  };
}

export function connectPostgresDatabase(url: string): D1Database {
  const pool = new Pool({
    ...postgresConfig(url),
    types: { getTypeParser(oid, format) {
      if (format !== "binary" && oid === 20) return safeInteger;
      if (format !== "binary" && oid === 1700) return Number;
      return types.getTypeParser(oid, format);
    } },
  });
  pool.on("error", () => console.error("An idle PostgreSQL connection failed; the pool will reconnect."));
  return createPostgresDatabase(pool, postgresSchema());
}
