-- Enforce the last available redemption inside the checkout transaction.
CREATE TRIGGER promo_usage_limit BEFORE UPDATE OF times_used ON promo_codes
WHEN NEW.usage_limit IS NOT NULL AND NEW.times_used > NEW.usage_limit AND NEW.times_used > OLD.times_used
BEGIN
  SELECT RAISE(ABORT, 'PROMO_USAGE_LIMIT');
END;
