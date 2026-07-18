-- Restore the product contract after incident boundary 229b6b87: abuse prevention
-- changes eligibility only; eligible unique identities always receive exactly 10.

ALTER TABLE public.free_credit_grants
  ADD COLUMN IF NOT EXISTS decision_reason TEXT,
  ADD COLUMN IF NOT EXISTS policy_version TEXT;

ALTER TABLE public.free_credit_grants
  DROP CONSTRAINT IF EXISTS free_credit_grants_ten_credit_policy;

ALTER TABLE public.free_credit_grants
  ADD CONSTRAINT free_credit_grants_ten_credit_policy
  CHECK (
    policy_version IS DISTINCT FROM 'ten_credit_unique_v1'
    OR granted_credits IN (0, 10)
  ) NOT VALID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_credit_transactions_one_positive_welcome_grant
  ON public.credit_transactions (user_id)
  WHERE amount > 0
    AND type = 'bonus'
    AND reference_id LIKE 'free_grant:%';

DROP FUNCTION IF EXISTS public.claim_free_credit_grant(UUID, TEXT, TEXT, INTEGER);

CREATE FUNCTION public.claim_free_credit_grant(
  p_user_id UUID,
  p_ip TEXT,
  p_user_agent TEXT,
  p_requested_credits INTEGER
)
RETURNS TABLE (
  granted_credits INTEGER,
  existing_grant BOOLEAN,
  matched_account_count INTEGER,
  new_total_balance INTEGER,
  decision_reason TEXT,
  policy_version TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_salt TEXT;
  v_identity_hash TEXT;
  v_network_hash TEXT;
  v_existing_grant INTEGER;
  v_existing_reason TEXT;
  v_existing_policy TEXT;
  v_matched_account_count INTEGER;
  v_granted_credits INTEGER;
  v_decision_reason TEXT;
  v_subscription_balance INTEGER;
  v_purchased_balance INTEGER;
BEGIN
  IF p_requested_credits NOT IN (0, 10) THEN
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

  SELECT subscription_credits_balance, purchased_credits_balance
  INTO v_subscription_balance, v_purchased_balance
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User profile not found: %', p_user_id;
  END IF;

  SELECT fcg.granted_credits, fcg.decision_reason, fcg.policy_version
  INTO v_existing_grant, v_existing_reason, v_existing_policy
  FROM public.free_credit_grants fcg
  WHERE fcg.user_id = p_user_id;

  IF FOUND THEN
    RETURN QUERY SELECT
      v_existing_grant,
      true,
      0,
      COALESCE(v_subscription_balance, 0) + COALESCE(v_purchased_balance, 0),
      'existing_user_grant'::TEXT,
      COALESCE(v_existing_policy, 'legacy_pre_ten_credit_v1')::TEXT;
    RETURN;
  END IF;

  SELECT COUNT(*)::INTEGER
  INTO v_matched_account_count
  FROM public.free_credit_grants fcg
  WHERE (fcg.identity_hash = v_identity_hash OR fcg.network_hash = v_network_hash)
    AND fcg.created_at >= NOW() - INTERVAL '90 days';

  v_granted_credits := CASE
    WHEN p_requested_credits = 0 THEN 0
    WHEN v_matched_account_count = 0 THEN 10
    ELSE 0
  END;

  v_decision_reason := CASE
    WHEN p_requested_credits = 0 THEN 'paywalled'
    WHEN v_matched_account_count = 0 THEN 'eligible_unique'
    ELSE 'repeated_identity'
  END;

  IF v_granted_credits > 0 THEN
    PERFORM set_config('app.trusted_credit_operation', 'true', true);

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
      'Initial one-time free credit grant'
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
    v_identity_hash,
    v_network_hash,
    p_user_id,
    v_granted_credits,
    v_decision_reason,
    'ten_credit_unique_v1'
  );

  RETURN QUERY SELECT
    v_granted_credits,
    false,
    v_matched_account_count,
    COALESCE(v_subscription_balance, 0) + COALESCE(v_purchased_balance, 0) + v_granted_credits,
    v_decision_reason,
    'ten_credit_unique_v1'::TEXT;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_free_credit_grant(UUID, TEXT, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_free_credit_grant(UUID, TEXT, TEXT, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.claim_free_credit_grant(UUID, TEXT, TEXT, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_free_credit_grant(UUID, TEXT, TEXT, INTEGER) TO service_role;

COMMENT ON FUNCTION public.claim_free_credit_grant(UUID, TEXT, TEXT, INTEGER) IS
'Atomically records one ten-credit-or-zero welcome decision under the ten_credit_unique_v1 policy.';
