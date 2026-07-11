CREATE TABLE public.subscription_retention_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_key text NOT NULL UNIQUE,
  subscription_id uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'holdout_assigned', 'offer_shown', 'offer_accepted', 'cancellation_completed',
    'later_cancellation', 'refund', 'chargeback'
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
  ON public.subscription_retention_events FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.capture_subscription_retention_cancellation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  accepted boolean;
  treatment boolean;
  outcome text;
BEGIN
  IF NEW.cancel_at_period_end IS TRUE AND OLD.cancel_at_period_end IS NOT TRUE THEN
    SELECT EXISTS (
      SELECT 1 FROM public.subscription_retention_events e
      WHERE e.subscription_id = NEW.id AND e.event_type = 'offer_accepted'
    ) INTO accepted;
    SELECT EXISTS (
      SELECT 1 FROM public.subscription_retention_events e
      WHERE e.subscription_id = NEW.id AND e.event_type = 'offer_shown'
    ) INTO treatment;
    outcome := CASE WHEN accepted THEN 'later_cancellation' ELSE 'cancellation_completed' END;

    INSERT INTO public.subscription_retention_events (
      event_key, subscription_id, user_id, event_type, variant, current_price_id
    ) VALUES (
      outcome || ':' || NEW.id::text,
      NEW.id,
      NEW.user_id,
      outcome,
      CASE WHEN treatment THEN 'treatment' ELSE 'holdout' END,
      NEW.price_id
    ) ON CONFLICT (event_key) DO NOTHING;

    UPDATE public.email_lifecycle_queue
    SET status = 'cancelled', reason = 'subscription_cancellation_state_changed', updated_at = now()
    WHERE user_id = NEW.user_id
      AND status = 'pending'
      AND campaign_key = 'cancelled-period-ending';
  ELSIF NEW.cancel_at_period_end IS FALSE AND OLD.cancel_at_period_end IS TRUE THEN
    UPDATE public.email_lifecycle_queue
    SET status = 'cancelled', reason = 'subscription_cancellation_state_changed', updated_at = now()
    WHERE user_id = NEW.user_id
      AND status = 'pending'
      AND campaign_key = 'cancelled-period-ending';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER capture_subscription_retention_cancellation
AFTER UPDATE OF cancel_at_period_end ON public.subscriptions
FOR EACH ROW EXECUTE FUNCTION public.capture_subscription_retention_cancellation();

CREATE OR REPLACE FUNCTION public.capture_subscription_retention_chargeback()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  retained_subscription_id uuid;
BEGIN
  SELECT e.subscription_id INTO retained_subscription_id
  FROM public.subscription_retention_events e
  WHERE e.user_id = NEW.user_id AND e.event_type = 'offer_accepted'
  ORDER BY e.occurred_at DESC LIMIT 1;

  IF retained_subscription_id IS NOT NULL THEN
    INSERT INTO public.subscription_retention_events (
      event_key, subscription_id, user_id, event_type, variant, amount_cents
    ) VALUES (
      'chargeback:' || NEW.dispute_id,
      retained_subscription_id,
      NEW.user_id,
      'chargeback',
      'treatment',
      NEW.amount_cents
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
  variant text,
  eligible_count bigint,
  offer_shown_count bigint,
  accepted_count bigint,
  cancellation_count bigint,
  retained_30d_count bigint,
  retained_60d_count bigint,
  retained_60d_revenue_cents bigint,
  incremental_retained_revenue_cents bigint,
  refund_cents bigint,
  chargeback_cents bigint,
  later_cancellation_count bigint,
  stop_recommended boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH cohorts AS (
    SELECT * FROM public.subscription_retention_events
    WHERE occurred_at >= p_since AND event_type IN ('holdout_assigned', 'offer_shown')
  ), metrics AS (
    SELECT
      c.variant,
      count(*) AS eligible_count,
      count(*) FILTER (WHERE c.event_type = 'offer_shown') AS offer_shown_count,
      count(*) FILTER (WHERE a.id IS NOT NULL) AS accepted_count,
      count(*) FILTER (WHERE cancelled.id IS NOT NULL) AS cancellation_count,
      count(*) FILTER (
        WHERE c.occurred_at <= now() - interval '30 days'
          AND cancel_30.id IS NULL
      ) AS retained_30d_count,
      count(*) FILTER (
        WHERE c.occurred_at <= now() - interval '60 days'
          AND cancel_60.id IS NULL
      ) AS retained_60d_count,
      COALESCE(sum(
        CASE WHEN c.occurred_at <= now() - interval '60 days' AND cancel_60.id IS NULL
          THEN 2 * COALESCE(a.target_monthly_cents, c.current_monthly_cents, 0) ELSE 0 END
      ), 0)::bigint AS retained_60d_revenue_cents
    FROM cohorts c
    LEFT JOIN public.subscription_retention_events a
      ON a.subscription_id = c.subscription_id AND a.event_type = 'offer_accepted'
    LEFT JOIN public.subscription_retention_events cancelled
      ON cancelled.subscription_id = c.subscription_id
     AND cancelled.event_type IN ('cancellation_completed', 'later_cancellation')
    LEFT JOIN public.subscription_retention_events cancel_30
      ON cancel_30.subscription_id = c.subscription_id
     AND cancel_30.event_type IN ('cancellation_completed', 'later_cancellation')
     AND cancel_30.occurred_at <= c.occurred_at + interval '30 days'
    LEFT JOIN public.subscription_retention_events cancel_60
      ON cancel_60.subscription_id = c.subscription_id
     AND cancel_60.event_type IN ('cancellation_completed', 'later_cancellation')
     AND cancel_60.occurred_at <= c.occurred_at + interval '60 days'
    GROUP BY c.variant
  ), harms AS (
    SELECT
      variant,
      COALESCE(sum(amount_cents) FILTER (WHERE event_type = 'refund'), 0)::bigint refund_cents,
      COALESCE(sum(amount_cents) FILTER (WHERE event_type = 'chargeback'), 0)::bigint chargeback_cents,
      count(*) FILTER (WHERE event_type = 'later_cancellation') later_cancellation_count
    FROM public.subscription_retention_events
    WHERE occurred_at >= p_since
    GROUP BY variant
  )
  SELECT
    m.variant, m.eligible_count, m.offer_shown_count, m.accepted_count,
    m.cancellation_count, m.retained_30d_count, m.retained_60d_count,
    m.retained_60d_revenue_cents,
    CASE WHEN m.variant = 'treatment' THEN (
      m.retained_60d_revenue_cents - round(
        m.eligible_count * COALESCE(
          (SELECT hm.retained_60d_revenue_cents::numeric / NULLIF(hm.eligible_count, 0)
           FROM metrics hm WHERE hm.variant = 'holdout'),
          0
        )
      )
    )::bigint ELSE 0 END,
    COALESCE(h.refund_cents, 0), COALESCE(h.chargeback_cents, 0),
    COALESCE(h.later_cancellation_count, 0),
    (m.eligible_count >= 100 AND (
      COALESCE(h.refund_cents + h.chargeback_cents, 0) > m.retained_60d_revenue_cents * 0.1
      OR COALESCE(h.later_cancellation_count, 0)::numeric / m.eligible_count > 0.25
    )) AS stop_recommended
  FROM metrics m LEFT JOIN harms h USING (variant)
  ORDER BY m.variant;
$$;

REVOKE ALL ON FUNCTION public.get_subscription_retention_health(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_subscription_retention_health(timestamptz) TO service_role;
