ALTER TABLE delivery_items ADD COLUMN order_item_id TEXT REFERENCES order_items(id);
CREATE INDEX delivery_items_order_item_idx ON delivery_items(order_item_id);
