-- Keep checkout consent separate from an already-active auto top-up setting.
-- A customer abandoning a new checkout must not disable the old consent.
CREATE TABLE IF NOT EXISTS public.auto_top_up_checkout_consents (
  consent_version uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  checkout_session_id text UNIQUE,
  threshold_credits integer NOT NULL CHECK (threshold_credits BETWEEN 1 AND 50),
  pack_key text NOT NULL CHECK (pack_key IN ('small', 'medium')),
  stripe_price_id text NOT NULL,
  stripe_customer_id text NOT NULL,
  consented_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_auto_top_up_checkout_consents_user
  ON public.auto_top_up_checkout_consents(user_id, created_at DESC);

ALTER TABLE public.auto_top_up_checkout_consents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role manages auto top up checkout consents"
  ON public.auto_top_up_checkout_consents;
CREATE POLICY "Service role manages auto top up checkout consents"
  ON public.auto_top_up_checkout_consents FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Keep the database invariant aligned with the UI and API validation.
UPDATE public.auto_top_up_settings
SET threshold_credits = 50
WHERE threshold_credits > 50;
ALTER TABLE public.auto_top_up_settings
  DROP CONSTRAINT IF EXISTS auto_top_up_settings_threshold_credits_check;
ALTER TABLE public.auto_top_up_settings
  ADD CONSTRAINT auto_top_up_settings_threshold_credits_check
  CHECK (threshold_credits BETWEEN 1 AND 50);

ALTER TABLE public.auto_top_up_attempts
  ADD COLUMN IF NOT EXISTS failure_notification_claim_id uuid,
  ADD COLUMN IF NOT EXISTS failure_notification_claimed_at timestamptz;

CREATE OR REPLACE FUNCTION public.claim_auto_top_up_failure_notification(
  p_attempt_id uuid,
  p_claim_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.auto_top_up_attempts
  SET failure_notification_claim_id = p_claim_id,
      failure_notification_claimed_at = now(),
      updated_at = now()
  WHERE id = p_attempt_id
    AND failure_notification_pending = true
    AND (
      failure_notification_claim_id IS NULL
      OR failure_notification_claimed_at < now() - interval '10 minutes'
    );
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_auto_top_up_failure_notification(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_auto_top_up_failure_notification(uuid, uuid)
  TO service_role;

-- A failed attempt is finalized exactly once. A repeated Stripe webhook must
-- not re-increment failures or emit a second analytics/email notification.
CREATE OR REPLACE FUNCTION public.finalize_auto_top_up_failure(
  p_attempt_id uuid,
  p_payment_intent_id text,
  p_error_class text
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt public.auto_top_up_attempts%ROWTYPE;
  v_failures integer;
BEGIN
  SELECT * INTO v_attempt
  FROM public.auto_top_up_attempts
  WHERE id = p_attempt_id AND stripe_payment_intent_id = p_payment_intent_id
  FOR UPDATE;

  IF NOT FOUND OR v_attempt.status <> 'payment_pending' THEN
    RETURN NULL;
  END IF;

  UPDATE public.auto_top_up_attempts
  SET status = 'failed',
      error_class = p_error_class,
      failure_notification_pending = true,
      updated_at = now()
  WHERE id = p_attempt_id;

  UPDATE public.auto_top_up_settings
  SET consecutive_failures = consecutive_failures + 1,
      enabled = (consecutive_failures + 1) < 3,
      failure_reason = p_error_class,
      charge_claim_id = NULL,
      charge_claimed_at = NULL,
      updated_at = now()
  WHERE user_id = v_attempt.user_id AND charge_claim_id = p_attempt_id
  RETURNING consecutive_failures INTO v_failures;

  IF v_failures IS NULL THEN
    RAISE EXCEPTION 'matching auto top-up lease not found';
  END IF;
  RETURN v_failures;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_auto_top_up_failure(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_auto_top_up_failure(uuid, text, text)
  TO service_role;
