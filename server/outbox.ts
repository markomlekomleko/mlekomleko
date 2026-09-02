import type { SqlValue } from "./sql";

export function enqueue(topic: string, aggregateType: string, aggregateId: string, payload: unknown): { sql: string; bindings: SqlValue[] } {
  return enqueueAt(topic, aggregateType, aggregateId, payload, new Date().toISOString());
}

export function enqueueAt(topic: string, aggregateType: string, aggregateId: string, payload: unknown, availableAt: string): { sql: string; bindings: SqlValue[] } {
  return {
    sql: "INSERT INTO outbox (id, topic, aggregate_type, aggregate_id, payload_json, available_at) VALUES (?, ?, ?, ?, ?, ?)",
    bindings: [crypto.randomUUID(), topic, aggregateType, aggregateId, JSON.stringify(payload), availableAt],
  };
}

export function audit(actorType: "customer" | "admin" | "system", actorId: string | null, action: string, entityType: string, entityId: string, before: unknown, after: unknown): { sql: string; bindings: SqlValue[] } {
  return {
    sql: "INSERT INTO audit_log (id, actor_type, actor_id, action, entity_type, entity_id, before_json, after_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    bindings: [crypto.randomUUID(), actorType, actorId, action, entityType, entityId, before == null ? null : JSON.stringify(before), after == null ? null : JSON.stringify(after)],
  };
}
