-- Security Fix: CRITICAL-1
-- Revoke credit modification RPC functions from authenticated role
-- These functions should only be callable by service_role (webhooks, server-side code)
--
-- Issue: authenticated users could call these functions to manipulate any user's credits
-- Fix: Only allow service_role to execute these functions

-- Revoke from authenticated role (keep service_role)
REVOKE EXECUTE ON FUNCTION public.increment_credits(UUID, INTEGER) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.increment_credits_with_log(UUID, INTEGER, TEXT, TEXT, TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.decrement_credits(UUID, INTEGER) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.decrement_credits_with_log(UUID, INTEGER, TEXT, TEXT, TEXT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.refund_credits(UUID, INTEGER, TEXT) FROM authenticated;

-- Add validation to increment_credits_with_log to prevent negative amounts
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
  -- Validate amount is positive
  IF amount <= 0 THEN
    RAISE EXCEPTION 'Credit amount must be positive, got: %', amount;
  END IF;

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

-- Re-grant to service_role only
GRANT EXECUTE ON FUNCTION public.increment_credits_with_log(UUID, INTEGER, TEXT, TEXT, TEXT) TO service_role;

-- Add validation to decrement_credits_with_log as well
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
  -- Validate amount is positive
  IF amount <= 0 THEN
    RAISE EXCEPTION 'Credit amount must be positive, got: %', amount;
  END IF;

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

-- Re-grant to service_role only
GRANT EXECUTE ON FUNCTION public.decrement_credits_with_log(UUID, INTEGER, TEXT, TEXT, TEXT) TO service_role;

-- Note: increment_credits, decrement_credits, and refund_credits are kept with service_role only
-- These are legacy functions that should not be called directly from client-side anyway
