-- Explicit registry: normal customers and their integrations are unaffected.
CREATE TABLE test_scenario_customers (
 customer_id TEXT PRIMARY KEY REFERENCES customers(id),
 cohort TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE FUNCTION defer_test_scenario_event() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS (
 SELECT 1 FROM test_scenario_customers t WHERE
 (NEW.aggregate_type='customer' AND NEW.aggregate_id=t.customer_id) OR
 (NEW.aggregate_type='order' AND EXISTS(SELECT 1 FROM orders o WHERE o.id=NEW.aggregate_id AND o.customer_id=t.customer_id)) OR
 (NEW.aggregate_type='subscription' AND EXISTS(SELECT 1 FROM subscriptions s WHERE s.id=NEW.aggregate_id AND s.customer_id=t.customer_id)) OR
 (NEW.aggregate_type='delivery_order' AND EXISTS(SELECT 1 FROM delivery_orders d WHERE d.id=NEW.aggregate_id AND d.customer_id=t.customer_id)) OR
 (NEW.aggregate_type='refund' AND EXISTS(SELECT 1 FROM refund_requests r WHERE r.id=NEW.aggregate_id AND r.customer_id=t.customer_id))
) THEN
  NEW.available_at := '9999-12-31T00:00:00Z';
  NEW.external_id := 'test-scenario:suppressed';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER test_scenario_outbox BEFORE INSERT OR UPDATE ON outbox
 FOR EACH ROW EXECUTE FUNCTION defer_test_scenario_event();

CREATE FUNCTION block_test_scenario_financial_action() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM orders o JOIN test_scenario_customers t ON t.customer_id=o.customer_id WHERE o.id=NEW.order_id) THEN
  RAISE EXCEPTION 'TEST_SCENARIO_EXTERNAL_ACTION_BLOCKED';
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER test_scenario_fiscal BEFORE INSERT OR UPDATE ON fiscal_receipts
 FOR EACH ROW EXECUTE FUNCTION block_test_scenario_financial_action();
CREATE TRIGGER test_scenario_payment BEFORE INSERT OR UPDATE ON payment_attempts
 FOR EACH ROW EXECUTE FUNCTION block_test_scenario_financial_action();
