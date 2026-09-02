UPDATE `products` SET
  `name` = 'Domaće kravlje mleko',
  `short_description` = 'Punomasno sirovo mleko direktno sa domaćih farmi, u povratnoj staklenoj flaši.',
  `description` = 'Kvalitet i punoća pravog domaćeg mleka, sa prirodnim ukusom od kog može da se napravi domaći kajmak. Mleko dolazi sa domaćih farmi koje neguju tradicionalan uzgoj i prirodnu ishranu, bez hormona, antibiotika i aditiva. Isporučuje se u povratnim staklenim flašama koje čuvaju svežinu i smanjuju nepotreban otpad. Izaberite 2, 4 ili 8 litara po dostavi, kao u postojećim paketima od 8, 16 i 32 litra mesečno, ili unesite drugu količinu koja vam odgovara.',
  `category` = 'Kravlje mleko',
  `unit_label` = '1 L',
  `price_minor` = 25000,
  `subscription_price_minor` = 25000,
  `compare_at_price_minor` = NULL,
  `image_url` = 'https://storage.googleapis.com/takeapp/media/cm52rz909000003mhagpjf52k.png',
  `image_alt` = 'Domaće kravlje mleko Mleko i Mleko',
  `badge` = 'Najčešći izbor',
  `origin` = 'Domaće farme · Srbija',
  `is_featured` = 1,
  `allow_subscription` = 1,
  `is_demo` = 0,
  `sort_order` = 10,
  `seo_title` = 'Domaće kravlje mleko sa dostavom',
  `seo_description` = 'Punomasno sirovo kravlje mleko u povratnoj staklenoj flaši, sa dostavom u Beogradu i Novom Sadu.',
  `is_active` = 1,
  `updated_at` = CURRENT_TIMESTAMP
WHERE `id` = 'prod_kravlje_1l';
--> statement-breakpoint
UPDATE `products` SET
  `name` = 'Domaće kozje mleko',
  `short_description` = 'Redovno laboratorijski kontrolisano kozje mleko, bez hormona, antibiotika i aditiva.',
  `description` = 'Domaće kozje mleko iz tradicionalnog uzgoja, redovno laboratorijski kontrolisano i bez hormona, antibiotika i aditiva. Prirodan ukus i čist kvalitet stižu u povratnim staklenim flašama, bez plastike i nepotrebnog otpada. Izaberite 2, 4 ili 8 litara po dostavi, kao u postojećim paketima od 8, 16 i 32 litra mesečno, ili unesite drugu količinu koja vam odgovara.',
  `category` = 'Kozje mleko',
  `unit_label` = '1 L',
  `price_minor` = 30000,
  `subscription_price_minor` = 30000,
  `compare_at_price_minor` = NULL,
  `image_url` = 'https://storage.googleapis.com/takeapp/media/cm52vt3e6000a03jq3nsw8bzc.png',
  `image_alt` = 'Domaće kozje mleko Mleko i Mleko',
  `badge` = 'Mala serija',
  `origin` = 'Domaće farme · Srbija',
  `is_featured` = 1,
  `allow_subscription` = 1,
  `is_demo` = 0,
  `sort_order` = 20,
  `seo_title` = 'Domaće kozje mleko sa dostavom',
  `seo_description` = 'Domaće kozje mleko u povratnoj staklenoj flaši, sa dostavom u Beogradu i Novom Sadu.',
  `is_active` = 1,
  `updated_at` = CURRENT_TIMESTAMP
WHERE `id` = 'prod_kozje_1l';
--> statement-breakpoint
UPDATE `products`
SET `is_active` = 0, `is_featured` = 0, `updated_at` = CURRENT_TIMESTAMP
WHERE `id` IN ('prod_jogurt_1l', 'prod_sir_500g');
--> statement-breakpoint
UPDATE `bundles` SET `is_active` = 0, `updated_at` = CURRENT_TIMESTAMP;
--> statement-breakpoint
UPDATE `promo_codes` SET `is_active` = 0, `updated_at` = CURRENT_TIMESTAMP WHERE `id` = 'promo_demo_welcome';
--> statement-breakpoint
INSERT INTO `settings` (`key`, `value_json`) VALUES
  ('announcementEnabled', 'true'),
  ('announcementText', '"NAŠE MLEKO DAJE KAJMAK"'),
  ('announcementLinkLabel', '"Pogledaj video"'),
  ('announcementUrl', '"https://www.tiktok.com/@mleko_i_mleko/video/7268735199112924422"'),
  ('heroEyebrow', '"Domaće mleko na kućnu adresu"'),
  ('heroTitle', '"Pravo mleko više nije daleko."'),
  ('heroSubtitle', '"Izaberite kravlje ili kozje mleko, količinu i ritam. Sveže mleko stiže u povratnim staklenim flašama direktno na vašu adresu."'),
  ('heroPrimaryLabel', '"Izaberi mleko"'),
  ('heroPrimaryUrl', '"/prodavnica"'),
  ('serviceAreaTitle', '"Dostava za Beograd i Novi Sad"'),
  ('serviceAreaNote', '"Beograd: utorak i petak · Novi Sad: petak"'),
  ('servicePostalCodes', '["11","21"]'),
  ('deliveryFeeMinor', '35000'),
  ('freeDeliveryThresholdMinor', '0'),
  ('guaranteeTitle', '"Sveže mleko, bez komplikovanja"'),
  ('guaranteeText', '"Količinu i ritam menjate pre roka, a svaku sledeću dostavu možete da preskočite ili pauzirate iz svog naloga."'),
  ('trustItemOne', '"Povratne staklene flaše"'),
  ('trustItemTwo', '"Redovna laboratorijska kontrola"'),
  ('trustItemThree', '"Bez hormona, antibiotika i aditiva"'),
  ('storeDemoMode', 'false')
ON CONFLICT(`key`) DO UPDATE SET `value_json` = excluded.`value_json`;
--> statement-breakpoint
PRAGMA optimize;
