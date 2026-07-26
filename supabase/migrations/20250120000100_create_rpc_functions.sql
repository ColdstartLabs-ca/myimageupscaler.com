-- Create secure RPC function to increment user credits
-- This function uses SECURITY DEFINER to bypass RLS, ensuring only this function can modify credits
CREATE OR REPLACE FUNCTION public.increment_credits(target_user_id UUID, amount INTEGER)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.profiles
  SET credits_balance = credits_balance + amount
  WHERE id = target_user_id;
$$;

-- Grant execute permission to authenticated users (though only service role should call it via webhooks)
GRANT EXECUTE ON FUNCTION public.increment_credits(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_credits(UUID, INTEGER) TO service_role;

-- Create RPC function to decrement user credits (for usage tracking)
-- Returns the new balance, or NULL if insufficient credits
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
  -- Get current balance
  SELECT credits_balance INTO current_balance
  FROM public.profiles
  WHERE id = target_user_id;

  -- Check if user exists and has sufficient credits
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

GRANT EXECUTE ON FUNCTION public.decrement_credits(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decrement_credits(UUID, INTEGER) TO service_role;

-- Create function to get user's current subscription status
CREATE OR REPLACE FUNCTION public.get_active_subscription(target_user_id UUID)
RETURNS TABLE (
  subscription_id TEXT,
  status TEXT,
  price_id TEXT,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, status, price_id, current_period_end, cancel_at_period_end
  FROM public.subscriptions
  WHERE user_id = target_user_id
    AND status IN ('active', 'trialing')
  ORDER BY created_at DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.get_active_subscription(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_subscription(UUID) TO service_role;

-- Create function to check if user has sufficient credits
CREATE OR REPLACE FUNCTION public.has_sufficient_credits(target_user_id UUID, required_amount INTEGER)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT credits_balance >= required_amount
  FROM public.profiles
  WHERE id = target_user_id;
$$;

GRANT EXECUTE ON FUNCTION public.has_sufficient_credits(UUID, INTEGER) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_sufficient_credits(UUID, INTEGER) TO service_role;
