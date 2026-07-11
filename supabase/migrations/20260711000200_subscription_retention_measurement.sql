CREATE TABLE public.subscription_retention_rollout (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT true,
  treatment_percent integer NOT NULL DEFAULT 10 CHECK (treatment_percent BETWEEN 0 AND 100),
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.subscription_retention_rollout (id, enabled, treatment_percent)
VALUES (true, true, 10);
ALTER TABLE public.subscription_retention_rollout ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages subscription retention rollout"
  ON public.subscription_retention_rollout FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.subscription_retention_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  subscription_id text NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'holdout_assigned', 'offer_shown', 'offer_accepted', 'cancellation_scheduled',
    'cancellation_completed', 'later_cancellation', 'invoice_paid', 'billing_error',
    'refund', 'chargeback'
  )),
  variant text NOT NULL CHECK (variant IN ('treatment', 'holdout')),
  reason text,
  current_price_id text,
  target_price_id text,
  current_monthly_cents integer CHECK (current_monthly_cents >= 0),
  target_monthly_cents integer CHECK (target_monthly_cents >= 0),
  amount_cents integer CHECK (amount_cents >= 0),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_subscription_retention_events_subscription_time
  ON public.subscription_retention_events(subscription_id, occurred_at);
CREATE INDEX idx_subscription_retention_events_type_time
  ON public.subscription_retention_events(event_type, occurred_at);
ALTER TABLE public.subscription_retention_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages subscription retention events"
  ON public.subscription_retention_events FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.record_subscription_retention_refund(
  p_event_key text,
  p_subscription_id text,
  p_user_id uuid,
  p_variant text,
  p_amount_cents integer
)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  INSERT INTO public.subscription_retention_events (
    event_key, subscription_id, user_id, event_type, variant, amount_cents
  ) VALUES (
    p_event_key, p_subscription_id, p_user_id, 'refund', p_variant, p_amount_cents
  )
  ON CONFLICT (event_key) DO UPDATE SET
    amount_cents = GREATEST(
      public.subscription_retention_events.amount_cents,
      EXCLUDED.amount_cents
    ),
    occurred_at = GREATEST(
      public.subscription_retention_events.occurred_at,
      EXCLUDED.occurred_at
    );
$$;
REVOKE ALL ON FUNCTION public.record_subscription_retention_refund(text, text, uuid, text, integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_subscription_retention_refund(text, text, uuid, text, integer)
  TO service_role;

CREATE TABLE IF NOT EXISTS public.dispute_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispute_id text NOT NULL,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  charge_id text,
  invoice_id text,
  amount_cents integer NOT NULL,
  credits_held integer NOT NULL,
  status text NOT NULL CHECK (status IN ('created', 'updated', 'closed', 'won')),
  reason text,
  evidence_due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.dispute_events ADD COLUMN IF NOT EXISTS invoice_id text;
CREATE INDEX IF NOT EXISTS idx_dispute_events_user_id ON public.dispute_events(user_id);
CREATE INDEX IF NOT EXISTS idx_dispute_events_dispute_id ON public.dispute_events(dispute_id);
CREATE INDEX IF NOT EXISTS idx_dispute_events_status ON public.dispute_events(status);
ALTER TABLE public.dispute_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Service role manages dispute events" ON public.dispute_events;
CREATE POLICY "Service role manages dispute events"
  ON public.dispute_events FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.capture_subscription_retention_state()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  accepted boolean;
  treatment boolean;
  outcome text;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM public.subscription_retention_events e
    WHERE e.subscription_id = NEW.id AND e.event_type = 'offer_accepted'
  ) INTO accepted;
  SELECT EXISTS (
    SELECT 1 FROM public.subscription_retention_events e
    WHERE e.subscription_id = NEW.id AND e.event_type = 'offer_shown'
  ) INTO treatment;

  IF NEW.status = 'canceled' AND OLD.status IS DISTINCT FROM 'canceled' THEN
    outcome := CASE WHEN accepted THEN 'later_cancellation' ELSE 'cancellation_completed' END;
    INSERT INTO public.subscription_retention_events (
      event_key, subscription_id, user_id, event_type, variant, current_price_id
    ) VALUES (
      outcome || ':' || NEW.id, NEW.id, NEW.user_id, outcome,
      CASE WHEN treatment THEN 'treatment' ELSE 'holdout' END, NEW.price_id
    ) ON CONFLICT (event_key) DO NOTHING;
  ELSIF NEW.cancel_at_period_end IS TRUE AND OLD.cancel_at_period_end IS NOT TRUE THEN
    outcome := CASE WHEN accepted THEN 'later_cancellation' ELSE 'cancellation_scheduled' END;
    INSERT INTO public.subscription_retention_events (
      event_key, subscription_id, user_id, event_type, variant, current_price_id
    ) VALUES (
      outcome || ':' || NEW.id, NEW.id, NEW.user_id, outcome,
      CASE WHEN treatment THEN 'treatment' ELSE 'holdout' END, NEW.price_id
    ) ON CONFLICT (event_key) DO NOTHING;
  END IF;

  IF NEW.cancel_at_period_end IS DISTINCT FROM OLD.cancel_at_period_end
     OR NEW.status IS DISTINCT FROM OLD.status THEN
    UPDATE public.email_lifecycle_queue
    SET status = 'cancelled', reason = 'subscription_cancellation_state_changed', updated_at = now()
    WHERE user_id = NEW.user_id AND status = 'pending'
      AND campaign_key = 'cancelled-period-ending';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER capture_subscription_retention_state
