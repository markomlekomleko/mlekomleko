ALTER TABLE subscriptions ADD COLUMN renewal_enabled integer NOT NULL DEFAULT 1;
CREATE TABLE subscription_packages (
  id text PRIMARY KEY,
  order_id text NOT NULL UNIQUE REFERENCES orders(id),
  subscription_id text NOT NULL REFERENCES subscriptions(id),
  status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','completed')),
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at text
);
CREATE UNIQUE INDEX subscription_packages_open_unique ON subscription_packages(subscription_id) WHERE status = 'open';
CREATE TABLE package_lines (
  id text PRIMARY KEY,
  package_id text NOT NULL REFERENCES subscription_packages(id),
  order_item_id text NOT NULL UNIQUE REFERENCES order_items(id),
  required_deliveries integer NOT NULL CHECK(required_deliveries IN (1,2,4)),
  anchor_date text NOT NULL
);
ALTER TABLE delivery_items ADD COLUMN package_line_id text REFERENCES package_lines(id);
CREATE UNIQUE INDEX delivery_items_package_once ON delivery_items(delivery_order_id, package_line_id);
CREATE INDEX delivery_items_package_idx ON delivery_items(package_line_id);
ALTER TABLE fiscal_receipts ADD COLUMN reference_receipt_id text REFERENCES fiscal_receipts(id);
CREATE TABLE product_images (
  id text PRIMARY KEY,
  mime_type text NOT NULL,
  data_base64 text NOT NULL,
  created_at text NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE products ADD COLUMN fiscal_tax_label text;
ALTER TABLE order_items ADD COLUMN fiscal_tax_label text;
ALTER TABLE fiscal_receipts ADD COLUMN pfr_time text;
ALTER TABLE fiscal_receipts ADD COLUMN verification_url text;
