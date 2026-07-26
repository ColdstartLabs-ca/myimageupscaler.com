-- Fix infinite recursion in admin RLS policies
-- Migration: 20250203_fix_admin_policy_recursion.sql
-- Description: Uses SECURITY DEFINER function to check admin role without RLS recursion

-- Create a SECURITY DEFINER function to check if user is admin
-- This bypasses RLS to avoid infinite recursion
CREATE OR REPLACE FUNCTION public.is_admin(user_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles
    WHERE id = user_id AND role = 'admin'
  );
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION public.is_admin(UUID) TO authenticated;

-- Drop the recursive policies
DROP POLICY IF EXISTS "Users can view own profile or admins can view all" ON public.profiles;
DROP POLICY IF EXISTS "Users can update own profile or admins can update all" ON public.profiles;

-- Recreate profiles policies using the SECURITY DEFINER function
CREATE POLICY "Users can view own profile or admins can view all"
ON public.profiles FOR SELECT
TO authenticated
USING (
    auth.uid() = id
    OR public.is_admin(auth.uid())
);

CREATE POLICY "Users can update own profile or admins can update all"
ON public.profiles FOR UPDATE
TO authenticated
USING (
    auth.uid() = id
    OR public.is_admin(auth.uid())
);

-- Fix subscriptions policies (drop and recreate)
DROP POLICY IF EXISTS "Admins can view all subscriptions" ON public.subscriptions;
DROP POLICY IF EXISTS "Admins can update all subscriptions" ON public.subscriptions;

CREATE POLICY "Admins can view all subscriptions"
ON public.subscriptions FOR SELECT
TO authenticated
USING (
    user_id = auth.uid()
    OR public.is_admin(auth.uid())
);

CREATE POLICY "Admins can update all subscriptions"
ON public.subscriptions FOR UPDATE
TO authenticated
USING (
    public.is_admin(auth.uid())
);

-- Fix credit_transactions policies (drop and recreate)
DROP POLICY IF EXISTS "Admins can view all credit transactions" ON public.credit_transactions;
DROP POLICY IF EXISTS "Admins can insert credit transactions" ON public.credit_transactions;

CREATE POLICY "Admins can view all credit transactions"
ON public.credit_transactions FOR SELECT
TO authenticated
USING (
    user_id = auth.uid()
    OR public.is_admin(auth.uid())
);

CREATE POLICY "Admins can insert credit transactions"
ON public.credit_transactions FOR INSERT
TO authenticated
WITH CHECK (
    user_id = auth.uid()
    OR public.is_admin(auth.uid())
);
