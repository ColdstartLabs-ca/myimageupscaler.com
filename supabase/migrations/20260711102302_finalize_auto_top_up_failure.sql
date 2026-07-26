ALTER TABLE public.auto_top_up_attempts
  ADD COLUMN failure_notification_pending boolean NOT NULL DEFAULT false,
  ADD COLUMN failure_notified_at timestamptz;

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
  SELECT * INTO v_attempt FROM public.auto_top_up_attempts
  WHERE id = p_attempt_id AND stripe_payment_intent_id = p_payment_intent_id
  FOR UPDATE;
  IF NOT FOUND OR v_attempt.status NOT IN ('payment_pending', 'failed') THEN RETURN NULL; END IF;

  IF v_attempt.status = 'payment_pending' THEN
    UPDATE public.auto_top_up_attempts
    SET status = 'failed', error_class = p_error_class,
        failure_notification_pending = true, updated_at = now()
    WHERE id = p_attempt_id;

    UPDATE public.auto_top_up_settings
    SET consecutive_failures = consecutive_failures + 1,
        enabled = (consecutive_failures + 1) < 3,
        failure_reason = p_error_class,
        charge_claim_id = NULL, charge_claimed_at = NULL, updated_at = now()
    WHERE user_id = v_attempt.user_id AND charge_claim_id = p_attempt_id
    RETURNING consecutive_failures INTO v_failures;
    IF v_failures IS NULL THEN RAISE EXCEPTION 'matching auto top-up lease not found'; END IF;
  ELSE
    SELECT consecutive_failures INTO v_failures
    FROM public.auto_top_up_settings WHERE user_id = v_attempt.user_id;
  END IF;
  RETURN v_failures;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_auto_top_up_failure(uuid, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_auto_top_up_failure(uuid, text, text) TO service_role;
