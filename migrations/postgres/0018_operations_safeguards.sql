ALTER TABLE subscriptions ADD COLUMN pause_started_on TEXT;
ALTER TABLE package_lines ADD COLUMN imported_delivered_quantity INTEGER NOT NULL DEFAULT 0 CHECK(imported_delivered_quantity >= 0);
ALTER TABLE customer_credentials ADD COLUMN sms_notifications_at TEXT;
CREATE TABLE message_webhook_events (id TEXT PRIMARY KEY, provider_reference TEXT NOT NULL, event_type TEXT NOT NULL, event_at TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
