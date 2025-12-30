-- Migration: Fix Credit Clawback System
-- Description: Update clawback RPCs to use dual-pool schema and implement dispute tracking
-- Date: 2025-12-29
-- Context: The clawback_credits RPC references the legacy credits_balance column which was
--          renamed to subscription_credits_balance. This migration updates all clawback
--          functions to work with the dual-pool schema (subscription + purchased credits).

-- ============================================
-- Step 1: Add credit_pool column to credit_transactions
-- ============================================

ALTER TABLE credit_transactions
ADD COLUMN IF NOT EXISTS credit_pool TEXT
CHECK (credit_pool IN ('subscription', 'purchased', 'mixed'));

COMMENT ON COLUMN credit_transactions.credit_pool IS
'Tracks which credit pool the transaction affects: subscription (expires), purchased (never expires), or mixed (both)';

-- Backfill existing transactions based on type
UPDATE credit_transactions
SET credit_pool = CASE
    WHEN transaction_type = 'subscription' THEN 'subscription'
    WHEN transaction_type = 'purchase' THEN 'purchased'
    WHEN transaction_type IN ('refund', 'clawback') THEN 'mixed'
    ELSE 'mixed'
END
WHERE credit_pool IS NULL;

-- ============================================
-- Step 2: Add dispute_status to profiles
-- ============================================

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS dispute_status TEXT DEFAULT 'none'
CHECK (dispute_status IN ('none', 'pending', 'resolved', 'lost'));

COMMENT ON COLUMN profiles.dispute_status IS
'Tracks dispute status for account flagging during chargebacks and disputes';

-- ============================================
-- Step 3: Create dispute_events table
-- ============================================

CREATE TABLE IF NOT EXISTS dispute_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dispute_id TEXT NOT NULL,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    charge_id TEXT,
    amount_cents INTEGER NOT NULL,
    credits_held INTEGER NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('created', 'updated', 'closed', 'won')),
    reason TEXT,
    evidence_due_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_dispute_events_user_id ON dispute_events(user_id);
CREATE INDEX idx_dispute_events_dispute_id ON dispute_events(dispute_id);
CREATE INDEX idx_dispute_events_status ON dispute_events(status);

COMMENT ON TABLE dispute_events IS
'Audit trail for Stripe disputes with credit holds and resolution tracking';

-- ============================================
-- Step 4: Create clawback_credits_v2 function
-- ============================================

CREATE OR REPLACE FUNCTION clawback_credits_v2(
    p_target_user_id UUID,
    p_amount INTEGER,
    p_reason TEXT DEFAULT 'Refund',
    p_ref_id TEXT DEFAULT NULL,
    p_pool TEXT DEFAULT 'auto' -- 'subscription', 'purchased', or 'auto'
)
RETURNS TABLE (
    success BOOLEAN,
    subscription_clawed INTEGER,
    purchased_clawed INTEGER,
    new_subscription_balance INTEGER,
    new_purchased_balance INTEGER,
    error_message TEXT
) AS $$
DECLARE
    current_sub INTEGER;
    current_pur INTEGER;
    from_sub INTEGER := 0;
    from_pur INTEGER := 0;
    amount_remaining INTEGER;
