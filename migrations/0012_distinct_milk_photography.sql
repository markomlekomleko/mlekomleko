-- Separate product photography; do not override photographs uploaded by the owner.
UPDATE products SET image_url = '/images/catalog/kravlje-mleko-v2.webp', image_alt = 'Kravlje mleko u staklenoj flaši sa krem etiketom i ilustracijom krave', updated_at = CURRENT_TIMESTAMP
WHERE id = 'prod_kravlje_1l' AND image_url IN ('/images/catalog/kravlje-mleko.webp', '/images/catalog/kravlje-mleko.jpg', '/images/catalog/kravlje-mleko.avif', '/images/demo/kravlje-mleko.webp');
UPDATE products SET image_url = '/images/catalog/kozje-mleko-v2.webp', image_alt = 'Kozje mleko u staklenoj flaši sa zelenom etiketom i ilustracijom koze', updated_at = CURRENT_TIMESTAMP
WHERE id = 'prod_kozje_1l' AND image_url IN ('/images/catalog/kozje-mleko.webp', '/images/catalog/kozje-mleko.jpg', '/images/catalog/kozje-mleko.avif', '/images/demo/kozje-mleko.webp');
