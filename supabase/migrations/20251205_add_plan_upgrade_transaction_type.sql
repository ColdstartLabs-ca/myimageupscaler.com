-- Add plan_upgrade and plan_downgrade to allowed transaction types
-- These are needed for subscription tier changes

ALTER TABLE public.credit_transactions
DROP CONSTRAINT IF EXISTS credit_transactions_type_check;

ALTER TABLE public.credit_transactions
ADD CONSTRAINT credit_transactions_type_check
CHECK (type IN ('purchase', 'subscription', 'usage', 'refund', 'bonus', 'plan_upgrade', 'plan_downgrade', 'trial', 'expiration', 'clawback'));
