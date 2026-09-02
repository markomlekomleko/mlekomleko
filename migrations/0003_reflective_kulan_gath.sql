CREATE TABLE `abandoned_carts` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text,
	`phone` text,
	`items_json` text NOT NULL,
	`promo_code` text,
	`email_consent` integer DEFAULT false NOT NULL,
	`whatsapp_consent` integer DEFAULT false NOT NULL,
	`status` text DEFAULT 'saved' NOT NULL,
	`recovery_queued_at` text,
	`converted_order_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`converted_order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `abandoned_carts_status_updated_idx` ON `abandoned_carts` (`status`,`updated_at`);--> statement-breakpoint
CREATE TABLE `bundle_items` (
	`id` text PRIMARY KEY NOT NULL,
	`bundle_id` text NOT NULL,
	`product_id` text NOT NULL,
	`quantity` integer NOT NULL,
	`purchase_type` text NOT NULL,
	`cadence` text,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`bundle_id`) REFERENCES `bundles`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "bundle_items_quantity_positive" CHECK("bundle_items"."quantity" > 0)
);
--> statement-breakpoint
CREATE INDEX `bundle_items_bundle_sort_idx` ON `bundle_items` (`bundle_id`,`sort_order`);--> statement-breakpoint
CREATE TABLE `bundles` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`eyebrow` text DEFAULT 'Pametan paket' NOT NULL,
	`name` text NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`is_featured` integer DEFAULT false NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bundles_slug_unique` ON `bundles` (`slug`);--> statement-breakpoint
CREATE INDEX `bundles_active_sort_idx` ON `bundles` (`is_active`,`sort_order`);--> statement-breakpoint
CREATE TABLE `order_conversion_tokens` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`used_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `order_conversion_tokens_order_unique` ON `order_conversion_tokens` (`order_id`);--> statement-breakpoint
CREATE UNIQUE INDEX `order_conversion_tokens_hash_unique` ON `order_conversion_tokens` (`token_hash`);--> statement-breakpoint
ALTER TABLE `order_items` ADD `unit_cost_minor` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `order_items` ADD `unit_packaging_cost_minor` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `order_items` ADD `total_cost_minor` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `payment_provider_ref` text;--> statement-breakpoint
ALTER TABLE `orders` ADD `payment_fee_minor` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE `orders` ADD `estimated_delivery_cost_minor` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_products` (
	`id` text PRIMARY KEY NOT NULL,
	`slug` text NOT NULL,
	`name` text NOT NULL,
	`short_description` text DEFAULT '' NOT NULL,
	`description` text DEFAULT '' NOT NULL,
	`category` text DEFAULT 'Ostalo' NOT NULL,
	`unit_label` text NOT NULL,
	`price_minor` integer NOT NULL,
	`cost_minor` integer DEFAULT 0 NOT NULL,
	`packaging_cost_minor` integer DEFAULT 0 NOT NULL,
	`subscription_price_minor` integer,
	`compare_at_price_minor` integer,
	`currency` text DEFAULT 'RSD' NOT NULL,
	`image_url` text,
	`image_alt` text DEFAULT '' NOT NULL,
	`badge` text,
	`origin` text DEFAULT '' NOT NULL,
	`is_featured` integer DEFAULT false NOT NULL,
	`allow_subscription` integer DEFAULT true NOT NULL,
	`is_demo` integer DEFAULT false NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	`seo_title` text,
	`seo_description` text,
	`is_active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	CONSTRAINT "products_price_nonnegative" CHECK("__new_products"."price_minor" >= 0),
	CONSTRAINT "products_cost_nonnegative" CHECK("__new_products"."cost_minor" >= 0),
	CONSTRAINT "products_packaging_cost_nonnegative" CHECK("__new_products"."packaging_cost_minor" >= 0),
	CONSTRAINT "products_subscription_price_nonnegative" CHECK("__new_products"."subscription_price_minor" IS NULL OR "__new_products"."subscription_price_minor" >= 0),
	CONSTRAINT "products_compare_price_nonnegative" CHECK("__new_products"."compare_at_price_minor" IS NULL OR "__new_products"."compare_at_price_minor" >= 0),
	CONSTRAINT "products_currency_rsd" CHECK("__new_products"."currency" = 'RSD')
);
--> statement-breakpoint
INSERT INTO `__new_products`("id", "slug", "name", "short_description", "description", "category", "unit_label", "price_minor", "cost_minor", "packaging_cost_minor", "subscription_price_minor", "compare_at_price_minor", "currency", "image_url", "image_alt", "badge", "origin", "is_featured", "allow_subscription", "is_demo", "sort_order", "seo_title", "seo_description", "is_active", "created_at", "updated_at") SELECT "id", "slug", "name", "short_description", "description", "category", "unit_label", "price_minor", 0, 0, "subscription_price_minor", "compare_at_price_minor", "currency", "image_url", "image_alt", "badge", "origin", "is_featured", "allow_subscription", "is_demo", "sort_order", "seo_title", "seo_description", "is_active", "created_at", "updated_at" FROM `products`;--> statement-breakpoint
DROP TABLE `products`;--> statement-breakpoint
ALTER TABLE `__new_products` RENAME TO `products`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `products_slug_unique` ON `products` (`slug`);--> statement-breakpoint
ALTER TABLE `subscriptions` ADD `cancellation_reason` text;--> statement-breakpoint
UPDATE `products` SET `cost_minor` = 12000, `packaging_cost_minor` = 3500 WHERE `id` = 'prod_kravlje_1l';--> statement-breakpoint
UPDATE `products` SET `cost_minor` = 20000, `packaging_cost_minor` = 3500 WHERE `id` = 'prod_kozje_1l';--> statement-breakpoint
UPDATE `products` SET `cost_minor` = 14000, `packaging_cost_minor` = 3500 WHERE `id` = 'prod_jogurt_1l';--> statement-breakpoint
UPDATE `products` SET `cost_minor` = 28000, `packaging_cost_minor` = 4000 WHERE `id` = 'prod_sir_500g';--> statement-breakpoint
INSERT INTO `settings` (`key`, `value_json`) VALUES ('estimatedDeliveryCostMinor', '25000') ON CONFLICT(`key`) DO NOTHING;--> statement-breakpoint
INSERT INTO `settings` (`key`, `value_json`) VALUES ('paymentFeeBps', '250') ON CONFLICT(`key`) DO NOTHING;--> statement-breakpoint
UPDATE `settings` SET `value_json` = '250000' WHERE `key` = 'freeDeliveryThresholdMinor' AND `value_json` = '0';--> statement-breakpoint
INSERT OR IGNORE INTO `bundles` (`id`, `slug`, `eyebrow`, `name`, `description`, `is_featured`, `is_active`, `sort_order`)
SELECT 'bundle_probni', 'probni-duo', 'Bez obaveze', 'Probni duo', 'Mleko i jogurt samo uz sledeću dostavu. Najlakši način da probate.', 0, 1, 10
WHERE EXISTS (SELECT 1 FROM `products` WHERE `id` = 'prod_kravlje_1l') AND EXISTS (SELECT 1 FROM `products` WHERE `id` = 'prod_jogurt_1l');--> statement-breakpoint
INSERT OR IGNORE INTO `bundles` (`id`, `slug`, `eyebrow`, `name`, `description`, `is_featured`, `is_active`, `sort_order`)
SELECT 'bundle_dorucak', 'nedeljni-dorucak', 'Najčešći izbor', 'Nedeljni doručak', 'Dva mleka i jedan jogurt svake nedelje. Kompletan ritam jednim klikom.', 1, 1, 20
WHERE EXISTS (SELECT 1 FROM `products` WHERE `id` = 'prod_kravlje_1l') AND EXISTS (SELECT 1 FROM `products` WHERE `id` = 'prod_jogurt_1l');--> statement-breakpoint
INSERT OR IGNORE INTO `bundles` (`id`, `slug`, `eyebrow`, `name`, `description`, `is_featured`, `is_active`, `sort_order`)
SELECT 'bundle_porodicni', 'porodicna-kombinacija', 'Mešani ritam', 'Porodična kombinacija', 'Nedeljno, dvonedeljno i jednokratno — sve u jednoj korpi.', 0, 1, 30
WHERE EXISTS (SELECT 1 FROM `products` WHERE `id` = 'prod_kravlje_1l') AND EXISTS (SELECT 1 FROM `products` WHERE `id` = 'prod_kozje_1l') AND EXISTS (SELECT 1 FROM `products` WHERE `id` = 'prod_sir_500g');--> statement-breakpoint
INSERT OR IGNORE INTO `bundle_items` (`id`, `bundle_id`, `product_id`, `quantity`, `purchase_type`, `cadence`, `sort_order`) SELECT 'bli_probni_mleko', 'bundle_probni', 'prod_kravlje_1l', 1, 'one_time', NULL, 0 WHERE EXISTS (SELECT 1 FROM `bundles` WHERE `id` = 'bundle_probni');--> statement-breakpoint
INSERT OR IGNORE INTO `bundle_items` (`id`, `bundle_id`, `product_id`, `quantity`, `purchase_type`, `cadence`, `sort_order`) SELECT 'bli_probni_jogurt', 'bundle_probni', 'prod_jogurt_1l', 1, 'one_time', NULL, 1 WHERE EXISTS (SELECT 1 FROM `bundles` WHERE `id` = 'bundle_probni');--> statement-breakpoint
INSERT OR IGNORE INTO `bundle_items` (`id`, `bundle_id`, `product_id`, `quantity`, `purchase_type`, `cadence`, `sort_order`) SELECT 'bli_dorucak_mleko', 'bundle_dorucak', 'prod_kravlje_1l', 2, 'subscription', 'weekly', 0 WHERE EXISTS (SELECT 1 FROM `bundles` WHERE `id` = 'bundle_dorucak');--> statement-breakpoint
INSERT OR IGNORE INTO `bundle_items` (`id`, `bundle_id`, `product_id`, `quantity`, `purchase_type`, `cadence`, `sort_order`) SELECT 'bli_dorucak_jogurt', 'bundle_dorucak', 'prod_jogurt_1l', 1, 'subscription', 'weekly', 1 WHERE EXISTS (SELECT 1 FROM `bundles` WHERE `id` = 'bundle_dorucak');--> statement-breakpoint
INSERT OR IGNORE INTO `bundle_items` (`id`, `bundle_id`, `product_id`, `quantity`, `purchase_type`, `cadence`, `sort_order`) SELECT 'bli_porodicni_mleko', 'bundle_porodicni', 'prod_kravlje_1l', 2, 'subscription', 'weekly', 0 WHERE EXISTS (SELECT 1 FROM `bundles` WHERE `id` = 'bundle_porodicni');--> statement-breakpoint
INSERT OR IGNORE INTO `bundle_items` (`id`, `bundle_id`, `product_id`, `quantity`, `purchase_type`, `cadence`, `sort_order`) SELECT 'bli_porodicni_kozje', 'bundle_porodicni', 'prod_kozje_1l', 1, 'subscription', 'biweekly', 1 WHERE EXISTS (SELECT 1 FROM `bundles` WHERE `id` = 'bundle_porodicni');--> statement-breakpoint
INSERT OR IGNORE INTO `bundle_items` (`id`, `bundle_id`, `product_id`, `quantity`, `purchase_type`, `cadence`, `sort_order`) SELECT 'bli_porodicni_sir', 'bundle_porodicni', 'prod_sir_500g', 1, 'one_time', NULL, 2 WHERE EXISTS (SELECT 1 FROM `bundles` WHERE `id` = 'bundle_porodicni');--> statement-breakpoint
PRAGMA optimize;
