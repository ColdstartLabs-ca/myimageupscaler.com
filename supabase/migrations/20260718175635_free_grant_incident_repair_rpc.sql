CREATE OR REPLACE FUNCTION public.repair_free_credit_incident_user(
  p_user_id UUID,
  p_expected_subscription_balance INTEGER,
  p_expected_purchased_balance INTEGER,
  p_expected_granted_credits INTEGER,
  p_approved_delta INTEGER,
  p_classification TEXT,
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
  v_existing_grant INTEGER;
  v_salt TEXT;
  v_repair_hash TEXT;
  v_reference_id TEXT := 'free_grant_repair_20260718:' || p_user_id::TEXT;
BEGIN
  IF p_classification NOT IN ('eligible_repair', 'paywalled_zero') THEN
    RAISE EXCEPTION 'Unsupported repair classification';
  END IF;
  IF p_approved_delta < 0 OR p_approved_delta > 10 THEN
    RAISE EXCEPTION 'Approved repair delta must be between zero and ten';
  END IF;
  IF p_classification = 'paywalled_zero' AND p_approved_delta <> 0 THEN
    RAISE EXCEPTION 'Paywalled repair cannot add credits';
  END IF;
  IF p_manifest_hash !~ '^[a-f0-9]{64}$' THEN
    RAISE EXCEPTION 'A reviewed SHA-256 manifest hash is required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended('free-grant-repair:' || p_user_id::TEXT, 0));

  SELECT subscription_credits_balance, purchased_credits_balance
  INTO v_subscription_balance, v_purchased_balance
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT 'precondition_changed'::TEXT, 0, 0, 0;
    RETURN;
  END IF;

  SELECT granted_credits
  INTO v_existing_grant
  FROM public.free_credit_grants
  WHERE user_id = p_user_id;

  IF EXISTS (
    SELECT 1
    FROM public.credit_transactions
    WHERE reference_id = v_reference_id
      AND user_id = p_user_id
      AND amount = p_approved_delta
  ) THEN
    RETURN QUERY SELECT
      'no_op'::TEXT,
      0,
      v_subscription_balance,
      v_purchased_balance;
    RETURN;
  END IF;

  IF v_subscription_balance IS DISTINCT FROM p_expected_subscription_balance
    OR v_purchased_balance IS DISTINCT FROM p_expected_purchased_balance
    OR COALESCE(v_existing_grant, -1) IS DISTINCT FROM p_expected_granted_credits THEN
    RETURN QUERY SELECT
      'precondition_changed'::TEXT,
      0,
      v_subscription_balance,
      v_purchased_balance;
    RETURN;
  END IF;

  SELECT salt INTO v_salt
  FROM private.free_credit_grant_config
  WHERE singleton = true;

  IF v_salt IS NULL THEN
    RAISE EXCEPTION 'Free credit grant identity configuration is missing';
  END IF;

  v_repair_hash := encode(
    digest(v_salt || ':incident-repair-20260718:' || p_user_id::TEXT, 'sha256'),
    'hex'
  );

  IF p_approved_delta > 0 THEN
    PERFORM set_config('app.trusted_credit_operation', 'true', true);

    UPDATE public.profiles
    SET
      subscription_credits_balance = subscription_credits_balance + p_approved_delta,
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
      p_approved_delta,
      'bonus',
      v_reference_id,
      'Missing one-time welcome credits repaired from reviewed incident manifest ' || left(p_manifest_hash, 12)
    );
  END IF;

  INSERT INTO public.free_credit_grants (
    identity_hash,
    network_hash,
    user_id,
    granted_credits,
    decision_reason,
    policy_version
  ) VALUES (
    v_repair_hash,
    v_repair_hash,
    p_user_id,
    CASE WHEN p_classification = 'eligible_repair' THEN 10 ELSE 0 END,
    CASE WHEN p_classification = 'eligible_repair' THEN 'eligible_unique' ELSE 'paywalled' END,
    'ten_credit_unique_v1'
  )
  ON CONFLICT (user_id) DO UPDATE
  SET
    granted_credits = EXCLUDED.granted_credits,
    decision_reason = EXCLUDED.decision_reason,
    policy_version = EXCLUDED.policy_version
  WHERE public.free_credit_grants.granted_credits = p_expected_granted_credits;

  RETURN QUERY SELECT
    'applied'::TEXT,
    p_approved_delta,
    v_subscription_balance + p_approved_delta,
    v_purchased_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.repair_free_credit_incident_user(
  UUID, INTEGER, INTEGER, INTEGER, INTEGER, TEXT, TEXT
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.repair_free_credit_incident_user(
  UUID, INTEGER, INTEGER, INTEGER, INTEGER, TEXT, TEXT
) FROM anon;
REVOKE ALL ON FUNCTION public.repair_free_credit_incident_user(
  UUID, INTEGER, INTEGER, INTEGER, INTEGER, TEXT, TEXT
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.repair_free_credit_incident_user(
  UUID, INTEGER, INTEGER, INTEGER, INTEGER, TEXT, TEXT
) TO service_role;

COMMENT ON FUNCTION public.repair_free_credit_incident_user(
  UUID, INTEGER, INTEGER, INTEGER, INTEGER, TEXT, TEXT
) IS 'Applies one reviewed, compare-and-skip welcome-credit incident repair without changing purchased credits.';
