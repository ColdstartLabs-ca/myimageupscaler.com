-- Grant free credits only after server-side identity evaluation. New profiles.
-- start at zero so there is no pre-setup window to consume unrestricted credits.
-- The private salt permits one-way legacy backfill before raw IPs are deleted.

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;

CREATE TABLE IF NOT EXISTS private.free_credit_grant_config (
  singleton BOOLEAN PRIMARY KEY DEFAULT true CHECK (singleton),
  salt TEXT NOT NULL
);

INSERT INTO private.free_credit_grant_config (singleton, salt)
VALUES (
  true,
  replace(gen_random_uuid()::TEXT, '-', '') || replace(gen_random_uuid()::TEXT, '-', '')
)
ON CONFLICT (singleton) DO NOTHING;

REVOKE ALL ON TABLE private.free_credit_grant_config FROM PUBLIC;

CREATE TABLE IF NOT EXISTS public.free_credit_grants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- The primary identity combines IP and User-Agent. network_hash adds a
  -- privacy-preserving legacy-compatible IP comparison without storing raw IP.
  identity_hash TEXT NOT NULL CHECK (identity_hash ~ '^[a-f0-9]{64}$'),
  network_hash TEXT NOT NULL CHECK (network_hash ~ '^[a-f0-9]{64}$'),
  user_id UUID UNIQUE REFERENCES public.profiles(id) ON DELETE SET NULL,
  granted_credits INTEGER NOT NULL CHECK (granted_credits >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_free_credit_grants_identity_created_at
  ON public.free_credit_grants (identity_hash, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_free_credit_grants_network_created_at
  ON public.free_credit_grants (network_hash, created_at DESC);

ALTER TABLE public.free_credit_grants ENABLE ROW LEVEL SECURITY;

-- Backfill real, salted network hashes while signup_ip still exists. This
-- preserves the 90-day reduction rule for legacy accounts after raw IP removal.
WITH config AS (
  SELECT salt FROM private.free_credit_grant_config WHERE singleton = true
), legacy AS (
  SELECT
    p.id,
    encode(
      digest(
        config.salt || ':' || CASE
          WHEN p.signup_ip IS NOT NULL AND btrim(p.signup_ip) <> '' THEN p.signup_ip
          ELSE 'legacy:' || p.id::TEXT
        END,
        'sha256'
      ),
      'hex'
    ) AS network_hash,
    p.created_at
  FROM public.profiles p
  CROSS JOIN config
)
INSERT INTO public.free_credit_grants (
  identity_hash,
  network_hash,
  user_id,
  granted_credits,
  created_at
)
SELECT
  legacy.network_hash,
  legacy.network_hash,
  legacy.id,
  0,
  COALESCE(legacy.created_at, NOW())
FROM legacy
ON CONFLICT (user_id) DO NOTHING;

DROP FUNCTION IF EXISTS public.check_signup_ip(UUID, TEXT);
DROP INDEX IF EXISTS public.idx_profiles_signup_ip;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS signup_ip;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, subscription_credits_balance, purchased_credits_balance)
  VALUES (NEW.id, 0, 0);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_expired_deleted_free_credit_grants()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.free_credit_grants
  WHERE user_id IS NULL
    AND created_at < NOW() - INTERVAL '90 days';
END;
$$;

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
SET search_path = public
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

  -- Serialize shared networks so parallel account creation cannot turn two
  -- first-account grants into two five-credit grants.
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

  SELECT granted_credits
  INTO v_existing_grant
  FROM public.free_credit_grants
  WHERE user_id = p_user_id;

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
  FROM public.free_credit_grants
  WHERE (identity_hash = v_identity_hash OR network_hash = v_network_hash)
    AND created_at >= NOW() - INTERVAL '90 days';

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

-- The grant RPC invokes this cleanup before every decision. Records belonging
-- to active accounts remain as idempotency markers; deleted accounts expire
-- after the 90-day enforcement window.

REVOKE ALL ON FUNCTION public.claim_free_credit_grant(UUID, TEXT, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_free_credit_grant(UUID, TEXT, TEXT, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.claim_free_credit_grant(UUID, TEXT, TEXT, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_free_credit_grant(UUID, TEXT, TEXT, INTEGER) TO service_role;

COMMENT ON TABLE public.free_credit_grants IS
'One privacy-preserving free-credit grant decision per account, retained for 90 days after deletion.';
