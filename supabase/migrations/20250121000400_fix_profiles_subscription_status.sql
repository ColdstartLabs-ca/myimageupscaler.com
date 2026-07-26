-- Fix the profiles check constraint to allow NULL subscription_status for free users
-- Also fix the handle_new_user trigger to not insert 'free' as subscription_status

-- Drop the existing check constraint and recreate it to allow NULL
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_subscription_status_check;

-- Recreate the check constraint to allow NULL (for free users without subscription)
ALTER TABLE public.profiles ADD CONSTRAINT profiles_subscription_status_check
  CHECK (subscription_status IS NULL OR subscription_status IN ('active', 'trialing', 'past_due', 'canceled', 'unpaid'));

-- Fix the handle_new_user trigger to use NULL for subscription_status
-- Free users don't have a subscription, so subscription_status should be NULL
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, credits_balance, subscription_status, subscription_tier)
  VALUES (NEW.id, 10, NULL, NULL);  -- Free users have NULL subscription_status and subscription_tier

  INSERT INTO public.credit_transactions (user_id, amount, type, description)
  VALUES (NEW.id, 10, 'bonus', 'Welcome bonus credits');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
