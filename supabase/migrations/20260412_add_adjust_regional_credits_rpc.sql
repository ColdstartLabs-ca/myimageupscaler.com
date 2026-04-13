-- Lightweight RPC for regional free credit adjustments.
-- The anti-freeloader service needs to reduce subscription_credits_balance
-- for users in restricted/paywalled regions. Direct REST API updates are
-- blocked by the prevent_credit_update trigger (which requires
-- app.trusted_credit_operation to be set). This RPC sets that flag,
-- performs the adjustment, and logs a proper 'clawback' transaction.

CREATE OR REPLACE FUNCTION public.adjust_regional_credits(
    p_user_id UUID,
    p_new_balance INTEGER,
    p_description TEXT DEFAULT 'Regional free credit adjustment'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_current_balance INTEGER;
    v_adjustment INTEGER;
BEGIN
    IF p_new_balance < 0 THEN
        RAISE EXCEPTION 'New balance cannot be negative: %', p_new_balance;
    END IF;

    PERFORM set_config('app.trusted_credit_operation', 'true', true);

    SELECT subscription_credits_balance
    INTO v_current_balance
    FROM public.profiles
    WHERE id = p_user_id
    FOR UPDATE;

    IF v_current_balance IS NULL THEN
        RAISE EXCEPTION 'User not found: %', p_user_id;
    END IF;

    v_adjustment := v_current_balance - p_new_balance;

    IF v_adjustment <= 0 THEN
        RETURN v_current_balance;
    END IF;

    UPDATE public.profiles
    SET subscription_credits_balance = p_new_balance,
        updated_at = NOW()
    WHERE id = p_user_id;

    INSERT INTO public.credit_transactions (
        user_id, amount, type, reference_id, description
    ) VALUES (
        p_user_id,
        -v_adjustment,
        'clawback',
        'regional_' || p_user_id::TEXT,
        p_description
    );

    RETURN p_new_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_regional_credits(UUID, INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.adjust_regional_credits(UUID, INTEGER, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_regional_credits(UUID, INTEGER, TEXT) TO service_role;

COMMENT ON FUNCTION public.adjust_regional_credits IS
'Sets subscription_credits_balance to a target value for regional free credit adjustments. Only reduces balance (never increases). Logs as clawback transaction. Service-role only.';
