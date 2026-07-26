-- Add admin role system to profiles table
-- Migration: 20250202_add_admin_role.sql
-- Description: Adds role column and admin access policies

-- Add role column to profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'
CHECK (role IN ('user', 'admin'));

-- Create index for role-based queries
CREATE INDEX IF NOT EXISTS idx_profiles_role ON public.profiles(role);

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

-- New policies allowing admin access
CREATE POLICY "Users can view own profile or admins can view all"
ON public.profiles FOR SELECT
TO authenticated
USING (
    auth.uid() = id
    OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    )
);

CREATE POLICY "Users can update own profile or admins can update all"
ON public.profiles FOR UPDATE
TO authenticated
USING (
    auth.uid() = id
    OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    )
);

-- Admin policy for subscriptions
CREATE POLICY "Admins can view all subscriptions"
ON public.subscriptions FOR SELECT
TO authenticated
USING (
    user_id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    )
);

CREATE POLICY "Admins can update all subscriptions"
ON public.subscriptions FOR UPDATE
TO authenticated
USING (
    EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    )
);

-- Admin policy for credit_transactions
CREATE POLICY "Admins can view all credit transactions"
ON public.credit_transactions FOR SELECT
TO authenticated
USING (
    user_id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    )
);

CREATE POLICY "Admins can insert credit transactions"
ON public.credit_transactions FOR INSERT
TO authenticated
WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    )
);

-- RPC function for admin credit adjustment
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

    -- Update credits balance
    UPDATE profiles
    SET credits_balance = credits_balance + adjustment_amount,
        updated_at = NOW()
    WHERE id = target_user_id
    RETURNING credits_balance INTO new_balance;

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

-- Grant execute permission to authenticated users (function handles auth internally)
GRANT EXECUTE ON FUNCTION admin_adjust_credits(UUID, INTEGER, TEXT) TO authenticated;
