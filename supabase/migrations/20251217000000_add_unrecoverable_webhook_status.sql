-- Add 'unrecoverable' to webhook_events status check constraint
-- This status is used for unhandled event types that we don't need to retry

-- Drop the existing constraint
ALTER TABLE public.webhook_events
  DROP CONSTRAINT IF EXISTS webhook_events_status_check;

-- Add the updated constraint including 'unrecoverable'
ALTER TABLE public.webhook_events
  ADD CONSTRAINT webhook_events_status_check
  CHECK (status IN ('processing', 'completed', 'failed', 'unrecoverable'));
