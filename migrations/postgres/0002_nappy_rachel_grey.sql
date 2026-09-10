-- PostgreSQL equivalent of 0002_nappy_rachel_grey.sql.
ALTER TABLE "products" ADD "short_description" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "products" ADD "category" text DEFAULT 'Ostalo' NOT NULL;
--> statement-breakpoint
ALTER TABLE "products" ADD "subscription_price_minor" integer;
--> statement-breakpoint
ALTER TABLE "products" ADD "compare_at_price_minor" integer;
--> statement-breakpoint
ALTER TABLE "products" ADD "image_alt" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "products" ADD "badge" text;
--> statement-breakpoint
ALTER TABLE "products" ADD "origin" text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE "products" ADD "is_featured" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "products" ADD "allow_subscription" integer DEFAULT 1 NOT NULL;
--> statement-breakpoint
ALTER TABLE "products" ADD "is_demo" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "products" ADD "sort_order" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "orders" ADD "discount_minor" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "orders" ADD "delivery_fee_minor" integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE "orders" ADD "promo_code" text;
--> statement-breakpoint
CREATE TABLE "analytics_events" (
	"id" text PRIMARY KEY NOT NULL,
	"event_name" text NOT NULL,
	"anonymous_id" text NOT NULL,
	"session_id" text NOT NULL,
	"order_id" text,
	"path" text NOT NULL,
	"properties_json" text DEFAULT '{}' NOT NULL,
	"created_at" text DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')) NOT NULL
);
--> statement-breakpoint
CREATE INDEX "analytics_events_name_created_idx" ON "analytics_events" ("event_name","created_at");
--> statement-breakpoint
CREATE INDEX "analytics_events_session_idx" ON "analytics_events" ("session_id","created_at");
--> statement-breakpoint
CREATE TABLE "promo_codes" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"discount_type" text NOT NULL,
	"discount_value" integer NOT NULL,
	"minimum_order_minor" integer DEFAULT 0 NOT NULL,
	"usage_limit" integer,
	"times_used" integer DEFAULT 0 NOT NULL,
	"starts_at" text,
	"ends_at" text,
	"is_active" integer DEFAULT 1 NOT NULL,
	"created_at" text DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')) NOT NULL,
	"updated_at" text DEFAULT (to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')) NOT NULL,
	CONSTRAINT "promo_codes_value_positive" CHECK("promo_codes"."discount_value" > 0),
	CONSTRAINT "promo_codes_minimum_nonnegative" CHECK("promo_codes"."minimum_order_minor" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "promo_codes_code_unique" ON "promo_codes" ("code");
--> statement-breakpoint
CREATE INDEX "promo_codes_active_idx" ON "promo_codes" ("is_active","starts_at","ends_at");
--> statement-breakpoint
UPDATE "products" SET
  "short_description" = 'Pun ukus svežeg kravljeg mleka za svakodnevnu upotrebu.',
  "description" = 'Demo proizvod za lokalni razvoj. Sveže kravlje mleko u povratnoj staklenoj ambalaži. Zamenite opis, poreklo, deklaraciju i fotografiju stvarnim podacima pre objave.',
  "category" = 'Mleko',
  "subscription_price_minor" = 20900,
  "compare_at_price_minor" = 24000,
  "image_url" = '/images/demo/kravlje-mleko.jpg',
  "image_alt" = 'Demo fotografija staklene flaše kravljeg mleka',
  "badge" = 'Najčešći izbor',
  "origin" = 'Demo farma - zameniti podatak',
  "is_featured" = 1,
  "allow_subscription" = 1,
  "is_demo" = 1,
  "sort_order" = 10
WHERE "id" = 'prod_kravlje_1l';
--> statement-breakpoint
UPDATE "products" SET
  "short_description" = 'Nežan ukus svežeg kozjeg mleka iz male serije.',
  "description" = 'Demo proizvod za lokalni razvoj. Sveže kozje mleko u povratnoj staklenoj ambalaži. Zamenite opis, poreklo, deklaraciju i fotografiju stvarnim podacima pre objave.',
  "category" = 'Mleko',
  "subscription_price_minor" = 30400,
  "compare_at_price_minor" = 35000,
  "image_url" = '/images/demo/kozje-mleko.jpg',
  "image_alt" = 'Demo fotografija staklene flaše kozjeg mleka',
  "badge" = 'Mala serija',
  "origin" = 'Demo farma - zameniti podatak',
  "is_featured" = 1,
  "allow_subscription" = 1,
  "is_demo" = 1,
  "sort_order" = 20
WHERE "id" = 'prod_kozje_1l';
--> statement-breakpoint
UPDATE "products" SET
  "short_description" = 'Gust i blag domaći jogurt za doručak i užinu.',
  "description" = 'Demo proizvod za lokalni razvoj. Domaći jogurt u povratnoj staklenoj tegli. Zamenite opis, poreklo, deklaraciju i fotografiju stvarnim podacima pre objave.',
  "category" = 'Fermentisano',
  "subscription_price_minor" = 22800,
  "compare_at_price_minor" = 26000,
  "image_url" = '/images/demo/jogurt.jpg',
  "image_alt" = 'Demo fotografija tegle domaćeg jogurta',
  "badge" = 'Za doručak',
  "origin" = 'Demo farma - zameniti podatak',
  "is_featured" = 1,
  "allow_subscription" = 1,
  "is_demo" = 1,
  "sort_order" = 30
WHERE "id" = 'prod_jogurt_1l';
--> statement-breakpoint
UPDATE "products" SET
  "short_description" = 'Blag, svež mladi sir za slana i lagana jela.',
  "description" = 'Demo proizvod za lokalni razvoj. Mladi beli sir od 500 g. Zamenite opis, poreklo, deklaraciju i fotografiju stvarnim podacima pre objave.',
  "category" = 'Sir',
  "subscription_price_minor" = 42900,
  "compare_at_price_minor" = 48000,
  "image_url" = '/images/demo/mladi-sir.jpg',
  "image_alt" = 'Demo fotografija mladog belog sira',
  "badge" = 'Samo uz sledeću dostavu',
  "origin" = 'Demo farma - zameniti podatak',
  "is_featured" = 1,
  "allow_subscription" = 1,
  "is_demo" = 1,
  "sort_order" = 40
WHERE "id" = 'prod_sir_500g';
--> statement-breakpoint
INSERT INTO "settings" ("key", "value_json") VALUES
  ('announcementEnabled', 'true'),
  ('announcementText', 'Demo ponuda: 10% popusta uz kod DOBRODOSLI10'),
  ('announcementLinkLabel', 'Pogledaj ponudu'),
  ('announcementUrl', '/prodavnica'),
  ('heroEyebrow', 'Dostava sa farme do vaših vrata'),
  ('heroTitle', 'Pravo mleko. Bez odlaska u nabavku.'),
  ('heroSubtitle', 'Jednom izaberite proizvode i ritam. Mi ih donosimo, a vi menjate, preskačete ili pauzirate kad god vam odgovara.'),
  ('heroPrimaryLabel', 'Sastavi moju dostavu'),
  ('heroPrimaryUrl', '/prodavnica'),
  ('heroSecondaryLabel', 'Kako funkcioniše'),
  ('heroSecondaryUrl', '/kako-funkcionise'),
  ('serviceAreaTitle', 'Proverite sledeću dostavu'),
  ('serviceAreaNote', 'Demo zona: Beograd, Novi Beograd i Zemun'),
  ('servicePostalCodes', '["11000","11070","11080"]'),
  ('deliveryFeeMinor', '0'),
  ('freeDeliveryThresholdMinor', '0'),
  ('routeCapacity', '0'),
  ('guaranteeTitle', 'Dostava bez rizika'),
  ('guaranteeText', 'Ako proizvod stigne oštećen ili isporuka ne ispuni dogovorene uslove, evidentiramo zamenu ili kredit.'),
  ('trustItemOne', 'Redovna dostava bez ugovorne obaveze'),
  ('trustItemTwo', 'Izmena i preskakanje do roka za dostavu'),
  ('trustItemThree', 'Plaćanje karticom ili gotovinom'),
  ('storeDemoMode', 'true');
--> statement-breakpoint
INSERT INTO "promo_codes" ("id", "code", "description", "discount_type", "discount_value", "minimum_order_minor", "usage_limit", "times_used", "is_active") VALUES
  ('promo_demo_welcome', 'DOBRODOSLI10', 'Demo kod za prvu lokalnu probu', 'percent', 10, 0, NULL, 0, 1);
--> statement-breakpoint
