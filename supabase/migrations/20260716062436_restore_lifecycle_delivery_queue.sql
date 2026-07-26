-- Restore lifecycle delivery queue safety after recipient-value rollout.
-- Marketing rows must be classified by the current policy before they can drain;
-- transactional rows remain independent of marketing recipient-value policy.

DROP FUNCTION IF EXISTS public.get_due_email_lifecycle_queue(INTEGER, TIMESTAMPTZ);

CREATE FUNCTION public.get_due_email_lifecycle_queue(
  p_limit INTEGER,
  p_due_before TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (
  id UUID,
  campaign_key TEXT,
  user_id UUID,
  recipient_email TEXT,
  scheduled_for TIMESTAMPTZ,
  status TEXT,
  reason TEXT,
  template_data JSONB,
  metadata JSONB,
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  subscription_id TEXT,
  processing_claim_id UUID,
  processing_claimed_at TIMESTAMPTZ,
  recipient_value_score INTEGER,
  recipient_value_band TEXT,
  recipient_value_decision TEXT,
  recipient_value_policy_version TEXT,
  campaign_name TEXT,
  campaign_category TEXT,
  campaign_template_name TEXT,
  campaign_email_type TEXT,
  campaign_preference_key TEXT,
  campaign_enabled BOOLEAN,
  campaign_cooldown_days INTEGER,
  campaign_priority TEXT,
  campaign_sort_priority INTEGER
)
LANGUAGE SQL
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
    q.recipient_value_score,
    q.recipient_value_band,
    q.recipient_value_decision,
    q.recipient_value_policy_version,
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
  JOIN public.email_lifecycle_campaigns AS c ON c.key = q.campaign_key
  WHERE q.status = 'pending'
    AND q.scheduled_for <= p_due_before
    AND c.enabled IS TRUE
    AND (
      q.processing_claim_id IS NULL
      OR q.processing_claimed_at < pg_catalog.now() - INTERVAL '10 minutes'
    )
    AND (
      c.email_type = 'transactional'
      OR (
        c.email_type = 'marketing'
        AND q.recipient_value_decision IS NOT NULL
        AND q.recipient_value_decision IN ('protected', 'keep_high', 'keep_medium')
        AND q.recipient_value_policy_version = 'v1'
      )
    )
  ORDER BY
    CASE c.priority
      WHEN 'transactional' THEN 0
      WHEN 'revenue_critical' THEN 1
      WHEN 'lifecycle' THEN 2
      WHEN 'education' THEN 3
      ELSE 4
    END,
    CASE q.recipient_value_decision
      WHEN 'protected' THEN 0
      WHEN 'keep_high' THEN 1
      WHEN 'keep_medium' THEN 2
      ELSE 3
    END,
    q.recipient_value_score DESC NULLS LAST,
    c.sort_priority DESC NULLS LAST,
    q.scheduled_for ASC,
    q.id ASC
  LIMIT LEAST(GREATEST(p_limit, 1), 250);
$$;

REVOKE ALL ON FUNCTION public.get_due_email_lifecycle_queue(INTEGER, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_due_email_lifecycle_queue(INTEGER, TIMESTAMPTZ)
  TO service_role;

-- Claim and reserve one marketing submission slot in the same transaction. Active
-- claims count as reservations until they are sent, released, or become stale.
CREATE OR REPLACE FUNCTION public.claim_email_lifecycle_queue_row_for_delivery(
  p_queue_id UUID,
  p_claim_id UUID,
  p_marketing_daily_limit INTEGER DEFAULT 200
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email_type TEXT;
  v_reserved_or_sent BIGINT;
  v_utc_day_start TIMESTAMPTZ :=
    pg_catalog.date_trunc('day', pg_catalog.now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
BEGIN
  SELECT c.email_type
  INTO v_email_type
  FROM public.email_lifecycle_queue AS q
  JOIN public.email_lifecycle_campaigns AS c ON c.key = q.campaign_key
  WHERE q.id = p_queue_id
    AND q.status = 'pending'
    AND (
      q.processing_claim_id IS NULL
      OR q.processing_claimed_at < pg_catalog.now() - INTERVAL '10 minutes'
    );

  IF NOT FOUND THEN
    RETURN 'not_claimed';
  END IF;

  IF v_email_type = 'marketing' THEN
    PERFORM pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtext('email_lifecycle_marketing_budget_' || v_utc_day_start::TEXT)
    );
    SELECT pg_catalog.count(*)
    INTO v_reserved_or_sent
    FROM public.email_lifecycle_queue AS q
    JOIN public.email_lifecycle_campaigns AS c ON c.key = q.campaign_key
    WHERE c.email_type = 'marketing'
      AND (
        (q.status = 'sent' AND q.sent_at >= v_utc_day_start)
        OR (
          q.status = 'pending'
          AND q.processing_claim_id IS NOT NULL
          AND q.processing_claimed_at >= pg_catalog.now() - INTERVAL '10 minutes'
        )
      );
    IF v_reserved_or_sent >= LEAST(GREATEST(p_marketing_daily_limit, 1), 200) THEN
      RETURN 'capacity_exhausted';
    END IF;
  END IF;

  UPDATE public.email_lifecycle_queue
  SET processing_claim_id = p_claim_id,
      processing_claimed_at = pg_catalog.now(),
      updated_at = pg_catalog.now()
  WHERE id = p_queue_id
    AND status = 'pending'
    AND (
      processing_claim_id IS NULL
      OR processing_claimed_at < pg_catalog.now() - INTERVAL '10 minutes'
    );
  RETURN CASE WHEN FOUND THEN 'claimed' ELSE 'not_claimed' END;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_email_lifecycle_queue_row_for_delivery(UUID, UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_email_lifecycle_queue_row_for_delivery(UUID, UUID, INTEGER)
  TO service_role;

CREATE OR REPLACE FUNCTION public.record_email_lifecycle_suppression(
  p_campaign_key TEXT,
  p_user_id UUID,
  p_recipient_email TEXT,
  p_scheduled_for TIMESTAMPTZ,
  p_reason TEXT,
  p_template_data JSONB,
  p_metadata JSONB,
  p_subscription_id TEXT DEFAULT NULL
)
RETURNS TABLE(queue_id UUID, inserted BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_queue_id UUID;
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext(p_user_id::TEXT || '|' || p_campaign_key || '|' || p_reason)
  );
  SELECT q.id INTO v_queue_id
  FROM public.email_lifecycle_queue AS q
  WHERE q.user_id = p_user_id
    AND q.campaign_key = p_campaign_key
    AND q.status = 'skipped'
    AND q.reason = p_reason
    AND q.created_at >= pg_catalog.now() - INTERVAL '24 hours'
  ORDER BY q.created_at DESC
  LIMIT 1;
  IF FOUND THEN
    RETURN QUERY SELECT v_queue_id, FALSE;
    RETURN;
  END IF;
  INSERT INTO public.email_lifecycle_queue (
    campaign_key, user_id, recipient_email, scheduled_for, status, reason,
    template_data, metadata, subscription_id
  ) VALUES (
    p_campaign_key, p_user_id, p_recipient_email, p_scheduled_for, 'skipped', p_reason,
    p_template_data, p_metadata, p_subscription_id
  ) RETURNING id INTO v_queue_id;
  RETURN QUERY SELECT v_queue_id, TRUE;
END;
$$;

REVOKE ALL ON FUNCTION public.record_email_lifecycle_suppression(
  TEXT, UUID, TEXT, TIMESTAMPTZ, TEXT, JSONB, JSONB, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_email_lifecycle_suppression(
  TEXT, UUID, TEXT, TIMESTAMPTZ, TEXT, JSONB, JSONB, TEXT
) TO service_role;

CREATE OR REPLACE FUNCTION public.get_email_recipient_value_transaction_signals(
  p_user_ids UUID[]
)
RETURNS TABLE (
  user_id UUID,
  prior_pack_purchase BOOLEAN,
  prior_subscription_transaction BOOLEAN,
  credits_consumed BIGINT
)
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    t.user_id,
    pg_catalog.bool_or(t.type = 'purchase') AS prior_pack_purchase,
    pg_catalog.bool_or(t.type = 'subscription') AS prior_subscription_transaction,
    coalesce(
      pg_catalog.sum(pg_catalog.abs(t.amount)) FILTER (
        WHERE t.type = 'usage' AND t.amount < 0
      ),
      0
    )::BIGINT AS credits_consumed
  FROM public.credit_transactions AS t
  WHERE t.user_id = ANY (p_user_ids)
  GROUP BY t.user_id;
$$;

REVOKE ALL ON FUNCTION public.get_email_recipient_value_transaction_signals(UUID[])
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_email_recipient_value_transaction_signals(UUID[])
  TO service_role;

CREATE INDEX IF NOT EXISTS idx_email_lifecycle_queue_due_claim
  ON public.email_lifecycle_queue(scheduled_for, processing_claimed_at, id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_email_lifecycle_queue_pending_audit
  ON public.email_lifecycle_queue(id)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_email_lifecycle_queue_user_sent_history
  ON public.email_lifecycle_queue(user_id, created_at DESC, campaign_key)
  WHERE status = 'sent';

CREATE INDEX IF NOT EXISTS idx_email_lifecycle_queue_suppression_observation
  ON public.email_lifecycle_queue(user_id, campaign_key, reason, created_at DESC)
  WHERE status = 'skipped';

CREATE INDEX IF NOT EXISTS idx_email_lifecycle_queue_value_due_order
  ON public.email_lifecycle_queue(
    recipient_value_decision,
    recipient_value_policy_version,
    recipient_value_score DESC,
    scheduled_for,
    id
  )
  WHERE status = 'pending';

-- Rollback: restore get_due_email_lifecycle_queue from
-- 20260712000300_email_recipient_value_due_queue.sql, then drop only the five
-- idx_email_lifecycle_queue_* indexes introduced above.
-- DROP FUNCTION IF EXISTS public.get_email_recipient_value_transaction_signals(UUID[]);
-- DROP FUNCTION IF EXISTS public.claim_email_lifecycle_queue_row_for_delivery(UUID, UUID, INTEGER);
-- DROP FUNCTION IF EXISTS public.record_email_lifecycle_suppression(TEXT, UUID, TEXT, TIMESTAMPTZ, TEXT, JSONB, JSONB, TEXT);
-- DROP INDEX IF EXISTS public.idx_email_lifecycle_queue_due_claim;
-- DROP INDEX IF EXISTS public.idx_email_lifecycle_queue_pending_audit;
-- DROP INDEX IF EXISTS public.idx_email_lifecycle_queue_user_sent_history;
-- DROP INDEX IF EXISTS public.idx_email_lifecycle_queue_suppression_observation;
-- DROP INDEX IF EXISTS public.idx_email_lifecycle_queue_value_due_order;
