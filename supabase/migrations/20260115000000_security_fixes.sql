-- Security Fix: Multiple Critical Issues
-- Date: 2026-01-15
-- Reference: docs/audits/security-audit-report.md

-- ============================================
-- CRITICAL-2: Fix admin_adjust_credits for dual-pool schema
-- ============================================
-- Issue: admin_adjust_credits still references the old credits_balance column
-- which was migrated to dual-pool (subscription_credits_balance + purchased_credits_balance)
--
-- Fix: Update function to work with dual-pool schema and add pool selection

CREATE OR REPLACE FUNCTION admin_adjust_credits(
    target_user_id UUID,
    adjustment_amount INTEGER,
    adjustment_reason TEXT,
    target_pool TEXT DEFAULT 'purchased' -- 'subscription' or 'purchased'
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    caller_role TEXT;
    new_balance INTEGER;
    current_sub INTEGER;
    current_purchased INTEGER;
BEGIN
    -- Verify caller is admin
    SELECT role INTO caller_role FROM profiles WHERE id = auth.uid();
    IF caller_role != 'admin' THEN
        RAISE EXCEPTION 'Unauthorized: Admin role required';
    END IF;

    -- Validate target pool
    IF target_pool NOT IN ('subscription', 'purchased') THEN
        RAISE EXCEPTION 'Invalid target pool: %. Must be "subscription" or "purchased"', target_pool;
    END IF;

    -- Set trusted operation flag to bypass the credit protection trigger
    PERFORM set_config('app.trusted_credit_operation', 'true', true);

    -- Get current balances and lock the row
    SELECT subscription_credits_balance, purchased_credits_balance
    INTO current_sub, current_purchased
    FROM profiles
    WHERE id = target_user_id
    FOR UPDATE;

    IF current_sub IS NULL THEN
        RAISE EXCEPTION 'User not found: %', target_user_id;
    END IF;

    -- Update the appropriate balance
    IF target_pool = 'subscription' THEN
        -- Ensure balance doesn't go negative
        IF current_sub + adjustment_amount < 0 THEN
            RAISE EXCEPTION 'Cannot reduce subscription balance below 0. Current: %, Adjustment: %', current_sub, adjustment_amount;
        END IF;

        UPDATE profiles
        SET subscription_credits_balance = subscription_credits_balance + adjustment_amount,
            updated_at = NOW()
        WHERE id = target_user_id
        RETURNING subscription_credits_balance INTO new_balance;
    ELSE
        -- Ensure balance doesn't go negative
        IF current_purchased + adjustment_amount < 0 THEN
            RAISE EXCEPTION 'Cannot reduce purchased balance below 0. Current: %, Adjustment: %', current_purchased, adjustment_amount;
        END IF;

        UPDATE profiles
        SET purchased_credits_balance = purchased_credits_balance + adjustment_amount,
            updated_at = NOW()
        WHERE id = target_user_id
        RETURNING purchased_credits_balance INTO new_balance;
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
        CASE WHEN adjustment_amount >= 0 THEN 'bonus' ELSE 'clawback' END,
        'admin_' || auth.uid()::TEXT || '_' || NOW()::TEXT,
        adjustment_reason || ' (pool: ' || target_pool || ')'
    );

    RETURN new_balance;
END;
$$;

-- Ensure authenticated users can still call this function
-- (the function itself verifies admin role internally)
GRANT EXECUTE ON FUNCTION admin_adjust_credits(UUID, INTEGER, TEXT, TEXT) TO authenticated;

-- ============================================
-- CRITICAL-1: Revoke consume_credits_v2 from authenticated
-- ============================================
-- Issue: consume_credits_v2 was granted to authenticated role in 20251205_update_credit_rpcs.sql
-- This allows any authenticated user to call consume_credits_v2 with another user's UUID,
-- potentially draining their credits.
--
-- Fix: Revoke from authenticated, keep only service_role

