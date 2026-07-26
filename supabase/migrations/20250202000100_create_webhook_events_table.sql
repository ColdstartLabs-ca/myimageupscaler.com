-- Create webhook_events table for idempotency
-- This prevents duplicate processing of Stripe webhook events

CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id TEXT UNIQUE NOT NULL,
  event_type TEXT NOT NULL,
  processed_at TIMESTAMPTZ DEFAULT now(),
  status TEXT NOT NULL DEFAULT 'processing',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add indexes for performance
CREATE INDEX idx_webhook_events_event_id ON webhook_events(event_id);
CREATE INDEX idx_webhook_events_status ON webhook_events(status);
CREATE INDEX idx_webhook_events_processed_at ON webhook_events(processed_at);

-- Add RLS policies
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

-- Only allow system operations (no direct user access)
CREATE POLICY "No direct access to webhook_events" ON webhook_events
  FOR ALL USING (false);

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_webhook_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update updated_at
CREATE TRIGGER update_webhook_events_updated_at_trigger
  BEFORE UPDATE ON webhook_events
  FOR EACH ROW
  EXECUTE FUNCTION update_webhook_events_updated_at();

-- Function to check if event was already processed
CREATE OR REPLACE FUNCTION is_webhook_event_processed(p_event_id TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM webhook_events
    WHERE event_id = p_event_id
    AND status IN ('completed', 'processing')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark webhook event as completed
CREATE OR REPLACE FUNCTION mark_webhook_event_completed(p_event_id TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE webhook_events
  SET status = 'completed'
  WHERE event_id = p_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to mark webhook event as failed
CREATE OR REPLACE FUNCTION mark_webhook_event_failed(p_event_id TEXT, p_error_message TEXT DEFAULT NULL)
RETURNS VOID AS $$
BEGIN
  UPDATE webhook_events
  SET status = 'failed'
  WHERE event_id = p_event_id;

  -- Optionally log the error (could add an error_message column if needed)
  IF p_error_message IS NOT NULL THEN
    RAISE LOG 'Webhook event % failed: %', p_event_id, p_error_message;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;