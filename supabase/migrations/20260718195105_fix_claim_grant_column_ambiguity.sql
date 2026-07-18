-- Fix "column reference granted_credits is ambiguous": the RETURNS TABLE output
-- parameter shadows the free_credit_grants column inside the existing-grant lookup.
-- Same function as 20260718194900 with all table references alias-qualified.

CREATE OR REPLACE FUNCTION public.claim_free_credit_grant(
  p_user_id UUID,
  p_ip TEXT,
  p_user_agent TEXT,
  p_requested_credits INTEGER
)
RETURNS TABLE (
  granted_credits INTEGER,
  existing_grant BOOLEAN,
  matched_account_count INTEGER,
  new_total_balance INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_salt TEXT;
  v_identity_hash TEXT;
  v_network_hash TEXT;
  v_existing_grant INTEGER;
  v_matched_account_count INTEGER;
  v_granted_credits INTEGER;
  v_subscription_balance INTEGER;
  v_purchased_balance INTEGER;
BEGIN
  IF p_requested_credits NOT IN (0, 3, 5) THEN
    RAISE EXCEPTION 'Unsupported free credit amount: %', p_requested_credits;
  END IF;

  IF p_ip IS NULL OR btrim(p_ip) = '' OR length(p_ip) > 64 THEN
    RAISE EXCEPTION 'A valid signup IP is required for a free credit grant';
  END IF;

  SELECT salt INTO v_salt
  FROM private.free_credit_grant_config
  WHERE singleton = true;

  IF v_salt IS NULL THEN
    RAISE EXCEPTION 'Free credit grant identity configuration is missing';
  END IF;

  v_network_hash := encode(digest(v_salt || ':' || p_ip, 'sha256'), 'hex');
  v_identity_hash := encode(
    digest(v_salt || ':' || p_ip || ':' || lower(COALESCE(p_user_agent, '')), 'sha256'),
    'hex'
  );

  PERFORM pg_advisory_xact_lock(hashtextextended(v_network_hash, 0));
  PERFORM public.purge_expired_deleted_free_credit_grants();

  SELECT p.subscription_credits_balance, p.purchased_credits_balance
  INTO v_subscription_balance, v_purchased_balance
  FROM public.profiles p
  WHERE p.id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found: %', p_user_id;
  END IF;

  SELECT g.granted_credits
  INTO v_existing_grant
  FROM public.free_credit_grants g
  WHERE g.user_id = p_user_id;

  IF FOUND THEN
    RETURN QUERY SELECT
      v_existing_grant,
      true,
      0,
      COALESCE(v_subscription_balance, 0) + COALESCE(v_purchased_balance, 0);
    RETURN;
  END IF;

  SELECT COUNT(*)::INTEGER
  INTO v_matched_account_count
  FROM public.free_credit_grants g
  WHERE (g.identity_hash = v_identity_hash OR g.network_hash = v_network_hash)
    AND g.created_at >= NOW() - INTERVAL '90 days';

  v_granted_credits := CASE
    WHEN v_matched_account_count = 0 THEN p_requested_credits
    WHEN v_matched_account_count = 1 THEN LEAST(p_requested_credits, 3)
    ELSE 0
  END;

  PERFORM set_config('app.trusted_credit_operation', 'true', true);

  IF v_granted_credits > 0 THEN
    UPDATE public.profiles
    SET
      subscription_credits_balance = COALESCE(subscription_credits_balance, 0) + v_granted_credits,
      updated_at = NOW()
    WHERE id = p_user_id;

    INSERT INTO public.credit_transactions (
      user_id,
      amount,
      type,
      reference_id,
      description
    ) VALUES (
      p_user_id,
      v_granted_credits,
      'bonus',
      'free_grant:' || p_user_id::TEXT,
      'Initial free credit grant'
    );
  END IF;

  INSERT INTO public.free_credit_grants (
    identity_hash,
    network_hash,
    user_id,
    granted_credits
  ) VALUES (
    v_identity_hash,
    v_network_hash,
    p_user_id,
    v_granted_credits
  );

  RETURN QUERY SELECT
    v_granted_credits,
    false,
    v_matched_account_count,
    COALESCE(v_subscription_balance, 0) + COALESCE(v_purchased_balance, 0) + v_granted_credits;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_free_credit_grant(UUID, TEXT, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_free_credit_grant(UUID, TEXT, TEXT, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.claim_free_credit_grant(UUID, TEXT, TEXT, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_free_credit_grant(UUID, TEXT, TEXT, INTEGER) TO service_role;
