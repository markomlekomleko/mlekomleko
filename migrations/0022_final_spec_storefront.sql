-- Final site specification (19 Nov 2026): prices, the 36-hour cutoff before the 07:00
-- route start, goat milk off sale until it is available again, and stored site leads
-- (mlekomat partnership requests and the goat-milk waiting list).
INSERT INTO settings (key, value_json) VALUES ('cutoffHours', '36') ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json;
INSERT INTO settings (key, value_json) VALUES ('deliveryLocalTime', '"07:00"') ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json;
INSERT INTO settings (key, value_json) VALUES ('deliveryFeeMinor', '35000') ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json;
INSERT INTO settings (key, value_json) VALUES ('deliveryWeekdays', '[2,5]') ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json;
UPDATE products SET price_minor = 35000, subscription_price_minor = 25000 WHERE id = 'prod_kravlje_1l';
UPDATE products SET is_active = 0 WHERE id = 'prod_kozje_1l';
CREATE TABLE site_leads (
 id TEXT PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN ('mlekomat_space','mlekomat_rent','goat_waitlist')),
 name TEXT,
 email TEXT,
 phone TEXT,
 city TEXT,
 address TEXT,
 details TEXT,
 locale TEXT,
 status TEXT NOT NULL DEFAULT 'new' CHECK(status IN ('new','handled')),
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX site_leads_kind_created ON site_leads(kind, created_at);
