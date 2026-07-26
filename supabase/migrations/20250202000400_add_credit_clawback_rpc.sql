-- Add credit clawback function for refund handling
-- This allows the system to remove credits when payments are refunded

-- Function to clawback credits from a user
CREATE OR REPLACE FUNCTION clawback_credits(
  p_target_user_id UUID,
  p_amount INTEGER,
  p_reason TEXT DEFAULT 'Refund',
  p_ref_id TEXT DEFAULT NULL
)
RETURNS TABLE (
  success BOOLEAN,
  new_balance INTEGER,
  error_message TEXT
) AS $$
DECLARE
  current_balance INTEGER;
BEGIN
  -- Get current user balance
  SELECT credits_balance INTO current_balance
  FROM profiles
  WHERE id = p_target_user_id;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 0, 'User not found';
    RETURN;
  END IF;

  -- Ensure user has enough credits to clawback
  IF current_balance < p_amount THEN
    -- Only clawback available credits, don't go negative
    p_amount := current_balance;
  END IF;

  -- Update user balance (can't go below 0)
  UPDATE profiles
  SET credits_balance = GREATEST(0, credits_balance - p_amount),
      updated_at = now()
  WHERE id = p_target_user_id;

  -- Log the clawback transaction
  INSERT INTO credit_transactions (
    user_id,
    amount,
    transaction_type,
    reference_id,
    description,
    created_at
  ) VALUES (
    p_target_user_id,
    -p_amount, -- Negative amount for clawback
    'refund',
    COALESCE(p_ref_id, 'clawback_' || extract(epoch from now())::text),
    p_reason || ' - ' || p_amount || ' credits clawed back',
    now()
  );

  -- Return the new balance
  RETURN QUERY SELECT true, GREATEST(0, current_balance - p_amount), NULL::TEXT;
  RETURN;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, 0, SQLERRM;
  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to handle full refund clawback (remove all credits added from a specific transaction)
CREATE OR REPLACE FUNCTION clawback_credits_from_transaction(
  p_target_user_id UUID,
  p_original_ref_id TEXT,
  p_reason TEXT DEFAULT 'Full refund'
)
RETURNS TABLE (
  success BOOLEAN,
  credits_clawed_back INTEGER,
  new_balance INTEGER,
  error_message TEXT
) AS $$
DECLARE
  total_credits_to_clawback INTEGER;
BEGIN
  -- Calculate total credits added from the original transaction
  SELECT COALESCE(SUM(amount), 0) INTO total_credits_to_clawback
  FROM credit_transactions
  WHERE user_id = p_target_user_id
    AND reference_id = p_original_ref_id
    AND transaction_type IN ('subscription', 'purchase')
    AND amount > 0; -- Only credit additions

  IF total_credits_to_clawback = 0 THEN
    RETURN QUERY SELECT false, 0, 0, 'No credits found to clawback from transaction';
    RETURN;
  END IF;

  -- Clawback the credits
  RETURN QUERY
  SELECT clawback.success,
         total_credits_to_clawback,
         clawback.new_balance,
         clawback.error_message
  FROM clawback_credits(p_target_user_id, total_credits_to_clawback, p_reason, p_original_ref_id || '_clawback') clawback;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY SELECT false, 0, 0, SQLERRM;
  RETURN;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add refund transaction type constraint
ALTER TABLE credit_transactions
ADD CONSTRAINT chk_transaction_type_valid
CHECK (transaction_type IN ('purchase', 'subscription', 'usage', 'refund', 'bonus', 'clawback'));

-- Add index for refund-related queries
CREATE INDEX idx_credit_transactions_ref_type_amount
ON credit_transactions(reference_id, transaction_type, amount)
WHERE transaction_type IN ('purchase', 'subscription', 'refund');