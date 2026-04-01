-- Reduce free credits granted at signup from 10 to 5 for standard tier
-- This aligns with CREDIT_COSTS.DEFAULT_FREE_CREDITS change in shared/config/credits.config

-- Update the handle_new_user function to grant 5 credits instead of 10
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, subscription_credits_balance, purchased_credits_balance)
  VALUES (NEW.id, 5, 0);  -- Give new users 5 free subscription credits (reduced from 10)
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
