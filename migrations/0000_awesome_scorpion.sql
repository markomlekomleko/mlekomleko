CREATE TABLE `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`actor_type` text NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`entity_type` text NOT NULL,
	`entity_id` text NOT NULL,
	`before_json` text,
	`after_json` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `audit_log_entity_idx` ON `audit_log` (`entity_type`,`entity_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `auth_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text,
	`email` text NOT NULL,
	`token_hash` text NOT NULL,
	`kind` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `auth_tokens_hash_unique` ON `auth_tokens` (`token_hash`);--> statement-breakpoint
CREATE INDEX `auth_tokens_email_idx` ON `auth_tokens` (`email`);--> statement-breakpoint
CREATE TABLE `credits_ledger` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`subscription_id` text,
	`order_id` text,
	`amount_minor` integer NOT NULL,
	`reason` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`applied_at` text,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `credits_ledger_customer_status_idx` ON `credits_ledger` (`customer_id`,`status`);--> statement-breakpoint
CREATE TABLE `customers` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`full_name` text NOT NULL,
	`phone` text NOT NULL,
	`address_line_1` text NOT NULL,
	`address_line_2` text,
	`city` text NOT NULL,
	`postal_code` text NOT NULL,
	`delivery_note` text,
	`source_json` text DEFAULT '{}' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `customers_email_unique` ON `customers` (`email`);--> statement-breakpoint
CREATE TABLE `deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`delivery_date` text NOT NULL,
	`cutoff_at` text NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`generated_at` text NOT NULL,
	`locked_at` text,
	`generation_key` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `deliveries_date_unique` ON `deliveries` (`delivery_date`);--> statement-breakpoint