BEGIN
    -- Lock and get balances
    SELECT subscription_credits_balance, purchased_credits_balance
    INTO current_sub, current_pur
    FROM profiles WHERE id = p_target_user_id FOR UPDATE;

    IF current_sub IS NULL THEN
        RETURN QUERY SELECT false, 0, 0, 0, 0, 'User not found'::TEXT;
        RETURN;
    END IF;

    amount_remaining := p_amount;

    -- Determine clawback split based on pool parameter
    IF p_pool = 'subscription' THEN
        -- Clawback from subscription pool first
        from_sub := LEAST(current_sub, amount_remaining);
        amount_remaining := amount_remaining - from_sub;
        from_pur := LEAST(current_pur, amount_remaining);
    ELSIF p_pool = 'purchased' THEN
        -- Clawback from purchased pool first
        from_pur := LEAST(current_pur, amount_remaining);
        amount_remaining := amount_remaining - from_pur;
        from_sub := LEAST(current_sub, amount_remaining);
    ELSE -- 'auto': subscription first (reverse of consumption order - FIFO)
        from_sub := LEAST(current_sub, amount_remaining);
        amount_remaining := amount_remaining - from_sub;
        from_pur := LEAST(current_pur, amount_remaining);
    END IF;

    -- Update balances (constraints prevent negative values)
    UPDATE profiles SET
        subscription_credits_balance = current_sub - from_sub,
        purchased_credits_balance = current_pur - from_pur,
        updated_at = NOW()
    WHERE id = p_target_user_id;

    -- Log transaction with appropriate pool designation
    INSERT INTO credit_transactions (
        user_id,
        amount,
        transaction_type,
        reference_id,
        description,
        credit_pool,
        created_at
    ) VALUES (
        p_target_user_id,
        -(from_sub + from_pur),
        'clawback',
        COALESCE(p_ref_id, 'clawback_v2_' || extract(epoch from now())::text),
        p_reason || ' - ' || (from_sub + from_pur) || ' credits clawed back',
        CASE
            WHEN from_sub > 0 AND from_pur > 0 THEN 'mixed'
            WHEN from_sub > 0 THEN 'subscription'
            ELSE 'purchased'
        END,
        NOW()
    );

    RETURN QUERY SELECT true, from_sub, from_pur,
                        current_sub - from_sub, current_pur - from_pur, NULL::TEXT;
    RETURN;

EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT false, 0, 0, 0, 0, SQLERRM::TEXT;
    RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Step 5: Create clawback_from_transaction_v2 function
-- ============================================

CREATE OR REPLACE FUNCTION clawback_from_transaction_v2(
    p_target_user_id UUID,
    p_original_ref_id TEXT,
    p_reason TEXT DEFAULT 'Full refund'
)
RETURNS TABLE (
    success BOOLEAN,
    credits_clawed_back INTEGER,
    subscription_clawed INTEGER,
    purchased_clawed INTEGER,
    new_subscription_balance INTEGER,
    new_purchased_balance INTEGER,
    error_message TEXT
) AS $$
DECLARE
    total_credits_to_clawback INTEGER;
    pool_to_clawback TEXT;
    clawback_result RECORD;
BEGIN
    -- Find the original transaction to determine credit pool
    SELECT
        COALESCE(SUM(amount), 0),
        COALESCE(MAX(credit_pool), 'mixed')
    INTO total_credits_to_clawback, pool_to_clawback
    FROM credit_transactions
    WHERE user_id = p_target_user_id
        AND reference_id = p_original_ref_id
        AND transaction_type IN ('subscription', 'purchase')
        AND amount > 0; -- Only credit additions

    IF total_credits_to_clawback = 0 THEN
        RETURN QUERY SELECT false, 0, 0, 0, 0, 0, 'No credits found to clawback from transaction'::TEXT;
        RETURN;
    END IF;

    -- Call clawback_credits_v2 with the appropriate pool
    SELECT * INTO clawback_result
    FROM clawback_credits_v2(
        p_target_user_id,
        total_credits_to_clawback,
        p_reason,
        p_original_ref_id || '_clawback',
        pool_to_clawback
    );

    RETURN QUERY SELECT clawback_result.success,
                        total_credits_to_clawback,
                        clawback_result.subscription_clawed,
                        clawback_result.purchased_clawed,
                        clawback_result.new_subscription_balance,
                        clawback_result.new_purchased_balance,
                        clawback_result.error_message;
    RETURN;

EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT false, 0, 0, 0, 0, 0, SQLERRM::TEXT;
    RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Step 6: Create refund_credits_to_pool function
-- ============================================