AFTER UPDATE OF cancel_at_period_end, status ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.capture_subscription_retention_state();

CREATE OR REPLACE FUNCTION public.block_stale_retention_email()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF NEW.campaign_key = 'cancelled-period-ending' AND EXISTS (
    SELECT 1 FROM public.subscription_retention_events e
    WHERE e.user_id = NEW.user_id
  ) THEN
    NEW.status := 'cancelled';
    NEW.reason := 'subscription_retention_state_changed';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER block_stale_retention_email
BEFORE INSERT OR UPDATE OF status ON public.email_lifecycle_queue
FOR EACH ROW EXECUTE FUNCTION public.block_stale_retention_email();

CREATE OR REPLACE FUNCTION public.capture_subscription_retention_chargeback()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  matched_subscription_id text;
  matched_variant text;
BEGIN
  SELECT e.subscription_id, e.variant INTO matched_subscription_id, matched_variant
  FROM public.subscription_retention_events e
  WHERE e.event_key = 'invoice_paid:' || COALESCE(NEW.invoice_id, '')
  LIMIT 1;
  IF matched_subscription_id IS NOT NULL THEN
    INSERT INTO public.subscription_retention_events (
      event_key, subscription_id, user_id, event_type, variant, amount_cents
    ) VALUES (
      'chargeback:' || NEW.dispute_id, matched_subscription_id, NEW.user_id,
      'chargeback', matched_variant, NEW.amount_cents
    ) ON CONFLICT (event_key) DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER capture_subscription_retention_chargeback
AFTER INSERT ON public.dispute_events
FOR EACH ROW EXECUTE FUNCTION public.capture_subscription_retention_chargeback();

