CREATE TABLE fiscal_order_snapshots (
 order_id TEXT PRIMARY KEY REFERENCES orders(id),
 snapshot_json TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE fiscal_delivery_allocations (
 delivery_order_id TEXT NOT NULL REFERENCES delivery_orders(id),
 order_item_id TEXT NOT NULL REFERENCES order_items(id),
 quantity INTEGER NOT NULL CHECK(quantity > 0),
 unit_offset INTEGER NOT NULL CHECK(unit_offset >= 0),
 prepaid INTEGER NOT NULL CHECK(prepaid IN (0,1)),
 PRIMARY KEY(delivery_order_id, order_item_id),
 UNIQUE(order_item_id, unit_offset)
);
