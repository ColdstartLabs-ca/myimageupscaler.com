-- Add trial_end column to subscriptions table
-- This column is used to track trial end dates for subscription trials

ALTER TABLE public.subscriptions
ADD COLUMN IF NOT EXISTS trial_end TIMESTAMPTZ;

-- Create index for efficient trial queries
CREATE INDEX IF NOT EXISTS idx_subscriptions_trial_end ON public.subscriptions(trial_end)
WHERE trial_end IS NOT NULL;

COMMENT ON COLUMN public.subscriptions.trial_end IS 'Trial end date for subscriptions in trialing status';
