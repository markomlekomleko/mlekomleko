-- Retire development labels without publishing archived products or changing prices.
UPDATE products SET is_demo = 0 WHERE is_demo <> 0;
UPDATE products SET image_url = REPLACE(image_url, '/images/demo/', '/images/catalog/') WHERE image_url LIKE '/images/demo/%';
UPDATE products SET description = '', origin = '' WHERE id IN ('prod_jogurt_1l', 'prod_sir_500g') AND description LIKE 'Demo proizvod za lokalni razvoj.%';
UPDATE products SET image_alt = REPLACE(image_alt, 'Demo fotografija', 'Fotografija') WHERE image_alt LIKE 'Demo fotografija%';
UPDATE promo_codes SET description = 'Popust za prvu porudžbinu' WHERE id = 'promo_demo_welcome' AND description = 'Demo kod za prvu lokalnu probu';
UPDATE settings SET value_json = 'false' WHERE key = 'storeDemoMode';
UPDATE settings SET value_json = '"Plaćanje gotovinom pri dostavi"' WHERE key = 'trustItemThree' AND value_json = '"Plaćanje karticom ili gotovinom"';
