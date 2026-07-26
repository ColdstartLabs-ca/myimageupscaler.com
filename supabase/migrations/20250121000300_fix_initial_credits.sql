-- Fix initial credits and add welcome bonus logging
-- This migration:
-- 1. Updates the handle_new_user trigger to log welcome bonus
-- 2. Backfills existing users with 0 credits to 10

-- Update handle_new_user trigger to include welcome bonus logging
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  -- Create profile with 10 welcome credits
  INSERT INTO public.profiles (id, credits_balance, subscription_status, subscription_tier)
  VALUES (NEW.id, 10, 'free', 'free');

  -- Log the welcome bonus transaction
  INSERT INTO public.credit_transactions (user_id, amount, type, description)
  VALUES (NEW.id, 10, 'bonus', 'Welcome bonus credits');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Recreate trigger (function already updated above)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Backfill existing users with 0 credits
-- This gives them the welcome bonus they should have received
DO $$
DECLARE
  updated_count INTEGER;
  user_record RECORD;
BEGIN
  -- Update users with 0 credits
  UPDATE public.profiles
  SET credits_balance = 10
  WHERE credits_balance = 0;

  GET DIAGNOSTICS updated_count = ROW_COUNT;

  -- Log backfill transactions for users that were updated
  -- (We can't know exactly which users were backfilled after the fact,
  -- so we log for all users who now have exactly 10 credits and no transactions)
  FOR user_record IN
    SELECT p.id
    FROM public.profiles p
    LEFT JOIN public.credit_transactions ct ON ct.user_id = p.id
    WHERE ct.id IS NULL AND p.credits_balance = 10
  LOOP
    INSERT INTO public.credit_transactions (user_id, amount, type, description)
    VALUES (user_record.id, 10, 'bonus', 'Welcome bonus credits (backfill)');
  END LOOP;

  IF updated_count > 0 THEN
    RAISE NOTICE 'Backfilled % users with 10 credits', updated_count;
  END IF;
END;
$$;
