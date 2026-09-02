import type { SqlValue } from "./sql";

export function enqueue(topic: string, aggregateType: string, aggregateId: string, payload: unknown): { sql: string; bindings: SqlValue[] } {
  return enqueueAt(topic, aggregateType, aggregateId, payload, new Date().toISOString());
}

export function enqueueAt(topic: string, aggregateType: string, aggregateId: string, payload: unknown, availableAt: string, idempotencyKey = crypto.randomUUID()): { sql: string; bindings: SqlValue[] } {
  const id = crypto.randomUUID();
  return {
    sql: "INSERT INTO outbox (id, topic, aggregate_type, aggregate_id, payload_json, idempotency_key, available_at) VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(idempotency_key) DO NOTHING",
    bindings: [id, topic, aggregateType, aggregateId, JSON.stringify(payload), idempotencyKey, availableAt],
  };
}

export function enqueueOnce(topic: string, aggregateType: string, aggregateId: string, payload: unknown, idempotencyKey: string, availableAt = new Date().toISOString()) {
  return enqueueAt(topic, aggregateType, aggregateId, payload, availableAt, idempotencyKey);
}

export function audit(actorType: "customer" | "admin" | "system", actorId: string | null, action: string, entityType: string, entityId: string, before: unknown, after: unknown): { sql: string; bindings: SqlValue[] } {
  return {
    sql: "INSERT INTO audit_log (id, actor_type, actor_id, action, entity_type, entity_id, before_json, after_json) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    bindings: [crypto.randomUUID(), actorType, actorId, action, entityType, entityId, before == null ? null : JSON.stringify(before), after == null ? null : JSON.stringify(after)],
  };
}
