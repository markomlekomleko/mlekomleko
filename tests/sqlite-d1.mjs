import { DatabaseSync } from 'node:sqlite';
import { readFileSync, readdirSync } from 'node:fs';

// Real SQLite execution and atomic batches; API E2E also verifies the actual D1 runtime.
export function createDatabase() {
 const db = new DatabaseSync(':memory:');
 db.exec('PRAGMA foreign_keys = ON');
 for (const file of readdirSync(new URL('../migrations/', import.meta.url)).filter(f => f.endsWith('.sql')).sort()) db.exec(readFileSync(new URL('../migrations/' + file, import.meta.url), 'utf8'));
 function statement(sql, bindings = []) {
  const execute = () => {
   const result = db.prepare(sql).run(...bindings);
   return { success: true, results: [], meta: { changes: Number(result.changes), last_row_id: Number(result.lastInsertRowid) } };
  };
  return {
   bind(...values) { return statement(sql, values); },
   async first(column) { const row = db.prepare(sql).get(...bindings); return row ? column ? row[column] : row : null; },
   async all() { return { success: true, results: db.prepare(sql).all(...bindings), meta: {} }; },
   async run() { return execute(); },
   execute,
  };
 }
 return {
  raw: db,
  prepare: statement,
  async batch(statements) {
   db.exec('BEGIN IMMEDIATE');
   try { const results = statements.map(s => s.execute()); db.exec('COMMIT'); return results; }
   catch(error) { db.exec('ROLLBACK'); throw error; }
  },
  close() { db.close(); },
 };
}
