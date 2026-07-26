-- ============================================================================
-- Migration: Fix admin_adjust_credits to work with credit protection trigger
-- ============================================================================
-- The admin_adjust_credits function was created before the credit protection
-- trigger in 20250221_secure_credits.sql. It needs to set the trusted flag
-- to bypass the trigger that prevents direct credit balance updates.
-- ============================================================================

-- Update admin_adjust_credits to set the trusted operation flag
CREATE OR REPLACE FUNCTION admin_adjust_credits(
    target_user_id UUID,
    adjustment_amount INTEGER,
    adjustment_reason TEXT
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    caller_role TEXT;
    new_balance INTEGER;
BEGIN
    -- Verify caller is admin
    SELECT role INTO caller_role FROM profiles WHERE id = auth.uid();
    IF caller_role != 'admin' THEN
        RAISE EXCEPTION 'Unauthorized: Admin role required';
    END IF;

    -- Set trusted operation flag to bypass the credit protection trigger
    PERFORM set_config('app.trusted_credit_operation', 'true', true);

    -- Update credits balance
    UPDATE profiles
    SET credits_balance = credits_balance + adjustment_amount,
        updated_at = NOW()
    WHERE id = target_user_id
    RETURNING credits_balance INTO new_balance;

    IF new_balance IS NULL THEN
        RAISE EXCEPTION 'User not found: %', target_user_id;
    END IF;

    -- Log the transaction
    INSERT INTO credit_transactions (
        user_id,
        amount,
        type,
        reference_id,
        description
    ) VALUES (
        target_user_id,
        adjustment_amount,
        'bonus',
        'admin_' || auth.uid()::TEXT || '_' || NOW()::TEXT,
        adjustment_reason
    );

    RETURN new_balance;
END;
$$;

-- Ensure authenticated users can still call this function
-- (the function itself verifies admin role internally)
GRANT EXECUTE ON FUNCTION admin_adjust_credits(UUID, INTEGER, TEXT) TO authenticated;
