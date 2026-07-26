-- Fix Email/Password Signup Failure
-- Date: 2026-01-20
-- Issue: Email/password signup fails with "Database error saving new user"
-- Root Causes:
--   1. handle_new_user() uses obsolete column name (credits_balance vs subscription_credits_balance)
--   2. Missing search_path in SECURITY DEFINER functions
--   3. Trigger chain may fail if one trigger fails, rolling back the entire user creation

-- ============================================
-- Fix #1: Update handle_new_user() to use correct column names
-- ============================================

-- The migration 20260120_fix_function_search_paths.sql incorrectly used credits_balance
-- which was renamed to subscription_credits_balance in migration 20251205_separate_credit_pools.sql

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert profile with correct column names for dual-pool credit system
  INSERT INTO public.profiles (id, subscription_credits_balance, purchased_credits_balance)
  VALUES (NEW.id, 10, 0);  -- Give new users 10 free subscription credits

  -- Log the welcome bonus transaction
  -- Note: This INSERT may fail if RLS blocks it, but it won't fail user creation
  -- because we use an EXCEPTION block
  BEGIN
    INSERT INTO public.credit_transactions (user_id, amount, type, description)
    VALUES (NEW.id, 10, 'bonus', 'Welcome bonus credits');
  EXCEPTION WHEN OTHERS THEN
    -- Log the error but don't fail the user creation
    RAISE WARNING 'Failed to create welcome bonus transaction for user %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================
-- Fix #2: Update handle_new_user_email_prefs() with proper error handling
-- ============================================

CREATE OR REPLACE FUNCTION public.handle_new_user_email_prefs()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert email preferences with error handling
  BEGIN
    INSERT INTO public.email_preferences (user_id)
    VALUES (NEW.id)
    ON CONFLICT (user_id) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    -- Log the error but don't fail the user creation
    RAISE WARNING 'Failed to create email preferences for user %: %', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================
-- Fix #3: Ensure RLS policies allow inserts from auth triggers
-- ============================================

-- For credit_transactions: Add explicit INSERT policy for service_role
-- This ensures that SECURITY DEFINER functions can insert during signup

DROP POLICY IF EXISTS "Service role can insert transactions" ON public.credit_transactions;

CREATE POLICY "Service role can insert transactions"
  ON public.credit_transactions
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- For email_preferences: Add explicit INSERT policy for service_role

DROP POLICY IF EXISTS "Service role can insert email preferences" ON public.email_preferences;

CREATE POLICY "Service role can insert email preferences"
  ON public.email_preferences
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- For profiles: Ensure service role can insert (should already exist, but verify)

DROP POLICY IF EXISTS "Service role can insert profiles" ON public.profiles;

CREATE POLICY "Service role can insert profiles"
  ON public.profiles
  FOR INSERT
  TO service_role
  WITH CHECK (true);

COMMENT ON FUNCTION public.handle_new_user() IS
'Trigger function that creates a user profile on signup. FIXED: Now uses correct column names (subscription_credits_balance, purchased_credits_balance) and includes error handling for transaction logging to prevent signup failures.';

COMMENT ON FUNCTION public.handle_new_user_email_prefs() IS
'Trigger function that creates email preferences on profile creation. FIXED: Added error handling and search_path to prevent signup failures.';