CREATE UNIQUE INDEX `deliveries_generation_key_unique` ON `deliveries` (`generation_key`);--> statement-breakpoint
CREATE TABLE `delivery_items` (
	`id` text PRIMARY KEY NOT NULL,
	`delivery_order_id` text NOT NULL,
	`product_id` text NOT NULL,
	`product_name` text NOT NULL,
	`unit_label` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_price_minor` integer NOT NULL,
	`source_type` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`delivery_order_id`) REFERENCES `delivery_orders`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "delivery_items_quantity_positive" CHECK("delivery_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE INDEX `delivery_items_delivery_order_idx` ON `delivery_items` (`delivery_order_id`);--> statement-breakpoint
CREATE TABLE `delivery_orders` (
	`id` text PRIMARY KEY NOT NULL,
	`delivery_id` text NOT NULL,
	`source_order_id` text,
	`subscription_id` text,
	`customer_id` text NOT NULL,
	`customer_snapshot_json` text NOT NULL,
	`note` text,
	`status` text DEFAULT 'planned' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`delivery_id`) REFERENCES `deliveries`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `delivery_orders_delivery_idx` ON `delivery_orders` (`delivery_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `delivery_orders_order_unique` ON `delivery_orders` (`delivery_id`,`source_order_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `delivery_orders_subscription_unique` ON `delivery_orders` (`delivery_id`,`subscription_id`);--> statement-breakpoint
CREATE TABLE `idempotency_keys` (
	`id` text PRIMARY KEY NOT NULL,
	`namespace` text NOT NULL,
	`key` text NOT NULL,
	`request_hash` text NOT NULL,
	`response_json` text,
	`status_code` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idempotency_namespace_key_unique` ON `idempotency_keys` (`namespace`,`key`);--> statement-breakpoint
CREATE TABLE `next_delivery_addons` (
	`id` text PRIMARY KEY NOT NULL,
	`subscription_id` text NOT NULL,
	`product_id` text NOT NULL,
	`delivery_date` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_price_minor` integer NOT NULL,
	`consumed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "next_delivery_addons_quantity_positive" CHECK("next_delivery_addons"."quantity" > 0)
);
--> statement-breakpoint
CREATE INDEX `next_delivery_addons_subscription_date_idx` ON `next_delivery_addons` (`subscription_id`,`delivery_date`);--> statement-breakpoint
CREATE TABLE `order_items` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`product_id` text NOT NULL,
	`product_name` text NOT NULL,
	`unit_label` text NOT NULL,
	`quantity` integer NOT NULL,
	`unit_price_minor` integer NOT NULL,
	`line_total_minor` integer NOT NULL,
	`purchase_type` text NOT NULL,
	`cadence` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "order_items_quantity_positive" CHECK("order_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE INDEX `order_items_order_idx` ON `order_items` (`order_id`);--> statement-breakpoint
CREATE TABLE `orders` (
	`id` text PRIMARY KEY NOT NULL,
	`order_number` text NOT NULL,
	`customer_id` text NOT NULL,
	`subscription_id` text,
	`kind` text NOT NULL,
	`payment_method` text NOT NULL,
	`payment_status` text NOT NULL,
	`fulfillment_status` text DEFAULT 'planned' NOT NULL,
	`delivery_date` text NOT NULL,
	`subtotal_minor` integer NOT NULL,
	`credit_applied_minor` integer DEFAULT 0 NOT NULL,
	`total_minor` integer NOT NULL,
	`currency` text DEFAULT 'RSD' NOT NULL,
	`customer_note` text,
	`source_json` text DEFAULT '{}' NOT NULL,
	`idempotency_key` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "orders_amounts_nonnegative" CHECK("orders"."subtotal_minor" >= 0 AND "orders"."credit_applied_minor" >= 0 AND "orders"."total_minor" >= 0),
	CONSTRAINT "orders_currency_rsd" CHECK("orders"."currency" = 'RSD')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `orders_number_unique` ON `orders` (`order_number`);--> statement-breakpoint
CREATE UNIQUE INDEX `orders_idempotency_unique` ON `orders` (`idempotency_key`);--> statement-breakpoint
CREATE INDEX `orders_delivery_date_idx` ON `orders` (`delivery_date`);--> statement-breakpoint
CREATE TABLE `outbox` (
	`id` text PRIMARY KEY NOT NULL,
	`topic` text NOT NULL,
	`aggregate_type` text NOT NULL,
	`aggregate_id` text NOT NULL,
	`payload_json` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`attempts` integer DEFAULT 0 NOT NULL,
	`available_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`sent_at` text
);
--> statement-breakpoint
CREATE INDEX `outbox_pending_idx` ON `outbox` (`status`,`available_at`);--> statement-breakpoint
CREATE TABLE `products` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`unit_label` text NOT NULL,
	`price_minor` integer NOT NULL,
	`currency` text DEFAULT 'RSD' NOT NULL,
	`image_url` text,
	`seo_title` text,
	`seo_description` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "products_price_nonnegative" CHECK("products"."price_minor" >= 0),
	CONSTRAINT "products_currency_rsd" CHECK("products"."currency" = 'RSD')
);
--> statement-breakpoint
CREATE UNIQUE INDEX `products_slug_unique` ON `products` (`slug`);--> statement-breakpoint
CREATE TABLE `settings` (
	`key` text PRIMARY KEY NOT NULL,
	`value_json` text NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE TABLE `subscription_items` (
	`id` text PRIMARY KEY NOT NULL,
	`subscription_id` text NOT NULL,
	`product_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`cadence` text NOT NULL,
	`cadence_anchor_date` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "subscription_items_quantity_positive" CHECK("subscription_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE INDEX `subscription_items_subscription_idx` ON `subscription_items` (`subscription_id`);--> statement-breakpoint
CREATE TABLE `subscription_skips` (
	`id` text PRIMARY KEY NOT NULL,
	`subscription_id` text NOT NULL,
	`delivery_date` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscription_skips_unique` ON `subscription_skips` (`subscription_id`,`delivery_date`);--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`customer_id` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`payment_method` text NOT NULL,
	`pause_until` text,
	`next_delivery_date` text NOT NULL,
	`started_at` text NOT NULL,
	`cancelled_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `subscriptions_customer_idx` ON `subscriptions` (`customer_id`);--> statement-breakpoint
CREATE INDEX `subscriptions_status_idx` ON `subscriptions` (`status`);--> statement-breakpoint
CREATE TABLE `webhook_events` (
	`id` text PRIMARY KEY NOT NULL,
	`provider` text NOT NULL,
	`provider_event_id` text NOT NULL,
	`payload_json` text NOT NULL,
	`received_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`processed_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `webhook_events_provider_id_unique` ON `webhook_events` (`provider`,`provider_event_id`);
--> statement-breakpoint
CREATE TRIGGER `audit_log_no_update` BEFORE UPDATE ON `audit_log` BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `audit_log_no_delete` BEFORE DELETE ON `audit_log` BEGIN SELECT RAISE(ABORT, 'audit_log is append-only'); END;
--> statement-breakpoint
CREATE TRIGGER `outbox_no_delete` BEFORE DELETE ON `outbox` BEGIN SELECT RAISE(ABORT, 'outbox events cannot be deleted'); END;
--> statement-breakpoint
INSERT INTO `settings` (`key`, `value_json`) VALUES
  ('timezone', '"Europe/Belgrade"'),
  ('currency', '"RSD"'),
  ('deliveryWeekday', '5'),
  ('deliveryLocalTime', '"08:00"'),
  ('cutoffHours', '24'),
  ('storeName', '"Mleko i Mleko"'),
  ('localIntegrations', '{"payments":"mock","email":"mock","fiscal":"mock"}');
--> statement-breakpoint
INSERT INTO `products` (`id`, `slug`, `name`, `description`, `unit_label`, `price_minor`, `currency`, `seo_title`, `seo_description`, `is_active`) VALUES
  ('prod_kravlje_1l', 'sveze-kravlje-mleko-1l', 'Sveže kravlje mleko', 'Demo proizvod za lokalni razvoj. Zameniti stvarnim katalogom.', '1 L', 22000, 'RSD', 'Sveže kravlje mleko | Mleko i Mleko', 'Sveže domaće kravlje mleko sa dostavom u Beogradu.', 1),
  ('prod_kozje_1l', 'sveze-kozje-mleko-1l', 'Sveže kozje mleko', 'Demo proizvod za lokalni razvoj. Zameniti stvarnim katalogom.', '1 L', 32000, 'RSD', 'Sveže kozje mleko | Mleko i Mleko', 'Sveže domaće kozje mleko sa dostavom u Beogradu.', 1),
  ('prod_jogurt_1l', 'domaci-jogurt-1l', 'Domaći jogurt', 'Demo proizvod za lokalni razvoj. Zameniti stvarnim katalogom.', '1 L', 24000, 'RSD', 'Domaći jogurt | Mleko i Mleko', 'Domaći jogurt sa dostavom u Beogradu.', 1),
  ('prod_sir_500g', 'mladi-sir-500g', 'Mladi sir', 'Demo proizvod za lokalni razvoj. Zameniti stvarnim katalogom.', '500 g', 45000, 'RSD', 'Mladi sir | Mleko i Mleko', 'Domaći mladi sir sa dostavom u Beogradu.', 1);
