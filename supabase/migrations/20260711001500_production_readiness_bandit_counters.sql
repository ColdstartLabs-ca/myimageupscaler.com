-- Serialize pricing-bandit counter increments in the database so concurrent
-- checkout webhooks and geo requests cannot overwrite one another.
CREATE OR REPLACE FUNCTION public.increment_pricing_bandit_arm(
  p_arm_id integer,
  p_impressions integer DEFAULT 0,
  p_conversions integer DEFAULT 0,
  p_revenue_cents integer DEFAULT 0
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_impressions < 0 OR p_conversions < 0 OR p_revenue_cents < 0 THEN
    RAISE EXCEPTION 'Bandit counter increments must be non-negative';
  END IF;

  UPDATE public.pricing_bandit_arms
  SET impressions = impressions + p_impressions,
      conversions = conversions + p_conversions,
      revenue_cents = revenue_cents + p_revenue_cents,
      updated_at = now()
  WHERE id = p_arm_id;
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_pricing_bandit_arm(integer, integer, integer, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_pricing_bandit_arm(integer, integer, integer, integer)
  TO service_role;
