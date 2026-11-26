-- SQLite requires rebuilding the table to expand the kind check.
ALTER TABLE site_leads RENAME TO site_leads_before_chat;
CREATE TABLE site_leads (
 id TEXT PRIMARY KEY,
 kind TEXT NOT NULL CHECK(kind IN ('mlekomat_space','mlekomat_rent','goat_waitlist','chat_support')),
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
INSERT INTO site_leads (id, kind, name, email, phone, city, address, details, locale, status, created_at)
SELECT id, kind, name, email, phone, city, address, details, locale, status, created_at
FROM site_leads_before_chat;
DROP TABLE site_leads_before_chat;
CREATE INDEX site_leads_kind_created ON site_leads(kind, created_at);
