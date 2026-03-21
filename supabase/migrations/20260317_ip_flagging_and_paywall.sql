-- Index on signup_ip for cross-account lookup
CREATE INDEX IF NOT EXISTS idx_profiles_signup_ip
  ON public.profiles(signup_ip)
  WHERE signup_ip IS NOT NULL;

-- Update region_tier CHECK to support 'paywalled'
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_region_tier_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_region_tier_check
  CHECK (region_tier IN ('standard', 'restricted', 'paywalled'));

-- RPC: check signup IP and flag if threshold reached
CREATE OR REPLACE FUNCTION public.check_signup_ip(
  p_user_id UUID,
  p_ip TEXT
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Guard: skip NULL/empty IPs (local dev, missing header)
  IF p_ip IS NULL OR p_ip = '' THEN
    RETURN;
  END IF;

  -- Count distinct FREE plan users sharing this signup IP
  SELECT COUNT(DISTINCT id) INTO v_count
  FROM public.profiles
  WHERE signup_ip = p_ip
    AND subscription_tier = 'free';

  -- Flag all free accounts sharing this IP if threshold reached
  IF v_count >= 5 THEN
    UPDATE public.profiles
    SET is_flagged_freeloader = true
    WHERE signup_ip = p_ip
      AND subscription_tier = 'free';
  END IF;
END;
$$;

-- Only service_role can call this
REVOKE ALL ON FUNCTION public.check_signup_ip(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_signup_ip(UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.check_signup_ip(UUID, TEXT) TO service_role;
