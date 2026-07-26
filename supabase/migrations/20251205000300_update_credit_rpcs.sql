-- Migration: Update Credit RPC Functions for Separate Credit Pools
-- Description: Create new RPC functions that handle subscription vs purchased credits separately
-- Date: 2025-12-05

-- ============================================
-- Function 1: Add Subscription Credits
-- ============================================

CREATE OR REPLACE FUNCTION add_subscription_credits(
    target_user_id UUID,
    amount INTEGER,
    ref_id TEXT DEFAULT NULL,
    description TEXT DEFAULT NULL
)
RETURNS INTEGER -- returns new subscription balance
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_balance INTEGER;
BEGIN
    -- Validate amount
    IF amount <= 0 THEN
        RAISE EXCEPTION 'Amount must be positive: %', amount;
    END IF;

    -- Update subscription credits
    UPDATE profiles
    SET subscription_credits_balance = subscription_credits_balance + amount
    WHERE id = target_user_id
    RETURNING subscription_credits_balance INTO new_balance;

    IF new_balance IS NULL THEN
        RAISE EXCEPTION 'User not found: %', target_user_id;
    END IF;

    -- Log transaction
    INSERT INTO credit_transactions (user_id, amount, type, reference_id, description)
    VALUES (target_user_id, amount, 'subscription', ref_id, description);

    RETURN new_balance;
END;
$$;

