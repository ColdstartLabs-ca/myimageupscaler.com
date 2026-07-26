CREATE OR REPLACE FUNCTION public.finalize_auto_top_up_attempt(
  p_attempt_id uuid,
  p_payment_intent_id text,
  p_credits integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt public.auto_top_up_attempts%ROWTYPE;
  v_transaction_id uuid;
BEGIN
  IF p_credits <= 0 THEN
    RAISE EXCEPTION 'Credits must be positive';
  END IF;

  SELECT * INTO v_attempt
  FROM public.auto_top_up_attempts
  WHERE id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND OR v_attempt.stripe_payment_intent_id IS DISTINCT FROM p_payment_intent_id THEN
    RETURN false;
  END IF;

  IF v_attempt.status = 'succeeded' THEN
    RETURN true;
  END IF;
  IF v_attempt.status <> 'payment_pending' THEN
    RETURN false;
  END IF;

  UPDATE public.profiles
  SET purchased_credits_balance = purchased_credits_balance + p_credits
  WHERE id = v_attempt.user_id;

  INSERT INTO public.credit_transactions (user_id, amount, type, reference_id, description)
  VALUES (
    v_attempt.user_id,
    p_credits,
    'purchase',
    'auto_top_up:' || p_payment_intent_id,
    'Automatic credit top-up'
  )
  RETURNING id INTO v_transaction_id;

  UPDATE public.auto_top_up_attempts
  SET status = 'succeeded', credited_transaction_id = v_transaction_id,
      error_class = NULL, updated_at = now()
  WHERE id = p_attempt_id;

  UPDATE public.auto_top_up_settings
  SET charge_claim_id = NULL, charge_claimed_at = NULL,
      consecutive_failures = 0, failure_reason = NULL,
      last_refill_at = now(), updated_at = now()
  WHERE user_id = v_attempt.user_id AND charge_claim_id = p_attempt_id;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_auto_top_up_attempt(uuid, text, integer) FROM PUBLIC, authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_auto_top_up_attempt(uuid, text, integer) TO service_role;
