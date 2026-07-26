-- Add missing columns to webhook_events for full idempotency tracking
-- These columns enable: payload storage for debugging, error tracking, and completion timestamps

-- Add payload column for storing full event data for debugging
ALTER TABLE public.webhook_events
  ADD COLUMN IF NOT EXISTS payload JSONB;

-- Add error_message column for tracking failure details
ALTER TABLE public.webhook_events
  ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Add completed_at column for tracking when processing finished
ALTER TABLE public.webhook_events
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

-- Add constraint to ensure status values are valid
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'webhook_events_status_check'
  ) THEN
    ALTER TABLE public.webhook_events
      ADD CONSTRAINT webhook_events_status_check
      CHECK (status IN ('processing', 'completed', 'failed'));
  END IF;
END $$;

-- Update the mark_webhook_event_failed function to store error message
CREATE OR REPLACE FUNCTION mark_webhook_event_failed(p_event_id TEXT, p_error_message TEXT DEFAULT NULL)
RETURNS VOID AS $$
BEGIN
  UPDATE webhook_events
  SET
    status = 'failed',
    error_message = p_error_message,
    completed_at = now()
  WHERE event_id = p_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update mark_webhook_event_completed to set completed_at
CREATE OR REPLACE FUNCTION mark_webhook_event_completed(p_event_id TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE webhook_events
  SET
    status = 'completed',
    completed_at = now()
  WHERE event_id = p_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to claim a webhook event (returns true if successfully claimed)
CREATE OR REPLACE FUNCTION claim_webhook_event(
  p_event_id TEXT,
  p_event_type TEXT,
  p_payload JSONB DEFAULT NULL
)
RETURNS TABLE(is_new BOOLEAN, existing_status TEXT) AS $$
DECLARE
  v_existing_status TEXT;
BEGIN
  -- First check if event exists
  SELECT we.status INTO v_existing_status
  FROM webhook_events we
  WHERE we.event_id = p_event_id;

  IF v_existing_status IS NOT NULL THEN
    -- Event already exists
    RETURN QUERY SELECT false, v_existing_status;
    RETURN;
  END IF;

  -- Try to insert new event
  BEGIN
    INSERT INTO webhook_events (event_id, event_type, status, payload)
    VALUES (p_event_id, p_event_type, 'processing', p_payload);

    RETURN QUERY SELECT true, NULL::TEXT;
  EXCEPTION WHEN unique_violation THEN
    -- Concurrent insert won - get the status of that insert
    SELECT we.status INTO v_existing_status
    FROM webhook_events we
    WHERE we.event_id = p_event_id;

    RETURN QUERY SELECT false, v_existing_status;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Add comments for documentation
COMMENT ON COLUMN public.webhook_events.payload IS 'Full Stripe event payload for debugging';
COMMENT ON COLUMN public.webhook_events.error_message IS 'Error details if processing failed';
COMMENT ON COLUMN public.webhook_events.completed_at IS 'Timestamp when processing finished (success or failure)';
COMMENT ON FUNCTION claim_webhook_event IS 'Atomically claims a webhook event for processing. Returns is_new=true if claimed, false if already exists.';
