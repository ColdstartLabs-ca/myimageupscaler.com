-- Production-readiness fixes for lifecycle queue concurrency and retention suppression.

ALTER TABLE public.email_lifecycle_queue
  ADD COLUMN IF NOT EXISTS subscription_id text,
  ADD COLUMN IF NOT EXISTS processing_claim_id uuid,
  ADD COLUMN IF NOT EXISTS processing_claimed_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_email_lifecycle_queue_subscription
  ON public.email_lifecycle_queue(subscription_id, campaign_key, status);

CREATE OR REPLACE FUNCTION public.claim_email_lifecycle_queue_row(
  p_queue_id uuid,
  p_claim_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  UPDATE public.email_lifecycle_queue
  SET processing_claim_id = p_claim_id,
      processing_claimed_at = now(),
      updated_at = now()
  WHERE id = p_queue_id
    AND status = 'pending'
    AND (
      processing_claim_id IS NULL
      OR processing_claimed_at < now() - interval '10 minutes'
    );
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_email_lifecycle_queue_row(uuid, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_email_lifecycle_queue_row(uuid, uuid)
  TO service_role;

DROP FUNCTION IF EXISTS public.get_due_email_lifecycle_queue(integer, timestamptz);

CREATE FUNCTION public.get_due_email_lifecycle_queue(
  p_limit integer,
  p_due_before timestamptz DEFAULT now()
)
RETURNS TABLE (
  id uuid,
  campaign_key text,
  user_id uuid,
  recipient_email text,
  scheduled_for timestamptz,
  status text,
  reason text,
  template_data jsonb,
  metadata jsonb,
  sent_at timestamptz,
  created_at timestamptz,
  subscription_id text,
  processing_claim_id uuid,
  processing_claimed_at timestamptz,
  campaign_name text,
  campaign_category text,
  campaign_template_name text,
  campaign_email_type text,
  campaign_preference_key text,
  campaign_enabled boolean,
  campaign_cooldown_days integer,
  campaign_priority text,
  campaign_sort_priority integer
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    q.id,
    q.campaign_key,
    q.user_id,
    q.recipient_email,
    q.scheduled_for,
    q.status,
    q.reason,
    q.template_data,
    q.metadata,
    q.sent_at,
    q.created_at,
    q.subscription_id,
    q.processing_claim_id,
    q.processing_claimed_at,
    c.name,
    c.category,
    c.template_name,
    c.email_type,
    c.preference_key,
    c.enabled,
    c.cooldown_days,
    c.priority,
    c.sort_priority
  FROM public.email_lifecycle_queue AS q
  LEFT JOIN public.email_lifecycle_campaigns AS c ON c.key = q.campaign_key
  WHERE q.status = 'pending'
    AND q.scheduled_for <= p_due_before
    AND (
      q.processing_claim_id IS NULL
      OR q.processing_claimed_at < now() - interval '10 minutes'
    )
  ORDER BY
    CASE c.priority
      WHEN 'transactional' THEN 0
      WHEN 'revenue_critical' THEN 1
      WHEN 'lifecycle' THEN 2
      WHEN 'education' THEN 3
      ELSE 4
    END,
    c.sort_priority DESC NULLS LAST,
    q.scheduled_for ASC,
    q.id ASC
  LIMIT LEAST(GREATEST(p_limit, 1), 250);
$$;

REVOKE ALL ON FUNCTION public.get_due_email_lifecycle_queue(integer, timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_due_email_lifecycle_queue(integer, timestamptz)
  TO service_role;

CREATE OR REPLACE FUNCTION public.capture_subscription_retention_state()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  cohort_variant text;
  accepted boolean;
  outcome text;
BEGIN
  SELECT e.variant
  INTO cohort_variant
  FROM public.subscription_retention_events e
  WHERE e.subscription_id = NEW.id
    AND e.event_type IN ('offer_shown', 'holdout_assigned')
    AND e.occurred_at >= now() - interval '90 days'
  ORDER BY e.occurred_at DESC
  LIMIT 1;

  SELECT EXISTS (
    SELECT 1
    FROM public.subscription_retention_events e
    WHERE e.subscription_id = NEW.id
      AND e.event_type = 'offer_accepted'
      AND e.occurred_at >= now() - interval '90 days'
  )
  INTO accepted;

  IF cohort_variant IS NOT NULL
     AND NEW.status = 'canceled'
     AND OLD.status IS DISTINCT FROM 'canceled' THEN
    outcome := CASE WHEN accepted THEN 'later_cancellation' ELSE 'cancellation_completed' END;
    INSERT INTO public.subscription_retention_events (
      event_key, subscription_id, user_id, event_type, variant, current_price_id
    ) VALUES (
      outcome || ':' || NEW.id, NEW.id, NEW.user_id, outcome,
      cohort_variant, NEW.price_id
    ) ON CONFLICT (event_key) DO NOTHING;
  ELSIF cohort_variant IS NOT NULL
        AND NEW.cancel_at_period_end IS TRUE
        AND OLD.cancel_at_period_end IS NOT TRUE THEN
    outcome := CASE WHEN accepted THEN 'later_cancellation' ELSE 'cancellation_scheduled' END;
    INSERT INTO public.subscription_retention_events (
      event_key, subscription_id, user_id, event_type, variant, current_price_id
    ) VALUES (
      outcome || ':' || NEW.id, NEW.id, NEW.user_id, outcome,
      cohort_variant, NEW.price_id
    ) ON CONFLICT (event_key) DO NOTHING;
  END IF;

  IF cohort_variant = 'treatment'
     AND (NEW.cancel_at_period_end IS DISTINCT FROM OLD.cancel_at_period_end
       OR NEW.status IS DISTINCT FROM OLD.status) THEN
    UPDATE public.email_lifecycle_queue
    SET status = 'cancelled',
        reason = 'subscription_cancellation_state_changed',
        updated_at = now()
    WHERE user_id = NEW.user_id
      AND subscription_id = NEW.id
      AND status = 'pending'
      AND campaign_key = 'cancelled-period-ending';
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.block_stale_retention_email()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.campaign_key = 'cancelled-period-ending'
     AND NEW.status = 'pending'
     AND NEW.subscription_id IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM public.subscription_retention_events e
       WHERE e.subscription_id = NEW.subscription_id
         AND e.event_type IN ('offer_shown', 'offer_accepted')
         AND e.occurred_at >= now() - interval '90 days'
     ) THEN
    NEW.status := 'cancelled';
    NEW.reason := 'subscription_retention_state_changed';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_subscription_retention_state()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.block_stale_retention_email()
  FROM PUBLIC, anon, authenticated;

