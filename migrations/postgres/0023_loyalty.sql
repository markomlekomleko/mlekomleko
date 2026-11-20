-- Final specification, sections 12 and 13 (19 Nov 2026).
-- Package surcharges: a customer may only ADD to an already paid package. Every addition is
-- booked as its own cash/transfer order; a "regular" addition is delivered with every
-- remaining realized delivery of the package, a "next_only" one rides on next_delivery_addons.
CREATE TABLE package_surcharges (
 id TEXT PRIMARY KEY,
 customer_id TEXT NOT NULL REFERENCES customers(id),
 subscription_id TEXT NOT NULL REFERENCES subscriptions(id),
 package_id TEXT REFERENCES subscription_packages(id),
 order_id TEXT NOT NULL UNIQUE REFERENCES orders(id),
 order_item_id TEXT NOT NULL UNIQUE REFERENCES order_items(id),
 product_id TEXT NOT NULL REFERENCES products(id),
 scope TEXT NOT NULL CHECK(scope IN ('next_only','regular')),
 quantity_per_delivery INTEGER NOT NULL CHECK(quantity_per_delivery > 0),
 deliveries INTEGER NOT NULL CHECK(deliveries > 0 AND deliveries <= 4),
 interval_days INTEGER NOT NULL DEFAULT 7 CHECK(interval_days IN (7,14)),
 unit_price_minor INTEGER NOT NULL CHECK(unit_price_minor >= 0),
 amount_minor INTEGER NOT NULL CHECK(amount_minor >= 0),
 status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','cancelled')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK(amount_minor = unit_price_minor * quantity_per_delivery * deliveries)
);
CREATE INDEX package_surcharges_subscription ON package_surcharges(subscription_id, status);

-- Loyalty: 12 realized deliveries since loyaltyStartDate unlock 2 L of milk + one free delivery.
-- One row per customer and cycle; status only moves forward unlocked → claimed → applied → used.
CREATE TABLE loyalty_rewards (
 id TEXT PRIMARY KEY,
 customer_id TEXT NOT NULL REFERENCES customers(id),
 cycle_number INTEGER NOT NULL CHECK(cycle_number > 0),
 status TEXT NOT NULL DEFAULT 'unlocked' CHECK(status IN ('unlocked','claimed','applied','used')),
 code TEXT UNIQUE,
 gift_product_id TEXT NOT NULL REFERENCES products(id),
 gift_quantity INTEGER NOT NULL DEFAULT 2 CHECK(gift_quantity > 0),
 delivery_discount_minor INTEGER NOT NULL DEFAULT 35000 CHECK(delivery_discount_minor >= 0),
 discount_status TEXT NOT NULL DEFAULT 'pending' CHECK(discount_status IN ('pending','deducted','credited')),
 applied_subscription_id TEXT REFERENCES subscriptions(id),
 applied_order_id TEXT REFERENCES orders(id),
 discount_order_id TEXT REFERENCES orders(id),
 used_delivery_order_id TEXT UNIQUE REFERENCES delivery_orders(id),
 unlocked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 claimed_at TEXT,
 applied_at TEXT,
 used_at TEXT,
 UNIQUE(customer_id, cycle_number),
 CHECK(status = 'unlocked' OR code IS NOT NULL),
 CHECK(status IN ('unlocked','claimed') OR applied_subscription_id IS NOT NULL OR applied_order_id IS NOT NULL),
 CHECK(status <> 'used' OR used_delivery_order_id IS NOT NULL)
);
CREATE INDEX loyalty_rewards_customer ON loyalty_rewards(customer_id, status);
CREATE UNIQUE INDEX loyalty_rewards_applied_subscription ON loyalty_rewards(applied_subscription_id) WHERE status = 'applied' AND applied_subscription_id IS NOT NULL;
CREATE UNIQUE INDEX loyalty_rewards_applied_order ON loyalty_rewards(applied_order_id) WHERE applied_order_id IS NOT NULL;

ALTER TABLE delivery_items ADD COLUMN loyalty_reward_id TEXT REFERENCES loyalty_rewards(id);
ALTER TABLE delivery_items ADD COLUMN package_surcharge_id TEXT REFERENCES package_surcharges(id);
CREATE INDEX delivery_items_loyalty_reward ON delivery_items(loyalty_reward_id);
CREATE INDEX delivery_items_package_surcharge ON delivery_items(package_surcharge_id);
CREATE UNIQUE INDEX delivery_items_surcharge_once ON delivery_items(delivery_order_id, package_surcharge_id);
-- The free-delivery value is credited at most once per reward.
CREATE UNIQUE INDEX credits_ledger_loyalty_once ON credits_ledger(reason) WHERE reason LIKE 'loyalty_reward:%';

-- Counting starts on the day the program is activated (this migration) for every subscriber.
INSERT INTO settings (key, value_json) VALUES ('loyaltyStartDate', '"' || to_char(CURRENT_TIMESTAMP AT TIME ZONE 'Europe/Belgrade', 'YYYY-MM-DD') || '"') ON CONFLICT(key) DO NOTHING;