CREATE OR REPLACE FUNCTION public.get_subscription_retention_health(
  p_since timestamptz DEFAULT (now() - interval '90 days')
)
RETURNS TABLE (
  variant text, eligible_count bigint, offer_shown_count bigint, accepted_count bigint,
  cancellation_scheduled_count bigint, cancellation_completed_count bigint,
  retained_30d_count bigint, retained_60d_count bigint,
  retained_60d_revenue_cents bigint, incremental_retained_revenue_cents bigint,
  refund_cents bigint, chargeback_cents bigint, later_cancellation_count bigint,
  complaint_count bigint, billing_error_count bigint, stop_recommended boolean
)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  WITH cohorts AS (
    SELECT * FROM public.subscription_retention_events
    WHERE occurred_at >= p_since AND event_type IN ('holdout_assigned', 'offer_shown')
  ), metrics AS (
    SELECT
      c.variant,
      count(*) AS eligible_count,
      count(*) FILTER (WHERE c.event_type = 'offer_shown') AS offer_shown_count,
      count(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM public.subscription_retention_events e
        WHERE e.subscription_id = c.subscription_id AND e.event_type = 'offer_accepted'
      )) AS accepted_count,
      count(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM public.subscription_retention_events e
        WHERE e.subscription_id = c.subscription_id AND e.event_type = 'cancellation_scheduled'
      )) AS cancellation_scheduled_count,
      count(*) FILTER (WHERE EXISTS (
        SELECT 1 FROM public.subscription_retention_events e
        WHERE e.subscription_id = c.subscription_id AND e.event_type = 'cancellation_completed'
      )) AS cancellation_completed_count,
      count(*) FILTER (WHERE c.occurred_at <= now() - interval '30 days' AND EXISTS (
        SELECT 1 FROM public.subscription_retention_events paid
        WHERE paid.subscription_id = c.subscription_id AND paid.event_type = 'invoice_paid'
          AND paid.occurred_at > c.occurred_at
          AND paid.occurred_at <= c.occurred_at + interval '30 days'
      ) AND NOT EXISTS (
        SELECT 1 FROM public.subscription_retention_events stopped
        WHERE stopped.subscription_id = c.subscription_id
          AND stopped.event_type IN ('cancellation_completed', 'later_cancellation')
          AND stopped.occurred_at <= c.occurred_at + interval '30 days'
      )) AS retained_30d_count,
      count(*) FILTER (WHERE c.occurred_at <= now() - interval '60 days' AND EXISTS (
        SELECT 1 FROM public.subscription_retention_events paid
        WHERE paid.subscription_id = c.subscription_id AND paid.event_type = 'invoice_paid'
          AND paid.occurred_at > c.occurred_at
          AND paid.occurred_at <= c.occurred_at + interval '60 days'
      ) AND NOT EXISTS (
        SELECT 1 FROM public.subscription_retention_events stopped
        WHERE stopped.subscription_id = c.subscription_id
          AND stopped.event_type IN ('cancellation_completed', 'later_cancellation')
          AND stopped.occurred_at <= c.occurred_at + interval '60 days'
      )) AS retained_60d_count,
      COALESCE(sum((SELECT sum(paid.amount_cents)
        FROM public.subscription_retention_events paid
        WHERE paid.subscription_id = c.subscription_id AND paid.event_type = 'invoice_paid'
          AND paid.occurred_at > c.occurred_at
          AND paid.occurred_at <= c.occurred_at + interval '60 days'
      )) FILTER (WHERE c.occurred_at <= now() - interval '60 days'), 0)::bigint
        AS retained_60d_revenue_cents
    FROM cohorts c GROUP BY c.variant
  ), harms AS (
    SELECT c.variant,
      sum(COALESCE((SELECT sum(e.amount_cents)
        FROM public.subscription_retention_events e
        WHERE e.subscription_id = c.subscription_id AND e.event_type = 'refund'
          AND e.occurred_at >= c.occurred_at), 0))::bigint refund_cents,
      sum(COALESCE((SELECT sum(e.amount_cents)
        FROM public.subscription_retention_events e
        WHERE e.subscription_id = c.subscription_id AND e.event_type = 'chargeback'
          AND e.occurred_at >= c.occurred_at), 0))::bigint chargeback_cents,
      sum((SELECT count(*) FROM public.subscription_retention_events e
        WHERE e.subscription_id = c.subscription_id AND e.event_type = 'later_cancellation'
          AND e.occurred_at >= c.occurred_at))::bigint later_cancellation_count,
      sum((SELECT count(*) FROM public.subscription_retention_events e
        WHERE e.subscription_id = c.subscription_id AND e.event_type = 'billing_error'
          AND e.occurred_at >= c.occurred_at))::bigint billing_error_count,
      sum((SELECT count(*) FROM public.email_lifecycle_events mail
        WHERE mail.user_id = c.user_id AND mail.occurred_at >= c.occurred_at
          AND mail.event_type = 'failed'
          AND lower(COALESCE(mail.metadata ->> 'error', '')) ~ 'complaint|complained'))::bigint
        complaint_count
    FROM cohorts c GROUP BY c.variant
  )
  SELECT m.variant, m.eligible_count, m.offer_shown_count, m.accepted_count,
    m.cancellation_scheduled_count, m.cancellation_completed_count,
    m.retained_30d_count, m.retained_60d_count, m.retained_60d_revenue_cents,
    CASE WHEN m.variant = 'treatment' THEN (m.retained_60d_revenue_cents - round(
      m.eligible_count * COALESCE((SELECT hm.retained_60d_revenue_cents::numeric /
        NULLIF(hm.eligible_count, 0) FROM metrics hm WHERE hm.variant = 'holdout'), 0)
    ))::bigint ELSE 0 END,
    COALESCE(h.refund_cents, 0), COALESCE(h.chargeback_cents, 0),
    COALESCE(h.later_cancellation_count, 0), COALESCE(h.complaint_count, 0),
    COALESCE(h.billing_error_count, 0),
    (m.eligible_count >= 100 AND (
      COALESCE(h.refund_cents + h.chargeback_cents, 0) > m.retained_60d_revenue_cents * 0.1
      OR COALESCE(h.later_cancellation_count, 0)::numeric / m.eligible_count > 0.25
      OR COALESCE(h.complaint_count, 0)::numeric / m.eligible_count > 0.001
      OR COALESCE(h.billing_error_count, 0)::numeric / m.eligible_count > 0.05
    ))
  FROM metrics m LEFT JOIN harms h USING (variant) ORDER BY m.variant;
$$;
REVOKE ALL ON FUNCTION public.get_subscription_retention_health(timestamptz)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_subscription_retention_health(timestamptz) TO service_role;