CREATE OR REPLACE FUNCTION refund_credits_to_pool(
    p_target_user_id UUID,
    p_amount INTEGER,
    p_reason TEXT DEFAULT 'Credit refund',
    p_ref_id TEXT DEFAULT NULL,
    p_pool TEXT DEFAULT 'purchased' -- 'subscription' or 'purchased'
)
RETURNS TABLE (
    success BOOLEAN,
    new_balance INTEGER,
    error_message TEXT
) AS $$
DECLARE
    current_balance INTEGER;
    balance_column TEXT;
BEGIN
    -- Lock and get the appropriate balance
    IF p_pool = 'subscription' THEN
        SELECT subscription_credits_balance INTO current_balance
        FROM profiles WHERE id = p_target_user_id FOR UPDATE;
        balance_column := 'subscription_credits_balance';
    ELSE
        SELECT purchased_credits_balance INTO current_balance
        FROM profiles WHERE id = p_target_user_id FOR UPDATE;
        balance_column := 'purchased_credits_balance';
    END IF;

    IF current_balance IS NULL THEN
        RETURN QUERY SELECT false, 0, 'User not found'::TEXT;
        RETURN;
    END IF;

    -- Update the appropriate balance
    IF p_pool = 'subscription' THEN
        UPDATE profiles SET
            subscription_credits_balance = subscription_credits_balance + p_amount,
            updated_at = NOW()
        WHERE id = p_target_user_id;
    ELSE
        UPDATE profiles SET
            purchased_credits_balance = purchased_credits_balance + p_amount,
            updated_at = NOW()
        WHERE id = p_target_user_id;
    END IF;

    -- Log transaction
    INSERT INTO credit_transactions (
        user_id,
        amount,
        transaction_type,
        reference_id,
        description,
        credit_pool,
        created_at
    ) VALUES (
        p_target_user_id,
        p_amount,
        'refund',
        COALESCE(p_ref_id, 'refund_to_pool_' || extract(epoch from now())::text),
        p_reason || ' - ' || p_amount || ' credits refunded to ' || p_pool,
        p_pool,
        NOW()
    );

    RETURN QUERY SELECT true, current_balance + p_amount, NULL::TEXT;
    RETURN;

EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT false, 0, SQLERRM::TEXT;
    RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Step 7: Create clawback_purchased_credits function
-- ============================================

CREATE OR REPLACE FUNCTION clawback_purchased_credits(
    p_target_user_id UUID,
    p_payment_intent_id TEXT,
    p_reason TEXT DEFAULT 'Credit pack refund'
)
RETURNS TABLE (
    success BOOLEAN,
    credits_clawed_back INTEGER,
    new_balance INTEGER,
    error_message TEXT
) AS $$
DECLARE
    total_credits_to_clawback INTEGER;
    clawback_result RECORD;
BEGIN
    -- Calculate total credits added from this payment intent
    SELECT COALESCE(SUM(amount), 0) INTO total_credits_to_clawback
    FROM credit_transactions
    WHERE user_id = p_target_user_id
        AND reference_id = p_payment_intent_id
        AND transaction_type = 'purchase'
        AND amount > 0;

    IF total_credits_to_clawback = 0 THEN
        RETURN QUERY SELECT false, 0, 0, 'No purchased credits found to clawback'::TEXT;
        RETURN;
    END IF;

    -- Clawback from purchased pool specifically
    SELECT * INTO clawback_result
    FROM clawback_credits_v2(
        p_target_user_id,
        total_credits_to_clawback,
        p_reason,
        p_payment_intent_id || '_clawback',
        'purchased'
    );

    RETURN QUERY SELECT clawback_result.success,
                        total_credits_to_clawback,
                        clawback_result.new_purchased_balance,
                        clawback_result.error_message;
    RETURN;

EXCEPTION WHEN OTHERS THEN
    RETURN QUERY SELECT false, 0, 0, SQLERRM::TEXT;
    RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
