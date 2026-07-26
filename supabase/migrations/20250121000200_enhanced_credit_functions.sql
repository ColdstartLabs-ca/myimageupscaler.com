-- Enhanced credit functions with transaction logging
-- These functions provide atomic credit operations with full audit trail

-- Increment credits with transaction logging
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

GRANT EXECUTE ON FUNCTION public.increment_credits_with_log(UUID, INTEGER, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_credits_with_log(UUID, INTEGER, TEXT, TEXT, TEXT) TO service_role;

-- Decrement credits with transaction logging (atomic with row lock)
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

GRANT EXECUTE ON FUNCTION public.decrement_credits_with_log(UUID, INTEGER, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_credits_with_log(UUID, INTEGER, TEXT, TEXT, TEXT) TO service_role;

-- Refund credits (convenience wrapper for failed processing)
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

GRANT EXECUTE ON FUNCTION public.refund_credits(UUID, INTEGER, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refund_credits(UUID, INTEGER, TEXT) TO service_role;
