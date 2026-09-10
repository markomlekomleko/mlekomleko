ALTER TABLE `subscriptions` ADD `version` integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key_hash` text NOT NULL,
	`scope` text NOT NULL,
	`window_started_at` text NOT NULL,
	`request_count` integer DEFAULT 1 NOT NULL,
	`expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rate_limits_key_scope_unique` ON `rate_limits` (`key_hash`,`scope`);
--> statement-breakpoint
CREATE INDEX `rate_limits_expires_idx` ON `rate_limits` (`expires_at`);
--> statement-breakpoint
CREATE TABLE `subscription_mutation_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`subscription_id` text NOT NULL,
	`expected_version` integer NOT NULL,
	`mutation_key` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`subscription_id`) REFERENCES `subscriptions`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscription_mutation_version_unique` ON `subscription_mutation_versions` (`subscription_id`,`expected_version`);
--> statement-breakpoint
CREATE UNIQUE INDEX `subscription_mutation_key_unique` ON `subscription_mutation_versions` (`mutation_key`);
--> statement-breakpoint
UPDATE `products` SET `image_url` = '/images/demo/kravlje-mleko.webp', `image_alt` = 'Domaće kravlje mleko u staklenoj flaši' WHERE `slug` = 'kravlje-mleko';
--> statement-breakpoint
UPDATE `products` SET `image_url` = '/images/demo/kozje-mleko.webp', `image_alt` = 'Domaće kozje mleko u staklenoj flaši' WHERE `slug` = 'kozje-mleko';
--> statement-breakpoint
UPDATE `products` SET `short_description` = 'Punomasno kravlje mleko sa domaćih farmi u povratnoj staklenoj flaši.', `description` = 'Punomasno kravlje mleko sa domaćih farmi. Isporučuje se u povratnim staklenim flašama; količinu i ritam birate pri poručivanju.' WHERE `slug` = 'kravlje-mleko';
--> statement-breakpoint
UPDATE `products` SET `short_description` = 'Punomasno kozje mleko sa domaćih farmi u povratnoj staklenoj flaši.', `description` = 'Punomasno kozje mleko sa domaćih farmi. Isporučuje se u povratnim staklenim flašama; količinu i ritam birate pri poručivanju.' WHERE `slug` = 'kozje-mleko';
--> statement-breakpoint
UPDATE `settings` SET `value_json` = '"Povratne staklene flaše"', `updated_at` = CURRENT_TIMESTAMP WHERE `key` = 'trustItemTwo';
--> statement-breakpoint
UPDATE `settings` SET `value_json` = '"Tvrdnje o kvalitetu objavljujemo uz dokumentaciju"', `updated_at` = CURRENT_TIMESTAMP WHERE `key` = 'trustItemThree';
