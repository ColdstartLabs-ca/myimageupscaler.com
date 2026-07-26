-- ============================================================================
-- Migration: Secure Credits System
-- ============================================================================
-- This migration locks down the credit system to prevent unauthorized
-- credit manipulation and free AI generation exploits.
--
-- Changes:
-- 1. Revokes EXECUTE permission on credit-modifying RPCs from authenticated users
-- 2. Creates a trigger to prevent direct updates to credits_balance column
-- 3. Updates RPC functions to use a trusted session flag
-- ============================================================================

-- 1. Revoke access to sensitive RPCs from authenticated users
-- These functions should only be called by the service_role (backend)
REVOKE EXECUTE ON FUNCTION public.increment_credits(UUID, INTEGER) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.decrement_credits(UUID, INTEGER) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_credits_with_log(UUID, INTEGER, TEXT, TEXT, TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.decrement_credits_with_log(UUID, INTEGER, TEXT, TEXT, TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.refund_credits(UUID, INTEGER, TEXT) FROM authenticated;

-- 2. Update RPC functions to set trusted operation flag
-- This allows the trigger to distinguish between direct user updates and RPC calls

-- Update increment_credits_with_log to set trusted flag
CREATE OR REPLACE FUNCTION public.increment_credits_with_log(
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
  new_balance INTEGER;
BEGIN
  -- Set trusted operation flag
  PERFORM set_config('app.trusted_credit_operation', 'true', true);

  -- Increment credits
  UPDATE public.profiles
  SET credits_balance = credits_balance + amount
  WHERE id = target_user_id
  RETURNING credits_balance INTO new_balance;

  IF new_balance IS NULL THEN
    RAISE EXCEPTION 'User not found: %', target_user_id;
  END IF;

  -- Log transaction
  INSERT INTO public.credit_transactions (user_id, amount, type, reference_id, description)
  VALUES (target_user_id, amount, transaction_type, ref_id, description);

  RETURN new_balance;
END;
$$;

-- Update decrement_credits_with_log to set trusted flag
CREATE OR REPLACE FUNCTION public.decrement_credits_with_log(
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
  current_balance INTEGER;
  new_balance INTEGER;
BEGIN
  -- Set trusted operation flag
  PERFORM set_config('app.trusted_credit_operation', 'true', true);

  -- Lock row and check balance
  SELECT credits_balance INTO current_balance
  FROM public.profiles
  WHERE id = target_user_id
  FOR UPDATE;

  IF current_balance IS NULL THEN
    RAISE EXCEPTION 'User not found: %', target_user_id;
  END IF;

  IF current_balance < amount THEN
    RAISE EXCEPTION 'Insufficient credits. Required: %, Available: %', amount, current_balance;
  END IF;

  -- Decrement credits
  UPDATE public.profiles
  SET credits_balance = credits_balance - amount
  WHERE id = target_user_id
  RETURNING credits_balance INTO new_balance;

  -- Log transaction (negative amount for deduction)
  INSERT INTO public.credit_transactions (user_id, amount, type, reference_id, description)
  VALUES (target_user_id, -amount, transaction_type, ref_id, description);

  RETURN new_balance;
END;
$$;

-- Update refund_credits
CREATE OR REPLACE FUNCTION public.refund_credits(
  target_user_id UUID,
  amount INTEGER,
  job_id TEXT DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.increment_credits_with_log(
    target_user_id,
    amount,
    'refund',
    job_id,
    'Processing refund'
  );
END;
$$;

-- Update the simple increment/decrement functions
CREATE OR REPLACE FUNCTION public.increment_credits(target_user_id UUID, amount INTEGER)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Set trusted operation flag
  PERFORM set_config('app.trusted_credit_operation', 'true', true);

  UPDATE public.profiles
  SET credits_balance = credits_balance + amount
  WHERE id = target_user_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.decrement_credits(target_user_id UUID, amount INTEGER)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_balance INTEGER;
  new_balance INTEGER;
BEGIN
  -- Set trusted operation flag
  PERFORM set_config('app.trusted_credit_operation', 'true', true);

  -- Get current balance
  SELECT credits_balance INTO current_balance
  FROM public.profiles
  WHERE id = target_user_id;

  IF current_balance IS NULL THEN
    RAISE EXCEPTION 'User profile not found';
  END IF;

  IF current_balance < amount THEN
    RAISE EXCEPTION 'Insufficient credits';
  END IF;

  -- Decrement credits
  UPDATE public.profiles
  SET credits_balance = credits_balance - amount
  WHERE id = target_user_id
  RETURNING credits_balance INTO new_balance;

  RETURN new_balance;
END;
$$;

-- 3. Create trigger function to prevent direct updates to credits_balance
CREATE OR REPLACE FUNCTION public.prevent_credit_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Check if this is a trusted internal operation (from our RPC functions)
  IF current_setting('app.trusted_credit_operation', true) = 'true' THEN
    RETURN NEW;
  END IF;

  -- Block any attempt to change credits_balance for untrusted operations
  IF NEW.credits_balance IS DISTINCT FROM OLD.credits_balance THEN
    RAISE EXCEPTION 'Cannot update credits_balance directly. Use the designated API endpoints.';
  END IF;

  RETURN NEW;
END;
$$;

-- 4. Create the trigger on profiles table
DROP TRIGGER IF EXISTS protect_credits_balance ON public.profiles;
CREATE TRIGGER protect_credits_balance
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_credit_update();

-- 5. Add comments to document the security measures
COMMENT ON FUNCTION public.prevent_credit_update() IS
'Security trigger function that prevents direct updates to credits_balance column. Only trusted RPC functions can modify credits.';

COMMENT ON TRIGGER protect_credits_balance ON public.profiles IS
'Prevents users from directly updating their credits_balance. Credits must be modified through server-side API calls using designated RPC functions.';
