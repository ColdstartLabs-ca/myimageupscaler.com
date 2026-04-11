-- Free users are stored with subscription_tier = NULL in profiles.
-- Anti-freeloader detection must treat NULL the same as free-tier.

CREATE OR REPLACE FUNCTION public.register_fingerprint(
  p_user_id UUID,
  p_hash TEXT
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  INSERT INTO public.browser_fingerprints(fingerprint_hash, user_id)
  VALUES (p_hash, p_user_id)
  ON CONFLICT (fingerprint_hash, user_id) DO NOTHING;

  SELECT COUNT(DISTINCT bf.user_id) INTO v_count
  FROM public.browser_fingerprints bf
  JOIN public.profiles p ON p.id = bf.user_id
  WHERE bf.fingerprint_hash = p_hash
    AND (p.subscription_tier IS NULL OR p.subscription_tier = 'free');

  IF v_count >= 5 THEN
    UPDATE public.profiles
    SET is_flagged_freeloader = true
    WHERE id IN (
      SELECT DISTINCT bf.user_id
      FROM public.browser_fingerprints bf
      WHERE bf.fingerprint_hash = p_hash
    )
    AND (subscription_tier IS NULL OR subscription_tier = 'free');
  END IF;
END;
$$;

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
  IF p_ip IS NULL OR p_ip = '' THEN
    RETURN;
  END IF;

  SELECT COUNT(DISTINCT id) INTO v_count
  FROM public.profiles
  WHERE signup_ip = p_ip
    AND (subscription_tier IS NULL OR subscription_tier = 'free');

  IF v_count >= 5 THEN
    UPDATE public.profiles
    SET is_flagged_freeloader = true
    WHERE signup_ip = p_ip
      AND (subscription_tier IS NULL OR subscription_tier = 'free');
  END IF;
END;
$$;
