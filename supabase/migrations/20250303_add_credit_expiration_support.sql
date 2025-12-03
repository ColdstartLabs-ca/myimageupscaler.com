-- Migration: Add Credit Expiration Support
-- Description: Add support for credit expiration tracking and management
-- Date: 2025-12-03

-- ============================================
-- Step 1: Add 'expired' type to credit_transactions
-- ============================================

-- Drop existing constraint if it exists
ALTER TABLE credit_transactions
DROP CONSTRAINT IF EXISTS credit_transactions_type_check;

-- Add new constraint with 'expired' type
ALTER TABLE credit_transactions
ADD CONSTRAINT credit_transactions_type_check
CHECK (type IN ('usage', 'subscription', 'purchase', 'refund', 'bonus', 'expired'));

COMMENT ON CONSTRAINT credit_transactions_type_check ON credit_transactions IS
'Valid transaction types: usage (credit spent), subscription (monthly allocation), purchase (one-time buy), refund (credit return), bonus (promotional credit), expired (credits removed at cycle end)';

-- ============================================
-- Step 2: Create credit_expiration_events table
-- ============================================

CREATE TABLE IF NOT EXISTS credit_expiration_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    expired_amount INTEGER NOT NULL CHECK (expired_amount >= 0),
    expiration_reason TEXT NOT NULL CHECK (expiration_reason IN ('cycle_end', 'rolling_window', 'subscription_canceled')),
    billing_cycle_end TIMESTAMPTZ,
    subscription_id TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Add indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_credit_expiration_user ON credit_expiration_events(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_expiration_date ON credit_expiration_events(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_credit_expiration_reason ON credit_expiration_events(expiration_reason);

-- Add RLS policies
ALTER TABLE credit_expiration_events ENABLE ROW LEVEL SECURITY;

-- Users can view their own expiration events
CREATE POLICY "Users can view their own expiration events" ON credit_expiration_events
    FOR SELECT
    USING (auth.uid() = user_id);

-- Only service role can insert expiration events
CREATE POLICY "Only service role can insert expiration events" ON credit_expiration_events
    FOR INSERT
    WITH CHECK (auth.role() = 'service_role');

COMMENT ON TABLE credit_expiration_events IS
'Tracks credit expiration events for analytics and audit purposes. Records when credits are expired, why they were expired, and how many were removed.';

-- ============================================
-- Step 3: Create RPC function for expiring credits
-- ============================================

CREATE OR REPLACE FUNCTION expire_credits_at_cycle_end(
    target_user_id UUID,
    expiration_reason TEXT DEFAULT 'cycle_end',
    subscription_stripe_id TEXT DEFAULT NULL,
    cycle_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    expired_amount INTEGER;
    transaction_description TEXT;
BEGIN
    -- Validate expiration reason
    IF expiration_reason NOT IN ('cycle_end', 'rolling_window', 'subscription_canceled') THEN
        RAISE EXCEPTION 'Invalid expiration_reason: %. Must be one of: cycle_end, rolling_window, subscription_canceled', expiration_reason;
    END IF;

    -- Get current balance (lock row for update)
    SELECT credits_balance INTO expired_amount
    FROM profiles
    WHERE id = target_user_id
    FOR UPDATE;

    -- If user not found or balance is 0 or negative, nothing to expire
    IF expired_amount IS NULL OR expired_amount <= 0 THEN
        RETURN 0;
    END IF;

    -- Reset balance to 0
    UPDATE profiles
    SET
        credits_balance = 0,
        updated_at = NOW()
    WHERE id = target_user_id;

    -- Build transaction description
    CASE expiration_reason
        WHEN 'cycle_end' THEN
            transaction_description := 'Credits expired at billing cycle end';
        WHEN 'rolling_window' THEN
            transaction_description := 'Credits expired (rolling window)';
        WHEN 'subscription_canceled' THEN
            transaction_description := 'Credits expired (subscription canceled)';
        ELSE
            transaction_description := 'Credits expired';
    END CASE;

    -- Log expiration as negative transaction
    INSERT INTO credit_transactions (
        user_id,
        amount,
        type,
        description,
        ref_id,
        created_at
    ) VALUES (
        target_user_id,
        -expired_amount,
        'expired',
        transaction_description,
        subscription_stripe_id,
        NOW()
    );

    -- Log to expiration events table
    INSERT INTO credit_expiration_events (
        user_id,
        expired_amount,
        expiration_reason,
        billing_cycle_end,
        subscription_id,
        notes,
        created_at
    ) VALUES (
        target_user_id,
        expired_amount,
        expiration_reason,
        cycle_end_date,
        subscription_stripe_id,
        transaction_description,
        NOW()
    );

    -- Raise info log for monitoring
    RAISE INFO 'Expired % credits for user % (reason: %)', expired_amount, target_user_id, expiration_reason;

    RETURN expired_amount;
END;
$$;

-- Grant execute to service_role only
REVOKE ALL ON FUNCTION expire_credits_at_cycle_end(UUID, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION expire_credits_at_cycle_end(UUID, TEXT, TEXT, TIMESTAMPTZ) FROM authenticated;
GRANT EXECUTE ON FUNCTION expire_credits_at_cycle_end(UUID, TEXT, TEXT, TIMESTAMPTZ) TO service_role;

COMMENT ON FUNCTION expire_credits_at_cycle_end IS
'Expires all credits for a user and logs the expiration event. Returns the number of credits expired. Called by subscription renewal webhooks when credits should expire at cycle end.';

-- ============================================
-- Step 4: Add helper function to check if credits will expire soon
-- ============================================

CREATE OR REPLACE FUNCTION get_users_with_expiring_credits(
    days_until_expiration INTEGER DEFAULT 7
)
RETURNS TABLE (
    user_id UUID,
    email TEXT,
    credits_balance INTEGER,
    subscription_id TEXT,
    current_period_end TIMESTAMPTZ,
    days_remaining INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    RETURN QUERY
    SELECT
        p.id AS user_id,
        p.email,
        p.credits_balance,
        s.stripe_subscription_id AS subscription_id,
        s.current_period_end,
        EXTRACT(DAY FROM (s.current_period_end - NOW()))::INTEGER AS days_remaining
    FROM profiles p
    INNER JOIN subscriptions s ON p.id = s.user_id
    WHERE
        s.status IN ('active', 'trialing')
        AND s.current_period_end IS NOT NULL
        AND s.current_period_end > NOW()
        AND EXTRACT(DAY FROM (s.current_period_end - NOW())) <= days_until_expiration
        AND p.credits_balance > 0
    ORDER BY s.current_period_end ASC;
END;
$$;

-- Grant execute to service_role only (for scheduled jobs)
REVOKE ALL ON FUNCTION get_users_with_expiring_credits(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION get_users_with_expiring_credits(INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION get_users_with_expiring_credits(INTEGER) TO service_role;

COMMENT ON FUNCTION get_users_with_expiring_credits IS
'Returns list of users whose credits will expire soon (within N days). Used for sending expiration warning emails via scheduled jobs.';
