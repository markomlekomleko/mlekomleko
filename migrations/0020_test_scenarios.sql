-- Explicit registry: normal customers and their integrations are unaffected.
CREATE TABLE test_scenario_customers (
 customer_id TEXT PRIMARY KEY REFERENCES customers(id),
 cohort TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TRIGGER test_scenario_outbox_insert AFTER INSERT ON outbox
 WHEN NEW.available_at <> '9999-12-31T00:00:00Z' AND EXISTS (
 SELECT 1 FROM test_scenario_customers t WHERE
 (NEW.aggregate_type='customer' AND NEW.aggregate_id=t.customer_id) OR
 (NEW.aggregate_type='order' AND EXISTS(SELECT 1 FROM orders o WHERE o.id=NEW.aggregate_id AND o.customer_id=t.customer_id)) OR
 (NEW.aggregate_type='subscription' AND EXISTS(SELECT 1 FROM subscriptions s WHERE s.id=NEW.aggregate_id AND s.customer_id=t.customer_id)) OR
 (NEW.aggregate_type='delivery_order' AND EXISTS(SELECT 1 FROM delivery_orders d WHERE d.id=NEW.aggregate_id AND d.customer_id=t.customer_id)) OR
 (NEW.aggregate_type='refund' AND EXISTS(SELECT 1 FROM refund_requests r WHERE r.id=NEW.aggregate_id AND r.customer_id=t.customer_id))
)
 BEGIN
 UPDATE outbox SET available_at='9999-12-31T00:00:00Z',external_id='test-scenario:suppressed' WHERE id=NEW.id;
 END;
CREATE TRIGGER test_scenario_fiscal_receipts_insert BEFORE INSERT ON fiscal_receipts
 WHEN EXISTS(SELECT 1 FROM orders o JOIN test_scenario_customers t ON t.customer_id=o.customer_id WHERE o.id=NEW.order_id)
 BEGIN SELECT RAISE(ABORT,'TEST_SCENARIO_EXTERNAL_ACTION_BLOCKED'); END;
CREATE TRIGGER test_scenario_payment_attempts_insert BEFORE INSERT ON payment_attempts
 WHEN EXISTS(SELECT 1 FROM orders o JOIN test_scenario_customers t ON t.customer_id=o.customer_id WHERE o.id=NEW.order_id)
 BEGIN SELECT RAISE(ABORT,'TEST_SCENARIO_EXTERNAL_ACTION_BLOCKED'); END;
CREATE TRIGGER test_scenario_outbox_update AFTER UPDATE ON outbox
 WHEN NEW.available_at <> '9999-12-31T00:00:00Z' AND EXISTS (
 SELECT 1 FROM test_scenario_customers t WHERE
 (NEW.aggregate_type='customer' AND NEW.aggregate_id=t.customer_id) OR
 (NEW.aggregate_type='order' AND EXISTS(SELECT 1 FROM orders o WHERE o.id=NEW.aggregate_id AND o.customer_id=t.customer_id)) OR
 (NEW.aggregate_type='subscription' AND EXISTS(SELECT 1 FROM subscriptions s WHERE s.id=NEW.aggregate_id AND s.customer_id=t.customer_id)) OR
 (NEW.aggregate_type='delivery_order' AND EXISTS(SELECT 1 FROM delivery_orders d WHERE d.id=NEW.aggregate_id AND d.customer_id=t.customer_id)) OR
 (NEW.aggregate_type='refund' AND EXISTS(SELECT 1 FROM refund_requests r WHERE r.id=NEW.aggregate_id AND r.customer_id=t.customer_id))
)
 BEGIN
 UPDATE outbox SET available_at='9999-12-31T00:00:00Z',external_id='test-scenario:suppressed' WHERE id=NEW.id;
 END;
CREATE TRIGGER test_scenario_fiscal_receipts_update BEFORE UPDATE ON fiscal_receipts
 WHEN EXISTS(SELECT 1 FROM orders o JOIN test_scenario_customers t ON t.customer_id=o.customer_id WHERE o.id=NEW.order_id)
 BEGIN SELECT RAISE(ABORT,'TEST_SCENARIO_EXTERNAL_ACTION_BLOCKED'); END;
CREATE TRIGGER test_scenario_payment_attempts_update BEFORE UPDATE ON payment_attempts
 WHEN EXISTS(SELECT 1 FROM orders o JOIN test_scenario_customers t ON t.customer_id=o.customer_id WHERE o.id=NEW.order_id)
 BEGIN SELECT RAISE(ABORT,'TEST_SCENARIO_EXTERNAL_ACTION_BLOCKED'); END;