-- Grant execute to service_role only (webhooks)
REVOKE ALL ON FUNCTION add_subscription_credits(UUID, INTEGER, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION add_subscription_credits(UUID, INTEGER, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION add_subscription_credits(UUID, INTEGER, TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION add_subscription_credits IS
'Adds credits to subscription balance. Called during subscription renewals. Returns new subscription balance.';

-- ============================================
-- Function 2: Add Purchased Credits
-- ============================================

CREATE OR REPLACE FUNCTION add_purchased_credits(
    target_user_id UUID,
    amount INTEGER,
    ref_id TEXT DEFAULT NULL,
    description TEXT DEFAULT NULL
)
RETURNS INTEGER -- returns new purchased balance
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    new_balance INTEGER;
BEGIN
    -- Validate amount
    IF amount <= 0 THEN
        RAISE EXCEPTION 'Amount must be positive: %', amount;
    END IF;

    -- Update purchased credits
    UPDATE profiles
    SET purchased_credits_balance = purchased_credits_balance + amount
    WHERE id = target_user_id
    RETURNING purchased_credits_balance INTO new_balance;

    IF new_balance IS NULL THEN
        RAISE EXCEPTION 'User not found: %', target_user_id;
    END IF;

    -- Log transaction
    INSERT INTO credit_transactions (user_id, amount, type, reference_id, description)
    VALUES (target_user_id, amount, 'purchase', ref_id, description);

    RETURN new_balance;
END;
$$;

-- Grant execute to service_role only (webhooks)
REVOKE ALL ON FUNCTION add_purchased_credits(UUID, INTEGER, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION add_purchased_credits(UUID, INTEGER, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION add_purchased_credits(UUID, INTEGER, TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION add_purchased_credits IS
'Adds credits to purchased balance. Called when user buys credit packs. Returns new purchased balance.';

-- ============================================
-- Function 3: Consume Credits (FIFO: subscription first, then purchased)
-- ============================================

CREATE OR REPLACE FUNCTION consume_credits_v2(
    target_user_id UUID,
    amount INTEGER,
    ref_id TEXT DEFAULT NULL,
    description TEXT DEFAULT NULL
)
RETURNS TABLE(
    new_subscription_balance INTEGER,
    new_purchased_balance INTEGER,
    new_total_balance INTEGER
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
    -- Validate amount
    IF amount <= 0 THEN
        RAISE EXCEPTION 'Amount must be positive: %', amount;
    END IF;

    -- Lock row and get current balances
    SELECT subscription_credits_balance, purchased_credits_balance
    INTO current_subscription, current_purchased
    FROM profiles
    WHERE id = target_user_id
    FOR UPDATE;

    IF current_subscription IS NULL THEN
        RAISE EXCEPTION 'User not found: %', target_user_id;
    END IF;

    -- Check total balance
    IF (current_subscription + current_purchased) < amount THEN
        RAISE EXCEPTION 'Insufficient credits. Required: %, Available: %',
            amount, (current_subscription + current_purchased);
    END IF;

    -- Calculate split (FIFO: use subscription credits first since they expire)
    from_subscription := LEAST(current_subscription, amount);
    from_purchased := amount - from_subscription;

    -- Update balances atomically
    UPDATE profiles
    SET
        subscription_credits_balance = subscription_credits_balance - from_subscription,
        purchased_credits_balance = purchased_credits_balance - from_purchased
    WHERE id = target_user_id;

    -- Log transaction with breakdown (negative amount for consumption)
    INSERT INTO credit_transactions (user_id, amount, type, reference_id, description)
    VALUES (
        target_user_id,
        -amount,
        'usage',
        ref_id,
        COALESCE(description, '') ||
        CASE WHEN from_subscription > 0 AND from_purchased > 0
             THEN format(' (sub: %s, purchased: %s)', from_subscription, from_purchased)
             ELSE ''
        END
    );

    -- Return updated balances
    RETURN QUERY
    SELECT
        current_subscription - from_subscription,
        current_purchased - from_purchased,
        (current_subscription - from_subscription) + (current_purchased - from_purchased);
END;
$$;

-- Grant execute to service_role and authenticated (processing APIs need this)
GRANT EXECUTE ON FUNCTION consume_credits_v2(UUID, INTEGER, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION consume_credits_v2(UUID, INTEGER, TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION consume_credits_v2 IS
'Consumes credits using FIFO order (subscription first, then purchased). Returns breakdown of new balances. Subscription credits are used first because they expire.';

-- ============================================
-- Function 4: Expire Subscription Credits (Fix for the bug!)
-- ============================================

CREATE OR REPLACE FUNCTION expire_subscription_credits(
    target_user_id UUID,
    expiration_reason TEXT DEFAULT 'cycle_end',
    subscription_stripe_id TEXT DEFAULT NULL,
    cycle_end_date TIMESTAMPTZ DEFAULT NULL
)
RETURNS INTEGER -- returns amount expired
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    expired_amount INTEGER;
BEGIN
    -- Validate expiration reason
    IF expiration_reason NOT IN ('cycle_end', 'rolling_window', 'subscription_canceled') THEN
        RAISE EXCEPTION 'Invalid expiration_reason: %', expiration_reason;
    END IF;

    -- Get current SUBSCRIPTION balance only (lock row)
    SELECT subscription_credits_balance INTO expired_amount
    FROM profiles
    WHERE id = target_user_id
    FOR UPDATE;

    -- If user not found or subscription balance is 0, nothing to expire
    IF expired_amount IS NULL OR expired_amount <= 0 THEN
        RETURN 0;
    END IF;

    -- Reset ONLY subscription balance (purchased credits remain untouched!)
    UPDATE profiles
    SET
        subscription_credits_balance = 0,
        updated_at = NOW()
    WHERE id = target_user_id;

    -- Log expiration transaction
    INSERT INTO credit_transactions (user_id, amount, type, description, reference_id)
    VALUES (
        target_user_id,
        -expired_amount,
        'expired',
        'Subscription credits expired at billing cycle end',
        subscription_stripe_id
    );

    -- Log to expiration events table
    INSERT INTO credit_expiration_events (
        user_id,
        expired_amount,
        expiration_reason,
        billing_cycle_end,
        subscription_id
    ) VALUES (
        target_user_id,
        expired_amount,
        expiration_reason,
        cycle_end_date,
        subscription_stripe_id
    );

    -- Log for monitoring
    RAISE INFO 'Expired % subscription credits for user % (reason: %). Purchased credits preserved.',
        expired_amount, target_user_id, expiration_reason;

    RETURN expired_amount;
END;
$$;

-- Grant execute to service_role only (webhooks)
REVOKE ALL ON FUNCTION expire_subscription_credits(UUID, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION expire_subscription_credits(UUID, TEXT, TEXT, TIMESTAMPTZ) FROM authenticated;
GRANT EXECUTE ON FUNCTION expire_subscription_credits(UUID, TEXT, TEXT, TIMESTAMPTZ) TO service_role;

COMMENT ON FUNCTION expire_subscription_credits IS
'Expires ONLY subscription credits, leaving purchased credits untouched. This fixes the bug where all credits were being wiped. Returns amount expired.';

-- ============================================
-- Backward Compatibility Aliases (Deprecated)
-- ============================================

-- Keep old increment_credits_with_log working by routing to appropriate function
-- Based on transaction_type parameter
CREATE OR REPLACE FUNCTION increment_credits_with_log(
    target_user_id UUID,
    amount INTEGER,
    transaction_type TEXT DEFAULT 'purchase',
    ref_id TEXT DEFAULT NULL,
    description TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result INTEGER;
BEGIN
    -- Route to appropriate function based on transaction type
    IF transaction_type = 'subscription' THEN
        result := add_subscription_credits(target_user_id, amount, ref_id, description);
    ELSE
        -- Default to purchased credits for safety (they never expire)
        result := add_purchased_credits(target_user_id, amount, ref_id, description);
    END IF;

    -- Return total balance for backward compatibility
    SELECT subscription_credits_balance + purchased_credits_balance INTO result
    FROM profiles
    WHERE id = target_user_id;

    RETURN result;
END;
$$;

COMMENT ON FUNCTION increment_credits_with_log IS
'DEPRECATED: Legacy function for backward compatibility. Routes to add_subscription_credits or add_purchased_credits based on transaction_type. Use the specific functions instead.';

-- Keep old decrement function working
CREATE OR REPLACE FUNCTION decrement_credits_with_log(
    target_user_id UUID,
    amount INTEGER,
    transaction_type TEXT DEFAULT 'usage',
    ref_id TEXT DEFAULT NULL,
    description TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    result_record RECORD;
BEGIN
    -- Use new consume_credits_v2 function
    SELECT * INTO result_record
    FROM consume_credits_v2(target_user_id, amount, ref_id, description);

    -- Return total balance for backward compatibility
    RETURN result_record.new_total_balance;
END;
$$;

COMMENT ON FUNCTION decrement_credits_with_log IS
'DEPRECATED: Legacy function for backward compatibility. Uses consume_credits_v2 internally. Use consume_credits_v2 directly for better control.';
