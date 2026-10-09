import type { SqlValue } from "./sql";

/** Conditional constraint runs inside the batch transaction, rolling back every write on stale state. */
export function mutationGuard(condition: string, bindings: SqlValue[] = []) {
  const id = crypto.randomUUID();
  return {
    check: { sql: `INSERT INTO mutation_guards (id, allowed) SELECT ?, CASE WHEN ${condition} THEN 1 ELSE 0 END`, bindings: [id, ...bindings] },
    cleanup: { sql: "DELETE FROM mutation_guards WHERE id = ?", bindings: [id] },
  };
}
