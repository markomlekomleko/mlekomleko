-- PostgreSQL equivalent of 0008_storefront_design.sql.
-- Replace only the original promotional artwork; preserve custom catalog images.
-- These local photos are illustrative assets, ready to be replaced by final packshots.
UPDATE products SET image_url = '/images/demo/kravlje-mleko.webp', image_alt = 'Ilustracija kravljeg mleka u povratnoj staklenoj flaši', updated_at = to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
WHERE id = 'prod_kravlje_1l' AND image_url = 'https://storage.googleapis.com/takeapp/media/cm52rz909000003mhagpjf52k.png';
--> statement-breakpoint
UPDATE products SET image_url = '/images/demo/kozje-mleko.webp', image_alt = 'Ilustracija kozjeg mleka u povratnoj staklenoj flaši', updated_at = to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
WHERE id = 'prod_kozje_1l' AND image_url = 'https://storage.googleapis.com/takeapp/media/cm52vt3e6000a03jq3nsw8bzc.png';
--> statement-breakpoint
UPDATE settings SET value_json = '"Domaće kravlje i kozje mleko u povratnim staklenim flašama. Dostavljamo na vašu adresu."', updated_at = to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
WHERE key = 'heroSubtitle' AND value_json = '"Izaberite kravlje ili kozje mleko, količinu i ritam. Sveže mleko stiže u povratnim staklenim flašama direktno na vašu adresu."';
--> statement-breakpoint
UPDATE settings SET value_json = '"Količina i ritam po vašoj meri"', updated_at = to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
WHERE key = 'trustItemTwo' AND value_json = '"Povratne staklene flaše"';
--> statement-breakpoint
UPDATE settings SET value_json = '"Jednokratno ili redovno"', updated_at = to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
WHERE key = 'trustItemThree' AND value_json = '"Tvrdnje o kvalitetu objavljujemo uz dokumentaciju"';
--> statement-breakpoint
UPDATE products SET short_description = 'Domaće kozje mleko u povratnoj staklenoj flaši. Za vaš svakodnevni ritual.', updated_at = to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
WHERE id = 'prod_kozje_1l' AND short_description = 'Redovno laboratorijski kontrolisano kozje mleko, bez hormona, antibiotika i aditiva.';
--> statement-breakpoint
UPDATE products SET description = 'Punomasno sirovo kravlje mleko sa domaćih farmi, u povratnim staklenim flašama. Izaberite količinu po dostavi i poručite jednokratno ili odaberite nedeljni ili dvonedeljni ritam. Pri narednoj dostavi preuzimamo vaše čiste flaše i donosimo pune.', updated_at = to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
WHERE id = 'prod_kravlje_1l' AND description = 'Kvalitet i punoća pravog domaćeg mleka, sa prirodnim ukusom od kog može da se napravi domaći kajmak. Mleko dolazi sa domaćih farmi koje neguju tradicionalan uzgoj i prirodnu ishranu, bez hormona, antibiotika i aditiva. Isporučuje se u povratnim staklenim flašama koje čuvaju svežinu i smanjuju nepotreban otpad. Izaberite 2, 4 ili 8 litara po dostavi, kao u postojećim paketima od 8, 16 i 32 litra mesečno, ili unesite drugu količinu koja vam odgovara.';
--> statement-breakpoint
UPDATE products SET description = 'Domaće kozje mleko u povratnim staklenim flašama. Izaberite količinu po dostavi i poručite jednokratno ili odaberite nedeljni ili dvonedeljni ritam. Pri narednoj dostavi preuzimamo vaše čiste flaše i donosimo pune.', updated_at = to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
WHERE id = 'prod_kozje_1l' AND description = 'Domaće kozje mleko iz tradicionalnog uzgoja, redovno laboratorijski kontrolisano i bez hormona, antibiotika i aditiva. Prirodan ukus i čist kvalitet stižu u povratnim staklenim flašama, bez plastike i nepotrebnog otpada. Izaberite 2, 4 ili 8 litara po dostavi, kao u postojećim paketima od 8, 16 i 32 litra mesečno, ili unesite drugu količinu koja vam odgovara.';
