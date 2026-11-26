ALTER TABLE site_leads DROP CONSTRAINT site_leads_kind_check;
ALTER TABLE site_leads ADD CONSTRAINT site_leads_kind_check
 CHECK (kind IN ('mlekomat_space','mlekomat_rent','goat_waitlist','chat_support'));
