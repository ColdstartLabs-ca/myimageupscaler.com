CREATE OR REPLACE FUNCTION public.cancel_stale_balance_email(
  p_queue_id UUID,
  p_expected_user_id UUID,
  p_expected_campaign_key TEXT,
  p_expected_subscription_balance INTEGER,
  p_expected_purchased_balance INTEGER
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_queue public.email_lifecycle_queue%ROWTYPE;
  v_subscription INTEGER;
  v_purchased INTEGER;
  v_required NUMERIC;
  v_stale BOOLEAN := FALSE;
  v_reason TEXT;
BEGIN
  SELECT * INTO v_queue FROM public.email_lifecycle_queue WHERE id = p_queue_id FOR UPDATE;
  IF NOT FOUND OR v_queue.status <> 'pending' THEN RETURN 'no_op'; END IF;
  IF v_queue.user_id <> p_expected_user_id OR v_queue.campaign_key <> p_expected_campaign_key THEN
    RETURN 'precondition_changed';
  END IF;

  SELECT subscription_credits_balance, purchased_credits_balance
  INTO v_subscription, v_purchased
  FROM public.profiles WHERE id = p_expected_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'precondition_changed'; END IF;
  IF v_subscription <> p_expected_subscription_balance OR v_purchased <> p_expected_purchased_balance THEN
    RETURN 'precondition_changed';
  END IF;

  CASE v_queue.campaign_key
    WHEN 'zero-credits' THEN
      v_stale := v_subscription + v_purchased > 0; v_reason := 'stale_balance_not_zero';
    WHEN 'low-credits' THEN
      v_stale := v_subscription + v_purchased > 4; v_reason := 'stale_balance_above_low_credit_threshold';
    WHEN 'insufficient-credits-finish-image' THEN
      v_required := NULLIF(v_queue.template_data->>'requiredCredits', '')::NUMERIC;
      v_stale := v_required IS NOT NULL AND v_subscription + v_purchased >= v_required;
      v_reason := 'stale_balance_now_sufficient';
    WHEN 'unused-credits-14d' THEN
      v_stale := v_purchased <= 0; v_reason := 'stale_purchased_balance_empty';
    WHEN 'winback-credit-holder-21d' THEN
      v_stale := v_subscription + v_purchased <= 0; v_reason := 'stale_total_balance_empty';
    ELSE RETURN 'precondition_changed';
  END CASE;

  IF NOT v_stale THEN RETURN 'no_op'; END IF;
  UPDATE public.email_lifecycle_queue
  SET status = 'cancelled', reason = v_reason, updated_at = NOW(),
      processing_claim_id = NULL, processing_claimed_at = NULL
  WHERE id = p_queue_id;
  RETURN 'cancelled';
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_stale_balance_email(UUID, UUID, TEXT, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_stale_balance_email(UUID, UUID, TEXT, INTEGER, INTEGER) TO service_role;
