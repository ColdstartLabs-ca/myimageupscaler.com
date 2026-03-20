-- Email Campaign Tables for Re-engagement Drip Campaign System
-- Phase 1: Database & Core Infrastructure

-- =============================================================================
-- Table: email_campaigns
-- Stores campaign definitions for each segment
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.email_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  segment TEXT NOT NULL CHECK (segment IN ('non_converter', 'non_uploader', 'trial_user')),
  template_name TEXT NOT NULL,
  send_day INTEGER NOT NULL CHECK (send_day > 0),
  subject TEXT NOT NULL,
  enabled BOOLEAN DEFAULT TRUE NOT NULL,
  priority INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- Indexes for efficient campaign queries
CREATE INDEX IF NOT EXISTS idx_email_campaigns_segment ON public.email_campaigns(segment);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_enabled ON public.email_campaigns(enabled);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_segment_day ON public.email_campaigns(segment, send_day);

-- Enable RLS
ALTER TABLE public.email_campaigns ENABLE ROW LEVEL SECURITY;

-- RLS Policies for email_campaigns
-- Service role has full access for campaign management
CREATE POLICY "Service role has full access to campaigns"
  ON public.email_campaigns
  FOR ALL
  USING (auth.role() = 'service_role');

-- Admin users can view campaigns (for future admin dashboard)
CREATE POLICY "Admins can view campaigns"
  ON public.email_campaigns
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- =============================================================================
-- Table: email_campaign_queue
-- Stores queued emails to be sent, with tracking
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.email_campaign_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id UUID NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  scheduled_for TIMESTAMPTZ NOT NULL,
  sent_at TIMESTAMPTZ,
  status TEXT NOT NULL CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  metadata JSONB DEFAULT '{}',
  UNIQUE(campaign_id, user_id)
);

-- Indexes for efficient queue processing
CREATE INDEX IF NOT EXISTS idx_email_campaign_queue_scheduled ON public.email_campaign_queue(scheduled_for, status);
CREATE INDEX IF NOT EXISTS idx_email_campaign_queue_user ON public.email_campaign_queue(user_id, status);
CREATE INDEX IF NOT EXISTS idx_email_campaign_queue_campaign ON public.email_campaign_queue(campaign_id, status);
CREATE INDEX IF NOT EXISTS idx_email_campaign_queue_status ON public.email_campaign_queue(status);

-- Enable RLS
ALTER TABLE public.email_campaign_queue ENABLE ROW LEVEL SECURITY;

-- RLS Policies for email_campaign_queue
-- Service role has full access for queue processing
CREATE POLICY "Service role has full access to queue"
  ON public.email_campaign_queue
  FOR ALL
  USING (auth.role() = 'service_role');

-- Users can view their own queue entries only
CREATE POLICY "Users can view own queue entries"
  ON public.email_campaign_queue
  FOR SELECT
  USING (auth.uid() = user_id);

-- =============================================================================
-- Table: email_campaign_events
-- Stores events (opens, clicks, etc.) for analytics
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.email_campaign_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id UUID NOT NULL REFERENCES public.email_campaign_queue(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('queued', 'sent', 'opened', 'clicked', 'unsubscribed', 'bounced', 'returned')),
  occurred_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  metadata JSONB DEFAULT '{}'
);

-- Indexes for efficient event queries
CREATE INDEX IF NOT EXISTS idx_email_campaign_events_queue ON public.email_campaign_events(queue_id);
CREATE INDEX IF NOT EXISTS idx_email_campaign_events_type ON public.email_campaign_events(event_type);
CREATE INDEX IF NOT EXISTS idx_email_campaign_events_occurred ON public.email_campaign_events(occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_email_campaign_events_type_occurred ON public.email_campaign_events(event_type, occurred_at DESC);

-- Enable RLS
ALTER TABLE public.email_campaign_events ENABLE ROW LEVEL SECURITY;

-- RLS Policies for email_campaign_events
-- Service role has full access for event tracking
CREATE POLICY "Service role has full access to events"
  ON public.email_campaign_events
  FOR ALL
  USING (auth.role() = 'service_role');

-- =============================================================================
-- Updated at triggers for new tables
-- =============================================================================
DROP TRIGGER IF EXISTS on_email_campaigns_updated ON public.email_campaigns;
CREATE TRIGGER on_email_campaigns_updated
  BEFORE UPDATE ON public.email_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS on_email_campaign_queue_updated ON public.email_campaign_queue;
CREATE TRIGGER on_email_campaign_queue_updated
  BEFORE UPDATE ON public.email_campaign_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- =============================================================================
-- Trigger to auto-create event on queue entry creation
-- =============================================================================
CREATE OR REPLACE FUNCTION public.handle_campaign_queue_created()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.email_campaign_events (queue_id, event_type, metadata)
  VALUES (NEW.id, 'queued', jsonb_build_object('scheduled_for', NEW.scheduled_for));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_campaign_queue_created ON public.email_campaign_queue;
CREATE TRIGGER on_campaign_queue_created
  AFTER INSERT ON public.email_campaign_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_campaign_queue_created();

-- =============================================================================
-- Comments for documentation
-- =============================================================================
COMMENT ON TABLE public.email_campaigns IS 'Stores email campaign definitions for re-engagement drip campaigns';
COMMENT ON TABLE public.email_campaign_queue IS 'Queue of emails to be sent for campaigns, with tracking';
COMMENT ON TABLE public.email_campaign_events IS 'Events (queued, sent, opened, clicked, etc.) for campaign analytics';

COMMENT ON COLUMN public.email_campaigns.segment IS 'User segment: non_converter (uploaded but never paid), non_uploader (signed up but never uploaded), trial_user (on trial, haven''t converted)';
COMMENT ON COLUMN public.email_campaigns.send_day IS 'Day number in the drip sequence (1 = first email)';
COMMENT ON COLUMN public.email_campaigns.priority IS 'Priority for ordering campaigns within same send_day';

COMMENT ON COLUMN public.email_campaign_queue.scheduled_for IS 'When the email should be sent';
COMMENT ON COLUMN public.email_campaign_queue.metadata IS 'Additional data like unsubscribe token, template variables, etc.';
