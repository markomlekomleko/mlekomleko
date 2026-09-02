import { getD1 } from "../db";

export type SqlValue = string | number | null;
export type Row = Record<string, unknown>;

export function d1(): D1Database {
  return getD1();
}

export async function first<T extends Row>(sql: string, ...bindings: SqlValue[]): Promise<T | null> {
  return d1().prepare(sql).bind(...bindings).first<T>();
}

export async function all<T extends Row>(sql: string, ...bindings: SqlValue[]): Promise<T[]> {
  const result = await d1().prepare(sql).bind(...bindings).all<T>();
  return result.results;
}

export async function run(sql: string, ...bindings: SqlValue[]): Promise<D1Result<unknown>> {
  return d1().prepare(sql).bind(...bindings).run();
}

export async function batch(statements: Array<{ sql: string; bindings?: SqlValue[] }>): Promise<D1Result<unknown>[]> {
  return d1().batch(statements.map((statement) => d1().prepare(statement.sql).bind(...(statement.bindings ?? []))));
}

export function sqlPlaceholders(count: number): string {
  return Array.from({ length: count }, () => "?").join(", ");
}
