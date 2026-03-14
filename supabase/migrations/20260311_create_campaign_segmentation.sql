-- Email Campaign Segmentation Functions for Re-engagement Drip Campaign System
-- Phase 1: Database & Core Infrastructure
--
-- These functions identify users in different segments for targeted email campaigns:
-- - Non-converters: Users who uploaded images but never paid
-- - Non-uploaders: Users who signed up but never uploaded
-- - Trial users: Users on active trial who haven't converted to paid

-- =============================================================================
-- Function: get_non_converter_segment
-- Returns users who uploaded images but never made a purchase or subscription
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_non_converter_segment(limit_count INTEGER DEFAULT 100)
RETURNS TABLE (id UUID, email TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT
    p.id,
    p.email
  FROM public.profiles p
  INNER JOIN public.processing_jobs pj ON pj.user_id = p.id
  LEFT JOIN public.credit_transactions ct
    ON ct.user_id = p.id
    AND ct.transaction_type IN ('purchase', 'subscription')
  LEFT JOIN public.subscriptions s ON s.user_id = p.id
  WHERE p.created_at >= NOW() - INTERVAL '30 days'
    AND pj.status = 'completed'
    AND ct.id IS NULL
    AND s.id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.email_campaign_queue q
      INNER JOIN public.email_campaigns c ON c.id = q.campaign_id
      WHERE q.user_id = p.id
        AND c.segment = 'non_converter'
        AND q.status IN ('pending', 'sent')
    )
  ORDER BY p.created_at DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_non_converter_segment IS 'Returns users who completed uploads but never purchased credits or subscribed';

-- =============================================================================
-- Function: get_non_uploader_segment
-- Returns users who signed up but never uploaded any images
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_non_uploader_segment(limit_count INTEGER DEFAULT 100)
RETURNS TABLE (id UUID, email TEXT) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.email
  FROM public.profiles p
  LEFT JOIN public.processing_jobs pj ON pj.user_id = p.id
  WHERE p.created_at >= NOW() - INTERVAL '14 days'
    AND pj.id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.email_campaign_queue q
      INNER JOIN public.email_campaigns c ON c.id = q.campaign_id
      WHERE q.user_id = p.id
        AND c.segment = 'non_uploader'
        AND q.status IN ('pending', 'sent')
    )
  ORDER BY p.created_at DESC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_non_uploader_segment IS 'Returns users who signed up but never uploaded any images';

-- =============================================================================
-- Function: get_trial_user_segment
-- Returns users with active trials who haven't converted to paid
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_trial_user_segment(limit_count INTEGER DEFAULT 100)
RETURNS TABLE (id UUID, email TEXT, trial_end TIMESTAMPTZ) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.email,
    s.trial_end
  FROM public.profiles p
  INNER JOIN public.subscriptions s ON s.user_id = p.id
  WHERE s.status = 'trialing'
    AND s.trial_end > NOW()
    AND NOT EXISTS (
      SELECT 1 FROM public.credit_transactions ct
      WHERE ct.user_id = p.id
        AND ct.transaction_type IN ('purchase', 'subscription')
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.email_campaign_queue q
      INNER JOIN public.email_campaigns c ON c.id = q.campaign_id
      WHERE q.user_id = p.id
        AND c.segment = 'trial_user'
        AND q.status IN ('pending', 'sent')
    )
  ORDER BY s.trial_end ASC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_trial_user_segment IS 'Returns users with active trials who haven''t purchased or subscribed';

-- =============================================================================
-- Function: get_segment_count
-- Returns the count of users in a segment (for monitoring/metrics)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_segment_count(segment_type TEXT)
RETURNS INTEGER AS $$
DECLARE
  count_result INTEGER;
