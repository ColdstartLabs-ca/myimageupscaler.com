-- Make image-processing refunds idempotent and pool-aware.
-- The app deducts subscription credits first, then purchased credits. Failed processing
-- must restore credits to the same pools and must be safe to call from both provider-
-- level and route-level failure handlers.

DROP FUNCTION IF EXISTS public.consume_credits_v2(UUID, INTEGER, TEXT, TEXT);

CREATE OR REPLACE FUNCTION public.consume_credits_v2(
    target_user_id UUID,
    amount INTEGER,
    ref_id TEXT DEFAULT NULL,
    description TEXT DEFAULT NULL
)
RETURNS TABLE(
    new_subscription_balance INTEGER,
    new_purchased_balance INTEGER,
    new_total_balance INTEGER,
    consumed_subscription INTEGER,
    consumed_purchased INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    current_subscription INTEGER;
    current_purchased INTEGER;
    from_subscription INTEGER;
    from_purchased INTEGER;
BEGIN
    IF amount <= 0 THEN
        RAISE EXCEPTION 'Amount must be positive: %', amount;
    END IF;

    SELECT subscription_credits_balance, purchased_credits_balance
    INTO current_subscription, current_purchased
    FROM public.profiles
    WHERE id = target_user_id
    FOR UPDATE;

    IF current_subscription IS NULL THEN
        RAISE EXCEPTION 'User not found: %', target_user_id;
    END IF;

    IF (current_subscription + current_purchased) < amount THEN
        RAISE EXCEPTION 'Insufficient credits. Required: %, Available: %',
            amount, (current_subscription + current_purchased);
    END IF;

    from_subscription := LEAST(current_subscription, amount);
    from_purchased := amount - from_subscription;

    PERFORM set_config('app.trusted_credit_operation', 'true', true);

    UPDATE public.profiles
    SET
        subscription_credits_balance = subscription_credits_balance - from_subscription,
        purchased_credits_balance = purchased_credits_balance - from_purchased
    WHERE id = target_user_id;

    INSERT INTO public.credit_transactions (user_id, amount, type, reference_id, description)
    VALUES (
        target_user_id,
        -amount,
        'usage',
        ref_id,
        COALESCE(description, '') ||
        format(' (sub: %s, purchased: %s)', from_subscription, from_purchased)
    );

    RETURN QUERY
    SELECT
        current_subscription - from_subscription,
        current_purchased - from_purchased,
        (current_subscription - from_subscription) + (current_purchased - from_purchased),
        from_subscription,
        from_purchased;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_credits_v2(UUID, INTEGER, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_credits_v2(UUID, INTEGER, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.consume_credits_v2(UUID, INTEGER, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.consume_credits_v2(UUID, INTEGER, TEXT, TEXT) TO service_role;

CREATE OR REPLACE FUNCTION public.refund_consumed_credits(
    p_user_id UUID,
    p_amount INTEGER,
    p_job_id TEXT,
    p_subscription_amount INTEGER DEFAULT NULL,
    p_purchased_amount INTEGER DEFAULT NULL,
    p_description TEXT DEFAULT 'Credit refund for failed processing'
)
RETURNS TABLE(
    success BOOLEAN,
    already_refunded BOOLEAN,
    refunded_amount INTEGER,
    new_subscription_balance INTEGER,
    new_purchased_balance INTEGER,
    new_total_balance INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_sub INTEGER;
    v_current_purchased INTEGER;
    v_ref_sub INTEGER;
    v_ref_purchased INTEGER;
    v_ref_id TEXT;
    v_new_sub INTEGER;
    v_new_purchased INTEGER;
BEGIN
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Refund amount must be positive: %', p_amount;
    END IF;

    IF p_job_id IS NULL OR btrim(p_job_id) = '' THEN
        RAISE EXCEPTION 'Refund job id is required';
    END IF;

    v_ref_sub := COALESCE(p_subscription_amount, p_amount);
    v_ref_purchased := COALESCE(p_purchased_amount, 0);

    IF v_ref_sub < 0 OR v_ref_purchased < 0 THEN
        RAISE EXCEPTION 'Refund pool amounts must be non-negative';
    END IF;

    IF (v_ref_sub + v_ref_purchased) != p_amount THEN
        RAISE EXCEPTION 'Refund pool amounts (%) do not equal refund amount (%)',
            (v_ref_sub + v_ref_purchased), p_amount;
    END IF;

    v_ref_id := 'refund_' || p_job_id;

    SELECT subscription_credits_balance, purchased_credits_balance
    INTO v_current_sub, v_current_purchased
    FROM public.profiles
    WHERE id = p_user_id
    FOR UPDATE;

    IF v_current_sub IS NULL THEN
        RAISE EXCEPTION 'User not found: %', p_user_id;
    END IF;

    IF EXISTS (
        SELECT 1
        FROM public.credit_transactions
        WHERE user_id = p_user_id
          AND type = 'refund'
          AND reference_id = v_ref_id
    ) THEN
        RETURN QUERY SELECT
            TRUE,
            TRUE,
            0,
            v_current_sub,
            v_current_purchased,
            v_current_sub + v_current_purchased;
        RETURN;
    END IF;

    PERFORM set_config('app.trusted_credit_operation', 'true', true);

    UPDATE public.profiles
    SET
        subscription_credits_balance = subscription_credits_balance + v_ref_sub,
        purchased_credits_balance = purchased_credits_balance + v_ref_purchased,
        updated_at = NOW()
    WHERE id = p_user_id
    RETURNING subscription_credits_balance, purchased_credits_balance
    INTO v_new_sub, v_new_purchased;

    INSERT INTO public.credit_transactions (
        user_id,
        amount,
        type,
        reference_id,
        description
    ) VALUES (
        p_user_id,
        p_amount,
        'refund',
        v_ref_id,
        COALESCE(p_description, 'Credit refund for failed processing') ||
        format(' (sub: %s, purchased: %s)', v_ref_sub, v_ref_purchased)
    );

    RETURN QUERY SELECT
        TRUE,
        FALSE,
        p_amount,
        v_new_sub,
        v_new_purchased,
        v_new_sub + v_new_purchased;
END;
$$;

REVOKE ALL ON FUNCTION public.refund_consumed_credits(UUID, INTEGER, TEXT, INTEGER, INTEGER, TEXT)
FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refund_consumed_credits(UUID, INTEGER, TEXT, INTEGER, INTEGER, TEXT)
FROM anon;
REVOKE ALL ON FUNCTION public.refund_consumed_credits(UUID, INTEGER, TEXT, INTEGER, INTEGER, TEXT)
FROM authenticated;
GRANT EXECUTE ON FUNCTION public.refund_consumed_credits(UUID, INTEGER, TEXT, INTEGER, INTEGER, TEXT)
TO service_role;

COMMENT ON FUNCTION public.refund_consumed_credits IS
'Idempotently refunds failed processing credits to the same subscription/purchased pools consumed by consume_credits_v2.';
