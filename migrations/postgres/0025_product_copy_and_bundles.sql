-- PostgreSQL twin of migrations/0025_product_copy_and_bundles.sql (same statements and
-- semantics; only the timestamp expression differs).
-- Product copy and packages under the final rules (20 Nov 2026): only cow milk is sold,
-- the subscription is a prepaid package of four weekly deliveries, the customer is
-- addressed with "ti". Every statement targets known ids or exact stale values, so the
-- migration is safe on a live database and changes nothing the owner has already rewritten
-- in settings.

-- 1. Product copy, by product id only.
UPDATE products SET
  short_description = 'Punomasno sirovo kravlje mleko sa farmi sa kojima sarađujemo, u povratnoj staklenoj flaši od 1 l.',
  description = 'Punomasno sirovo kravlje mleko sa domaćih farmi sa kojima sarađujemo, u povratnoj staklenoj flaši od 1 l. Poruči jednokratno ili uzmi pretplatu: paket od četiri nedeljne dostave, istog dana u nedelji, koji plaćaš unapred. Najmanja količina je 2 l po dostavi. Pri sledećoj dostavi preuzimamo tvoje prazne flaše.',
  badge = 'Povratna staklena flaša',
  seo_title = 'Domaće kravlje mleko u staklenoj flaši',
  seo_description = 'Punomasno sirovo kravlje mleko u povratnoj staklenoj flaši, na tvojoj adresi. Jednokratno ili pretplata od četiri nedeljne dostave.',
  updated_at = to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
WHERE id = 'prod_kravlje_1l';

-- Goat milk stays off sale (waiting list); its copy is written so it is already right
-- on the day the owner switches it back on.
UPDATE products SET
  short_description = 'Domaće kozje mleko sa farmi sa kojima sarađujemo, u povratnoj staklenoj flaši od 1 l.',
  description = 'Domaće kozje mleko sa farmi sa kojima sarađujemo, u povratnoj staklenoj flaši od 1 l. Poruči jednokratno ili uzmi pretplatu: paket od četiri nedeljne dostave, istog dana u nedelji, koji plaćaš unapred. Najmanja količina je 2 l po dostavi. Pri sledećoj dostavi preuzimamo tvoje prazne flaše.',
  seo_title = 'Domaće kozje mleko u staklenoj flaši',
  seo_description = 'Domaće kozje mleko u povratnoj staklenoj flaši, na tvojoj adresi. Jednokratno ili pretplata od četiri nedeljne dostave.',
  updated_at = to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
WHERE id = 'prod_kozje_1l';

-- 2. Content settings: only the exact stale texts (goat milk on offer, "vi", a rhythm of
-- the customer's choosing, lowering the quantity) are replaced.
UPDATE settings SET value_json = '"Domaće kravlje mleko u povratnoj staklenoj flaši, na tvojoj adresi. Jednokratno ili kao pretplata od četiri nedeljne dostave."', updated_at = to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
WHERE key = 'heroSubtitle' AND value_json IN (
  '"Domaće kravlje i kozje mleko u povratnim staklenim flašama. Dostavljamo na vašu adresu."',
  '"Jednom izaberite proizvode i ritam. Mi ih donosimo, a vi menjate, preskačete ili pauzirate kad god vam odgovara."'
);
UPDATE settings SET value_json = '"Do roka pred dostavu možeš da dodaš litre, preskočiš dostavu ili pauziraš pretplatu iz svog naloga."', updated_at = to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
WHERE key = 'guaranteeText' AND value_json = '"Količinu i ritam menjate pre roka, a svaku sledeću dostavu možete da preskočite ili pauzirate iz svog naloga."';
UPDATE settings SET value_json = '"Pretplata: četiri nedeljne dostave"', updated_at = to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
WHERE key = 'trustItemTwo' AND value_json = '"Količina i ritam po vašoj meri"';

-- 3. The three seeded packages (goat milk, biweekly rhythm, old prices, all hidden since
-- 0006). Nothing references a package except its own bundle_items rows (orders store
-- products, not packages), so they are deleted outright, items first.
DELETE FROM bundle_items WHERE bundle_id IN ('bundle_probni', 'bundle_dorucak', 'bundle_porodicni');
DELETE FROM bundles WHERE id IN ('bundle_probni', 'bundle_dorucak', 'bundle_porodicni');

-- Any other package that still carries a biweekly line can no longer be sold: hide it.
UPDATE bundles SET is_active = 0, updated_at = to_char(CURRENT_TIMESTAMP AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI:SS')
WHERE is_active = 1 AND id IN (SELECT bundle_id FROM bundle_items WHERE purchase_type = 'subscription' AND (cadence IS NULL OR cadence <> 'weekly'));
