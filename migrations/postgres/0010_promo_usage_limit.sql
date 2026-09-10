CREATE FUNCTION enforce_promo_usage_limit() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.usage_limit IS NOT NULL AND NEW.times_used > NEW.usage_limit AND NEW.times_used > OLD.times_used THEN
    RAISE EXCEPTION 'PROMO_USAGE_LIMIT';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER promo_usage_limit BEFORE UPDATE OF times_used ON promo_codes
FOR EACH ROW EXECUTE FUNCTION enforce_promo_usage_limit();
