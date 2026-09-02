CREATE TABLE `fiscal_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`order_id` text NOT NULL,
	`operation_key` text NOT NULL,
	`kind` text DEFAULT 'normal' NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`provider` text DEFAULT 'badi' NOT NULL,
	`provider_reference` text,
	`invoice_number` text,
	`pdf_url` text,
	`attempts` integer DEFAULT 0 NOT NULL,
	`last_error_code` text,
	`last_error_message` text,
	`requested_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`issued_at` text,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `fiscal_receipts_operation_unique` ON `fiscal_receipts` (`operation_key`);--> statement-breakpoint
CREATE INDEX `fiscal_receipts_order_idx` ON `fiscal_receipts` (`order_id`);--> statement-breakpoint
CREATE INDEX `fiscal_receipts_status_idx` ON `fiscal_receipts` (`status`,`updated_at`);--> statement-breakpoint
ALTER TABLE `next_delivery_addons` ADD `order_id` text REFERENCES orders(id);--> statement-breakpoint
ALTER TABLE `outbox` ADD `idempotency_key` text;--> statement-breakpoint
ALTER TABLE `outbox` ADD `external_id` text;--> statement-breakpoint
ALTER TABLE `outbox` ADD `last_error_code` text;--> statement-breakpoint
ALTER TABLE `outbox` ADD `last_error_message` text;--> statement-breakpoint
CREATE UNIQUE INDEX `outbox_idempotency_unique` ON `outbox` (`idempotency_key`);--> statement-breakpoint
ALTER TABLE `products` ADD `badi_sku` integer;