BEGIN
  CASE segment_type
    WHEN 'non_converter' THEN
      SELECT COUNT(DISTINCT p.id)::INTEGER INTO count_result
      FROM public.profiles p
      INNER JOIN public.processing_jobs pj ON pj.user_id = p.id
      LEFT JOIN public.credit_transactions ct
        ON ct.user_id = p.id
        AND ct.transaction_type IN ('purchase', 'subscription')
      LEFT JOIN public.subscriptions s ON s.user_id = p.id
      WHERE p.created_at >= NOW() - INTERVAL '30 days'
        AND pj.status = 'completed'
        AND ct.id IS NULL
        AND s.id IS NULL;

    WHEN 'non_uploader' THEN
      SELECT COUNT(p.id)::INTEGER INTO count_result
      FROM public.profiles p
      LEFT JOIN public.processing_jobs pj ON pj.user_id = p.id
      WHERE p.created_at >= NOW() - INTERVAL '14 days'
        AND pj.id IS NULL;

    WHEN 'trial_user' THEN
      SELECT COUNT(DISTINCT p.id)::INTEGER INTO count_result
      FROM public.profiles p
      INNER JOIN public.subscriptions s ON s.user_id = p.id
      WHERE s.status = 'trialing'
        AND s.trial_end > NOW()
        AND NOT EXISTS (
          SELECT 1 FROM public.credit_transactions ct
          WHERE ct.user_id = p.id
            AND ct.transaction_type IN ('purchase', 'subscription')
        );

    ELSE
      count_result := 0;
  END CASE;

  RETURN count_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_segment_count IS 'Returns the count of users in a segment for monitoring';

-- =============================================================================
-- Function: mark_campaign_sent
-- Updates queue entry status and creates sent event
-- =============================================================================
CREATE OR REPLACE FUNCTION public.mark_campaign_sent(
  p_queue_id UUID,
  p_success BOOLEAN,
  p_error_message TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
  IF p_success THEN
    UPDATE public.email_campaign_queue
    SET status = 'sent',
        sent_at = NOW(),
        error_message = NULL
    WHERE id = p_queue_id;

    INSERT INTO public.email_campaign_events (queue_id, event_type)
    VALUES (p_queue_id, 'sent');
  ELSE
    UPDATE public.email_campaign_queue
    SET status = 'failed',
        error_message = p_error_message
    WHERE id = p_queue_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.mark_campaign_sent IS 'Updates queue entry status after send attempt';

-- =============================================================================
-- Function: record_campaign_event
-- Records an event for a queued email (open, click, etc.)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.record_campaign_event(
  p_queue_id UUID,
  p_event_type TEXT,
  p_metadata JSONB DEFAULT '{}'
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO public.email_campaign_events (queue_id, event_type, metadata)
  VALUES (p_queue_id, p_event_type, p_metadata);

  -- Handle special event types
  IF p_event_type = 'unsubscribed' THEN
    UPDATE public.email_campaign_queue
    SET status = 'cancelled'
    WHERE id = p_queue_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.record_campaign_event IS 'Records an event (open, click, etc.) for a queued email';

-- =============================================================================
-- Function: get_pending_campaign_emails
-- Returns pending emails ready to be sent
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_pending_campaign_emails(limit_count INTEGER DEFAULT 100)
RETURNS TABLE (
  queue_id UUID,
  campaign_id UUID,
  campaign_name TEXT,
  template_name TEXT,
  subject TEXT,
  user_id UUID,
  email TEXT,
  metadata JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    q.id AS queue_id,
    c.id AS campaign_id,
    c.name AS campaign_name,
    c.template_name,
    c.subject,
    q.user_id,
    q.email,
    q.metadata
  FROM public.email_campaign_queue q
  INNER JOIN public.email_campaigns c ON c.id = q.campaign_id
  WHERE q.status = 'pending'
    AND q.scheduled_for <= NOW()
    AND c.enabled = TRUE
  ORDER BY q.scheduled_for ASC, c.priority ASC
  LIMIT limit_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public.get_pending_campaign_emails IS 'Returns pending emails ready to be sent, ordered by scheduled time and priority';

-- =============================================================================
-- Grant execute permissions to service role
-- =============================================================================
GRANT EXECUTE ON FUNCTION public.get_non_converter_segment TO service_role;
GRANT EXECUTE ON FUNCTION public.get_non_uploader_segment TO service_role;
GRANT EXECUTE ON FUNCTION public.get_trial_user_segment TO service_role;
GRANT EXECUTE ON FUNCTION public.get_segment_count TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_campaign_sent TO service_role;
GRANT EXECUTE ON FUNCTION public.record_campaign_event TO service_role;
GRANT EXECUTE ON FUNCTION public.get_pending_campaign_emails TO service_role;
