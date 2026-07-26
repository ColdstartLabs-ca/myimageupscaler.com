-- Add cancellation_reason field to subscriptions table
-- This allows us to track why users cancel their subscriptions

ALTER TABLE public.subscriptions
ADD COLUMN IF NOT EXISTS cancellation_reason TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.subscriptions.cancellation_reason IS
'Optional reason provided by user when canceling subscription. Used for analytics and product improvement.';
