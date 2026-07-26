-- Migration: Separate Credit Pools (Subscription vs Purchased)
-- Description: Fix bug where purchased credits are wiped on subscription renewal
-- Date: 2025-12-05
-- Context: Previously all credits were in one column (credits_balance) and expire_credits_at_cycle_end()
--          would wipe ALL credits including purchased ones that should never expire.
-- Solution: Separate into subscription_credits_balance and purchased_credits_balance

-- ============================================
-- Step 1: Add purchased_credits_balance column
-- ============================================

ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS purchased_credits_balance INTEGER DEFAULT 0 NOT NULL;

COMMENT ON COLUMN profiles.purchased_credits_balance IS
'Credits purchased via one-time credit packs. These credits NEVER expire and are consumed after subscription credits.';

-- ============================================
-- Step 2: Backfill purchased credits from transaction history
-- ============================================

-- Calculate purchased credits for each user by summing all 'purchase' type transactions
-- This ensures accurate split for existing users
UPDATE profiles p
SET purchased_credits_balance = COALESCE(
    (SELECT SUM(amount)
     FROM credit_transactions ct
     WHERE ct.user_id = p.id
       AND ct.type = 'purchase'
       AND ct.amount > 0),
    0
);

-- ============================================
-- Step 3: Adjust subscription balance
-- ============================================

-- Current credits_balance includes both subscription AND purchased credits
-- We need to subtract purchased credits to get the true subscription balance
-- Use GREATEST to prevent negative balances in case of data inconsistencies
UPDATE profiles
SET credits_balance = GREATEST(0, credits_balance - purchased_credits_balance);

-- ============================================
-- Step 4: Rename column for clarity
-- ============================================

ALTER TABLE profiles
RENAME COLUMN credits_balance TO subscription_credits_balance;

COMMENT ON COLUMN profiles.subscription_credits_balance IS
'Credits from subscription plan. These credits expire at billing cycle end and are consumed first (FIFO).';

-- ============================================
-- Step 5: Add constraints
-- ============================================

ALTER TABLE profiles
ADD CONSTRAINT chk_subscription_credits_non_negative
CHECK (subscription_credits_balance >= 0);

ALTER TABLE profiles
ADD CONSTRAINT chk_purchased_credits_non_negative
CHECK (purchased_credits_balance >= 0);

-- ============================================
-- Step 6: Update handle_new_user trigger
-- ============================================

-- Update the trigger to use the new column name
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, subscription_credits_balance, purchased_credits_balance)
  VALUES (NEW.id, 10, 0);  -- Give new users 10 free subscription credits
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- Step 7: Create convenience view for total balance
-- ============================================

CREATE OR REPLACE VIEW user_credits AS
SELECT
    id AS user_id,
    subscription_credits_balance,
    purchased_credits_balance,
    (subscription_credits_balance + purchased_credits_balance) AS total_credits_balance,
    created_at,
    updated_at
FROM profiles;

COMMENT ON VIEW user_credits IS
'Convenience view showing credit breakdown and total. Use this for displaying user balances in UI.';

-- Grant access to the view
GRANT SELECT ON user_credits TO authenticated;
GRANT SELECT ON user_credits TO service_role;

-- RLS policy for the view (users can only see their own credits)
ALTER VIEW user_credits SET (security_invoker = true);
