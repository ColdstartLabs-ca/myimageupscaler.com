-- Temporary, service-role-only repair entry point for the reviewed Jul 18+
-- shared-identity reduction cohort. A follow-up migration drops this function
-- immediately after the one-off backfill completes.

CREATE OR REPLACE FUNCTION public.repair_shared_identity_grant(
  p_user_id UUID,
  p_expected_subscription_balance INTEGER,
  p_expected_purchased_balance INTEGER,
  p_expected_granted_credits INTEGER,
  p_target_granted_credits INTEGER,
  p_include_paywalled_five BOOLEAN,
  p_manifest_hash TEXT
)
RETURNS TABLE (
  repair_status TEXT,
  applied_delta INTEGER,
  new_subscription_balance INTEGER,
  new_purchased_balance INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subscription_balance INTEGER;
  v_purchased_balance INTEGER;
  v_subscription_tier TEXT;
  v_region_tier TEXT;
  v_existing_grant INTEGER;
  v_grant_created_at TIMESTAMPTZ;
  v_required_target INTEGER;
  v_delta INTEGER;
  v_reference_id TEXT := 'shared_identity_grant_repair_20260722:' || p_user_id::TEXT;
BEGIN
  IF p_manifest_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'A reviewed SHA-256 manifest hash is required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_reference_id, 0));

  SELECT
    p.subscription_credits_balance,
    p.purchased_credits_balance,
    p.subscription_tier,
    p.region_tier,
    g.granted_credits,
    g.created_at
  INTO
    v_subscription_balance,
    v_purchased_balance,
    v_subscription_tier,
    v_region_tier,
    v_existing_grant,
    v_grant_created_at
  FROM public.profiles p
  JOIN public.free_credit_grants g ON g.user_id = p.id
  WHERE p.id = p_user_id
  FOR UPDATE OF p, g;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'precondition_changed'::TEXT, 0, 0, 0;
    RETURN;
  END IF;

  IF v_subscription_tier IS NOT NULL AND v_subscription_tier <> 'free' THEN
    RETURN QUERY SELECT
      'precondition_changed'::TEXT,
      0,
      v_subscription_balance,
      v_purchased_balance;
    RETURN;
  END IF;

  v_required_target := CASE v_region_tier
    WHEN 'standard' THEN 5
    WHEN 'restricted' THEN 3
    ELSE CASE WHEN p_include_paywalled_five THEN 5 ELSE 0 END
  END;

  IF EXISTS (
    SELECT 1
    FROM public.credit_transactions t
    WHERE t.user_id = p_user_id
      AND t.reference_id = v_reference_id
  ) THEN
    RETURN QUERY SELECT
      'no_op'::TEXT,
      0,
      v_subscription_balance,
      v_purchased_balance;
    RETURN;
  END IF;

  IF v_grant_created_at < TIMESTAMPTZ '2026-07-18T00:00:00Z'
    OR v_subscription_balance IS DISTINCT FROM p_expected_subscription_balance
    OR v_purchased_balance IS DISTINCT FROM p_expected_purchased_balance
    OR v_existing_grant IS DISTINCT FROM p_expected_granted_credits
    OR p_target_granted_credits IS DISTINCT FROM v_required_target
    OR p_target_granted_credits <= v_existing_grant THEN
    RETURN QUERY SELECT
      'precondition_changed'::TEXT,
      0,
      v_subscription_balance,
      v_purchased_balance;
    RETURN;
  END IF;

  v_delta := p_target_granted_credits - v_existing_grant;

  PERFORM set_config('app.trusted_credit_operation', 'true', true);

  UPDATE public.profiles
  SET
    subscription_credits_balance = subscription_credits_balance + v_delta,
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
    v_delta,
    'bonus',
    v_reference_id,
    'Jul 18 shared-identity grant repair from reviewed manifest ' || left(p_manifest_hash, 12)
  );

  UPDATE public.free_credit_grants
  SET granted_credits = p_target_granted_credits
  WHERE user_id = p_user_id;

  RETURN QUERY SELECT
    'applied'::TEXT,
    v_delta,
    v_subscription_balance + v_delta,
    v_purchased_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.repair_shared_identity_grant(
  UUID, INTEGER, INTEGER, INTEGER, INTEGER, BOOLEAN, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.repair_shared_identity_grant(
  UUID, INTEGER, INTEGER, INTEGER, INTEGER, BOOLEAN, TEXT
) FROM anon;
REVOKE ALL ON FUNCTION public.repair_shared_identity_grant(
  UUID, INTEGER, INTEGER, INTEGER, INTEGER, BOOLEAN, TEXT
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.repair_shared_identity_grant(
  UUID, INTEGER, INTEGER, INTEGER, INTEGER, BOOLEAN, TEXT
) TO service_role;

COMMENT ON FUNCTION public.repair_shared_identity_grant(
  UUID, INTEGER, INTEGER, INTEGER, INTEGER, BOOLEAN, TEXT
) IS 'Applies one manifest-gated, compare-and-skip Jul 18 shared-identity grant repair.';