-- Revoke from all roles except service_role
REVOKE ALL ON FUNCTION public.consume_credits_v2(UUID, INTEGER, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_credits_v2(UUID, INTEGER, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.consume_credits_v2(UUID, INTEGER, TEXT, TEXT) FROM authenticated;
-- Ensure service_role keeps access
GRANT EXECUTE ON FUNCTION public.consume_credits_v2(UUID, INTEGER, TEXT, TEXT) TO service_role;

-- Verify only service_role can execute
-- (service_role was already granted in the original migration)

COMMENT ON FUNCTION public.consume_credits_v2 IS
'Consumes credits using FIFO order (subscription first, then purchased). Returns breakdown of new balances. SECURITY: Only callable by service_role to prevent cross-user credit manipulation.';

-- ============================================
-- MEDIUM-13: Add positive amount validation to clawback_credits_v2
-- ============================================
-- Issue: clawback_credits_v2 does not validate that p_amount is positive
-- A negative amount could potentially add credits instead of removing them
--
-- Fix: Add validation at the start of the function

CREATE OR REPLACE FUNCTION public.clawback_credits_v2(
    p_user_id UUID,
    p_amount INTEGER,
    p_reference_id TEXT,
    p_description TEXT DEFAULT 'Credit clawback'
)
RETURNS TABLE(
    success BOOLEAN,
    clawed_back_amount INTEGER,
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
    v_from_sub INTEGER := 0;
    v_from_purchased INTEGER := 0;
    v_total_clawback INTEGER := 0;
BEGIN
    -- SECURITY FIX: Validate amount is positive
    IF p_amount <= 0 THEN
        RAISE EXCEPTION 'Clawback amount must be positive: %', p_amount;
    END IF;

    -- Lock row and get current balances
    SELECT subscription_credits_balance, purchased_credits_balance
    INTO v_current_sub, v_current_purchased
    FROM profiles
    WHERE id = p_user_id
    FOR UPDATE;

    IF v_current_sub IS NULL THEN
        RAISE EXCEPTION 'User not found: %', p_user_id;
    END IF;

    -- Calculate clawback amounts (reverse FIFO: purchased first, then subscription)
    -- This is the opposite of consumption to be fair to users
    v_from_purchased := LEAST(v_current_purchased, p_amount);
    v_from_sub := LEAST(v_current_sub, p_amount - v_from_purchased);
    v_total_clawback := v_from_purchased + v_from_sub;

    -- If nothing to claw back, return early
    IF v_total_clawback = 0 THEN
        RETURN QUERY SELECT
            TRUE,
            0,
            v_current_sub,
            v_current_purchased,
            v_current_sub + v_current_purchased;
        RETURN;
    END IF;

    -- Update balances
    UPDATE profiles
    SET
        subscription_credits_balance = subscription_credits_balance - v_from_sub,
        purchased_credits_balance = purchased_credits_balance - v_from_purchased,
        updated_at = NOW()
    WHERE id = p_user_id;

    -- Log the clawback transaction
    INSERT INTO credit_transactions (user_id, amount, type, reference_id, description)
    VALUES (
        p_user_id,
        -v_total_clawback,
        'clawback',
        p_reference_id,
        p_description || CASE
            WHEN v_from_sub > 0 AND v_from_purchased > 0
            THEN format(' (sub: %s, purchased: %s)', v_from_sub, v_from_purchased)
            ELSE ''
        END
    );

    RETURN QUERY SELECT
        TRUE,
        v_total_clawback,
        v_current_sub - v_from_sub,
        v_current_purchased - v_from_purchased,
        (v_current_sub - v_from_sub) + (v_current_purchased - v_from_purchased);
END;
$$;

-- Ensure only service_role can execute
REVOKE ALL ON FUNCTION public.clawback_credits_v2(UUID, INTEGER, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.clawback_credits_v2(UUID, INTEGER, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.clawback_credits_v2(UUID, INTEGER, TEXT, TEXT) TO service_role;

-- ============================================
-- MEDIUM-22: Fix public is_admin function exposure
-- ============================================
-- Issue: Any authenticated user can call is_admin(UUID) to check if any other user is admin
-- This is information disclosure
--
-- Fix: Modify is_admin to only work for the caller's own user ID (auth.uid())
-- If someone tries to check another user's admin status, return false

CREATE OR REPLACE FUNCTION public.is_admin(user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  -- SECURITY FIX: Only allow checking own admin status
  -- Returns false if querying for a different user (prevents info disclosure)
  SELECT CASE
    WHEN user_id = auth.uid() THEN
      EXISTS (
        SELECT 1 FROM profiles
        WHERE id = user_id AND role = 'admin'
      )
    ELSE
      FALSE
  END;
$$;

COMMENT ON FUNCTION public.is_admin IS
'Check if the current user is admin. SECURITY: Only returns true for auth.uid() to prevent information disclosure about other users admin status.';

-- ============================================
-- HIGH-8 & HIGH-9: Atomic database-backed batch limits
-- ============================================
-- Issue #8: Batch limit check and increment are not atomic (TOCTOU race)
-- Issue #9: Batch limits stored in-memory only, lost on restart
--
-- Fix: Create a database table and atomic RPC for batch limit management

-- Create batch_usage table to track hourly batch limits
CREATE TABLE IF NOT EXISTS public.batch_usage (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    window_start TIMESTAMP WITH TIME ZONE NOT NULL,
    count INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(user_id, window_start)
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_batch_usage_user_window ON public.batch_usage(user_id, window_start);
CREATE INDEX IF NOT EXISTS idx_batch_usage_cleanup ON public.batch_usage(window_start);

-- Enable RLS
ALTER TABLE public.batch_usage ENABLE ROW LEVEL SECURITY;

-- Only service_role can access batch_usage (server-side only)
CREATE POLICY "Service role full access to batch_usage"
ON public.batch_usage FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Atomic batch limit check and increment function
-- Returns: { allowed: boolean, current: integer, limit: integer, reset_at: timestamptz }
CREATE OR REPLACE FUNCTION public.check_and_increment_batch_limit(
    p_user_id UUID,
    p_limit INTEGER,
    p_window_hours INTEGER DEFAULT 1
)
RETURNS TABLE(
    allowed BOOLEAN,
    current_count INTEGER,
    batch_limit INTEGER,
    reset_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_window_start TIMESTAMP WITH TIME ZONE;
    v_current_count INTEGER;
    v_reset_at TIMESTAMP WITH TIME ZONE;
BEGIN
    -- Calculate window start (truncate to hour for consistency)
    v_window_start := date_trunc('hour', NOW());
    v_reset_at := v_window_start + (p_window_hours || ' hours')::INTERVAL;

    -- Atomic upsert with increment - prevents race conditions
    INSERT INTO batch_usage (user_id, window_start, count)
    VALUES (p_user_id, v_window_start, 1)
    ON CONFLICT (user_id, window_start)
    DO UPDATE SET
        count = batch_usage.count + 1,
        updated_at = NOW()
    WHERE batch_usage.count < p_limit  -- Only increment if under limit
    RETURNING batch_usage.count INTO v_current_count;

    -- If no row was returned, we're at or over the limit
    IF v_current_count IS NULL THEN
        -- Get the current count (we hit the limit)
        SELECT count INTO v_current_count
        FROM batch_usage
        WHERE user_id = p_user_id AND window_start = v_window_start;

        -- If still null, something went wrong - return safe failure
        IF v_current_count IS NULL THEN
            v_current_count := p_limit;
        END IF;

        RETURN QUERY SELECT FALSE, v_current_count, p_limit, v_reset_at;
        RETURN;
    END IF;

    -- Successfully incremented, return allowed
    RETURN QUERY SELECT TRUE, v_current_count, p_limit, v_reset_at;
END;
$$;

-- Grant execute to service_role only
REVOKE ALL ON FUNCTION public.check_and_increment_batch_limit(UUID, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_and_increment_batch_limit(UUID, INTEGER, INTEGER) TO service_role;

-- Function to get current batch usage (without incrementing)
CREATE OR REPLACE FUNCTION public.get_batch_usage(
    p_user_id UUID,
    p_limit INTEGER,
    p_window_hours INTEGER DEFAULT 1
)
RETURNS TABLE(
    current_count INTEGER,
    batch_limit INTEGER,
    remaining INTEGER,
    reset_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
DECLARE
    v_window_start TIMESTAMP WITH TIME ZONE;
    v_count INTEGER;
    v_reset_at TIMESTAMP WITH TIME ZONE;
BEGIN
    v_window_start := date_trunc('hour', NOW());
    v_reset_at := v_window_start + (p_window_hours || ' hours')::INTERVAL;

    SELECT count INTO v_count
    FROM batch_usage
    WHERE user_id = p_user_id AND window_start = v_window_start;

    v_count := COALESCE(v_count, 0);

    RETURN QUERY SELECT
        v_count,
        p_limit,
        GREATEST(0, p_limit - v_count),
        v_reset_at;
END;
$$;

-- Grant execute to service_role only
REVOKE ALL ON FUNCTION public.get_batch_usage(UUID, INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_batch_usage(UUID, INTEGER, INTEGER) TO service_role;

-- Cleanup function for old batch usage records (run periodically)
CREATE OR REPLACE FUNCTION public.cleanup_old_batch_usage()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM batch_usage
    WHERE window_start < NOW() - INTERVAL '24 hours';
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$;

-- Grant execute to service_role only
REVOKE ALL ON FUNCTION public.cleanup_old_batch_usage() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cleanup_old_batch_usage() TO service_role;

COMMENT ON TABLE public.batch_usage IS
'Tracks hourly batch usage per user for rate limiting. HIGH-8/9 FIX: Database-backed atomic counters.';

COMMENT ON FUNCTION public.check_and_increment_batch_limit IS
'Atomically check and increment batch usage. Prevents TOCTOU race conditions. HIGH-8 FIX.';

-- ============================================
-- MEDIUM-15: Pool-aware refund credits function
-- ============================================
-- Issue: Current refund_credits function does not track which pool credits came from
-- When refunding, credits should ideally go back to the pool they were deducted from
--
-- Fix: Add refund_credits_v2 that accepts pool information and properly tracks the refund

CREATE OR REPLACE FUNCTION public.refund_credits_v2(
    target_user_id UUID,
    amount INTEGER,
    job_id TEXT,
    target_pool TEXT DEFAULT 'purchased', -- 'subscription' or 'purchased'
    p_description TEXT DEFAULT 'Credit refund for failed processing'
)
RETURNS TABLE(
    success BOOLEAN,
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
    v_new_sub INTEGER;
    v_new_purchased INTEGER;
BEGIN
    -- Validate amount
    IF amount <= 0 THEN
        RAISE EXCEPTION 'Refund amount must be positive: %', amount;
    END IF;

    -- Validate pool
    IF target_pool NOT IN ('subscription', 'purchased') THEN
        RAISE EXCEPTION 'Invalid target pool: %. Must be "subscription" or "purchased"', target_pool;
    END IF;

    -- Set trusted operation flag
    PERFORM set_config('app.trusted_credit_operation', 'true', true);

    -- Get current balances and lock row
    SELECT subscription_credits_balance, purchased_credits_balance
    INTO v_current_sub, v_current_purchased
    FROM profiles
    WHERE id = target_user_id
    FOR UPDATE;

    IF v_current_sub IS NULL THEN
        RAISE EXCEPTION 'User not found: %', target_user_id;
    END IF;

    -- Add credits to the appropriate pool
    IF target_pool = 'subscription' THEN
        UPDATE profiles
        SET subscription_credits_balance = subscription_credits_balance + amount,
            updated_at = NOW()
        WHERE id = target_user_id
        RETURNING subscription_credits_balance, purchased_credits_balance
        INTO v_new_sub, v_new_purchased;
    ELSE
        UPDATE profiles
        SET purchased_credits_balance = purchased_credits_balance + amount,
            updated_at = NOW()
        WHERE id = target_user_id
        RETURNING subscription_credits_balance, purchased_credits_balance
        INTO v_new_sub, v_new_purchased;
    END IF;

    -- Log the refund transaction
    INSERT INTO credit_transactions (
        user_id,
        amount,
        type,
        reference_id,
        description
    ) VALUES (
        target_user_id,
        amount,
        'refund',
        'refund_' || job_id,
        p_description || ' (pool: ' || target_pool || ')'
    );

    RETURN QUERY SELECT
        TRUE,
        amount,
        v_new_sub,
        v_new_purchased,
        v_new_sub + v_new_purchased;
END;
$$;

-- Grant execute to service_role only
REVOKE ALL ON FUNCTION public.refund_credits_v2(UUID, INTEGER, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refund_credits_v2(UUID, INTEGER, TEXT, TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION public.refund_credits_v2 IS
'Pool-aware credit refund function. MEDIUM-15 FIX: Tracks which pool credits are refunded to.';
