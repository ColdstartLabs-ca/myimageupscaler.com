-- Restore lifecycle queue eligibility without reopening fail-open delivery.
-- Policy v1 remains stable until the controlled release produces sufficient
-- outcome evidence for a separately versioned threshold change.

ALTER TABLE public.email_lifecycle_queue
  ADD COLUMN IF NOT EXISTS recipient_value_holdout_released_at TIMESTAMPTZ NULL;

-- Existing rows are deliberately not assigned a blanket decision here. They
-- must be backfilled through email:queue:audit:prod and the guarded apply RPC so
-- country caps, purchase history, intent, preferences, and deliverability
-- signals are all evaluated before any row becomes eligible.

CREATE OR REPLACE FUNCTION public.enforce_email_lifecycle_marketing_classification()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_email_type TEXT;
BEGIN
  IF NEW.status <> 'pending' THEN
    RETURN NEW;
  END IF;

  SELECT c.email_type
  INTO v_email_type
  FROM public.email_lifecycle_campaigns AS c
  WHERE c.key = NEW.campaign_key;

  IF v_email_type = 'marketing'
     AND (
       NEW.recipient_value_score IS NULL
       OR NEW.recipient_value_band IS NULL
       OR NEW.recipient_value_decision IS NULL
       OR NEW.recipient_value_policy_version IS NULL
       OR NEW.recipient_value_classified_at IS NULL
       OR NEW.recipient_value_reasons IS NULL
       OR pg_catalog.jsonb_typeof(NEW.recipient_value_reasons) <> 'array'
     ) THEN
    RAISE EXCEPTION 'Unclassified pending marketing lifecycle row is forbidden'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_email_lifecycle_marketing_classification
  ON public.email_lifecycle_queue;
CREATE TRIGGER enforce_email_lifecycle_marketing_classification
  BEFORE INSERT OR UPDATE OF
    campaign_key,
    status,
    recipient_value_score,
    recipient_value_band,
    recipient_value_decision,
    recipient_value_reasons,
    recipient_value_policy_version,
    recipient_value_classified_at
  ON public.email_lifecycle_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_email_lifecycle_marketing_classification();

-- The dry-run checksum proves the persisted run definition. Queue drift is
-- checked only for that run's item set; unrelated enqueues no longer block apply.
CREATE OR REPLACE FUNCTION public.apply_email_recipient_value_run(
  p_run_id UUID,
  p_policy_version TEXT,
  p_expected_count INTEGER,
  p_candidate_checksum TEXT,
  p_action TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_run public.email_queue_pruning_runs%ROWTYPE;
  v_item_count INTEGER;
  v_changed_count INTEGER := 0;
  v_cancelled_count INTEGER := 0;
  v_held_count INTEGER := 0;
  v_kept_count INTEGER := 0;
BEGIN
  IF p_action NOT IN ('apply', 'rollback') THEN
    RAISE EXCEPTION 'Invalid recipient-value action';
  END IF;
  IF NOT pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtext('email_queue_pruning')) THEN
    RAISE EXCEPTION 'Another recipient-value pruning run is already applying';
  END IF;

  SELECT * INTO v_run
  FROM public.email_queue_pruning_runs
  WHERE id = p_run_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recipient-value pruning run not found';
  END IF;
  IF v_run.policy_version IS DISTINCT FROM p_policy_version
     OR v_run.candidate_count IS DISTINCT FROM p_expected_count THEN
    RAISE EXCEPTION 'Recipient-value run guard does not match persisted dry-run';
  END IF;
  IF p_candidate_checksum IS NULL
     OR p_candidate_checksum IS DISTINCT FROM v_run.candidate_checksum THEN
    RAISE EXCEPTION 'Recipient-value checksum does not match persisted dry-run';
  END IF;

  IF p_action = 'rollback' THEN
    IF v_run.mode = 'rolled_back' THEN
      RETURN pg_catalog.jsonb_build_object(
        'run_id', p_run_id, 'action', p_action, 'mode', v_run.mode, 'changed_count', 0
      );
    END IF;
    IF v_run.mode <> 'applied' THEN
      RAISE EXCEPTION 'Only an applied recipient-value run can be rolled back';
    END IF;

    UPDATE public.email_lifecycle_queue AS q
    SET status = 'pending',
        reason = 'recipient_value_rollback_hold',
        recipient_value_score = 10,
        recipient_value_band = 'experiment',
        recipient_value_decision = 'hold_experiment',
        recipient_value_reasons = '["recipient_value_rollback_hold"]'::jsonb,
        recipient_value_policy_version = 'v1',
        recipient_value_classified_at = pg_catalog.now(),
        recipient_value_run_id = NULL,
        recipient_value_holdout_released_at = NULL,
        updated_at = pg_catalog.now()
    WHERE q.recipient_value_run_id = p_run_id
      AND q.recipient_value_decision = 'cancel'
      AND q.status = 'cancelled'
      AND q.reason = 'recipient_value_pruned'
      AND NOT EXISTS (
        SELECT 1
        FROM public.email_lifecycle_queue AS newer
        WHERE newer.user_id IS NOT DISTINCT FROM q.user_id
          AND newer.campaign_key = q.campaign_key
          AND newer.id <> q.id
          AND newer.status = 'pending'
      );
    GET DIAGNOSTICS v_changed_count = ROW_COUNT;

    UPDATE public.email_queue_pruning_runs
    SET mode = 'rolled_back', rolled_back_at = pg_catalog.now()
    WHERE id = p_run_id;
    RETURN pg_catalog.jsonb_build_object(
      'run_id', p_run_id, 'action', p_action, 'mode', 'rolled_back',
      'changed_count', v_changed_count, 'cancelled_count', v_changed_count
    );
  END IF;

  IF v_run.mode = 'applied' THEN
    RETURN pg_catalog.jsonb_build_object(
      'run_id', p_run_id, 'action', p_action, 'mode', v_run.mode,
      'changed_count', 0, 'cancelled_count', 0, 'held_count', 0, 'kept_count', 0
    );
  END IF;
  IF v_run.mode <> 'dry_run' THEN
    RAISE EXCEPTION 'Recipient-value run is not applicable';
  END IF;

  SELECT pg_catalog.count(*)::INTEGER
  INTO v_item_count
  FROM public.email_queue_pruning_run_items AS i
  WHERE i.run_id = p_run_id;
  IF v_item_count IS DISTINCT FROM p_expected_count THEN
    RAISE EXCEPTION 'Recipient-value run item count does not match dry-run';
  END IF;

  -- Lock the exact run-item rows before validating them. This closes the gap
  -- where a sender could claim or mutate a row after validation but before apply.
  PERFORM 1
  FROM public.email_lifecycle_queue AS q
  JOIN public.email_queue_pruning_run_items AS i ON i.queue_id = q.id
  WHERE i.run_id = p_run_id
  FOR UPDATE OF q;

  IF EXISTS (
    SELECT 1
    FROM public.email_queue_pruning_run_items AS i
    LEFT JOIN public.email_lifecycle_queue AS q
      ON q.id = i.queue_id AND q.status = 'pending'
    WHERE i.run_id = p_run_id
      AND (
        q.id IS NULL
        OR q.updated_at IS DISTINCT FROM i.queue_updated_at
      )
  ) THEN
    RAISE EXCEPTION 'Recipient-value run item changed; refusing mutation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.email_queue_pruning_run_items AS i
    JOIN public.email_lifecycle_queue AS q ON q.id = i.queue_id
    LEFT JOIN public.email_lifecycle_campaigns AS c ON c.key = q.campaign_key
    WHERE i.run_id = p_run_id
      AND (
        i.recipient_value_policy_version IS DISTINCT FROM p_policy_version
        OR i.recipient_value_reasons IS NULL
        OR pg_catalog.jsonb_typeof(i.recipient_value_reasons) <> 'array'
        OR i.recipient_value_decision NOT IN (
          'protected', 'keep_high', 'keep_medium', 'hold_experiment', 'cancel'
        )
        OR i.recipient_value_band NOT IN (
          'protected', 'high', 'medium', 'experiment', 'cancel'
        )
        OR (i.recipient_value_decision = 'protected' AND i.recipient_value_band <> 'protected')
        OR (i.recipient_value_decision = 'keep_high' AND i.recipient_value_band <> 'high')
        OR (i.recipient_value_decision = 'keep_medium' AND i.recipient_value_band <> 'medium')
        OR (
          i.recipient_value_decision = 'hold_experiment'
          AND i.recipient_value_band <> 'experiment'
        )
        OR (i.recipient_value_decision = 'cancel' AND i.recipient_value_band <> 'cancel')
        OR (
          i.recipient_value_decision = 'cancel'
          AND COALESCE(c.email_type, 'transactional') = 'transactional'
        )
      )
  ) THEN
    RAISE EXCEPTION 'Recipient-value run contains an unsafe decision';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.email_queue_pruning_run_items AS i
    JOIN public.email_lifecycle_queue AS q ON q.id = i.queue_id
    WHERE i.run_id = p_run_id
      AND q.processing_claim_id IS NOT NULL
      AND q.processing_claimed_at >= pg_catalog.now() - INTERVAL '10 minutes'
  ) THEN
    RAISE EXCEPTION 'Recipient-value run item contains a concurrent claim';
  END IF;

  UPDATE public.email_lifecycle_queue AS q
  SET recipient_value_score = i.recipient_value_score,
      recipient_value_band = i.recipient_value_band,
      recipient_value_decision = i.recipient_value_decision,
      recipient_value_reasons = i.recipient_value_reasons,
      recipient_value_policy_version = i.recipient_value_policy_version,
      recipient_value_classified_at = pg_catalog.now(),
      recipient_value_run_id = p_run_id,
      recipient_value_holdout_released_at = NULL,
      status = CASE WHEN i.recipient_value_decision = 'cancel' THEN 'cancelled' ELSE q.status END,
      reason = CASE
        WHEN i.recipient_value_decision = 'cancel' THEN 'recipient_value_pruned'
        ELSE q.reason
      END,
      updated_at = pg_catalog.now()
  FROM public.email_queue_pruning_run_items AS i
  WHERE i.run_id = p_run_id
    AND q.id = i.queue_id
    AND q.status = 'pending'
    AND q.updated_at IS NOT DISTINCT FROM i.queue_updated_at;
  GET DIAGNOSTICS v_changed_count = ROW_COUNT;
  IF v_changed_count IS DISTINCT FROM p_expected_count THEN
    RAISE EXCEPTION 'Recipient-value run changed during apply; mutation rolled back';
  END IF;

  SELECT
    pg_catalog.count(*) FILTER (WHERE i.recipient_value_decision = 'cancel')::INTEGER,
    pg_catalog.count(*) FILTER (
      WHERE i.recipient_value_decision = 'hold_experiment'
    )::INTEGER,
    pg_catalog.count(*) FILTER (
      WHERE i.recipient_value_decision IN ('protected', 'keep_high', 'keep_medium')
    )::INTEGER
  INTO v_cancelled_count, v_held_count, v_kept_count
  FROM public.email_queue_pruning_run_items AS i
  WHERE i.run_id = p_run_id;

  UPDATE public.email_queue_pruning_runs
  SET mode = 'applied', applied_at = pg_catalog.now()
  WHERE id = p_run_id;
  RETURN pg_catalog.jsonb_build_object(
    'run_id', p_run_id, 'action', p_action, 'mode', 'applied',
    'changed_count', v_changed_count, 'cancelled_count', v_cancelled_count,
    'held_count', v_held_count, 'kept_count', v_kept_count
  );
END;
$$;

-- Persist one deterministic 10% country/campaign release cohort per UTC day.
CREATE OR REPLACE FUNCTION public.release_email_recipient_value_holdout(
  p_release_date DATE DEFAULT (pg_catalog.now() AT TIME ZONE 'UTC')::DATE,
  p_daily_limit INTEGER DEFAULT 100
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_released_today INTEGER;
  v_changed INTEGER;
  v_limit INTEGER := LEAST(GREATEST(p_daily_limit, 1), 100);
BEGIN
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtext('email_recipient_value_holdout_' || p_release_date::TEXT)
  );

  SELECT pg_catalog.count(*)::INTEGER
  INTO v_released_today
  FROM public.email_lifecycle_queue AS q
  WHERE q.recipient_value_holdout_released_at >= p_release_date::TIMESTAMPTZ
    AND q.recipient_value_holdout_released_at < (p_release_date + 1)::TIMESTAMPTZ;
  IF v_released_today > 0 THEN
    RETURN 0;
  END IF;

  WITH stratified AS (
    SELECT
      q.id,
      q.scheduled_for,
      pg_catalog.count(*) OVER (
        PARTITION BY COALESCE(p.signup_country, 'UNKNOWN'), q.campaign_key
      ) AS stratum_count,
      pg_catalog.row_number() OVER (
        PARTITION BY COALESCE(p.signup_country, 'UNKNOWN'), q.campaign_key
        ORDER BY pg_catalog.encode(
          extensions.digest(
            q.recipient_value_policy_version || '|' || p_release_date::TEXT || '|'
              || q.user_id::TEXT || '|' || COALESCE(p.signup_country, 'UNKNOWN')
              || '|' || q.campaign_key,
            'sha256'
          ),
          'hex'
        )
      ) AS stratum_position
    FROM public.email_lifecycle_queue AS q
    JOIN public.email_lifecycle_campaigns AS c ON c.key = q.campaign_key
    LEFT JOIN public.profiles AS p ON p.id = q.user_id
    WHERE q.status = 'pending'
      AND c.enabled IS TRUE
      AND c.email_type = 'marketing'
      AND q.user_id IS NOT NULL
      AND q.recipient_value_decision = 'hold_experiment'
      AND q.recipient_value_policy_version = 'v1'
      AND q.recipient_value_holdout_released_at IS NULL
  ),
  selected AS (
    SELECT s.id
    FROM stratified AS s
    WHERE s.stratum_position <= pg_catalog.floor(s.stratum_count * 0.1)
    ORDER BY s.scheduled_for ASC, s.stratum_position ASC, s.id ASC
    LIMIT GREATEST(v_limit - v_released_today, 0)
  )
  UPDATE public.email_lifecycle_queue AS q
  SET recipient_value_holdout_released_at = p_release_date::TIMESTAMPTZ,
      updated_at = pg_catalog.now()
  FROM selected AS s
  WHERE q.id = s.id;
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  RETURN v_changed;
END;
$$;

REVOKE ALL ON FUNCTION public.release_email_recipient_value_holdout(DATE, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_email_recipient_value_holdout(DATE, INTEGER)
  TO service_role;

CREATE OR REPLACE FUNCTION public.cancel_expired_email_lifecycle_queue()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_changed INTEGER;
BEGIN
  UPDATE public.email_lifecycle_queue AS q
  SET status = 'cancelled',
      reason = CASE
        WHEN q.campaign_key = 'checkout-abandoned-24h' THEN 'stale_checkout_recovery'
        WHEN q.campaign_key = 'first-result-followup' THEN 'stale_first_result_followup'
        ELSE 'stale_lifecycle_trigger'
      END,
      processing_claim_id = NULL,
      processing_claimed_at = NULL,
      updated_at = pg_catalog.now()
  FROM public.email_lifecycle_campaigns AS c
  WHERE c.key = q.campaign_key
    AND c.email_type = 'marketing'
    AND q.status = 'pending'
    AND (
      (q.campaign_key = 'checkout-abandoned-24h'
        AND q.scheduled_for < pg_catalog.now() - INTERVAL '72 hours')
      OR (q.campaign_key = 'first-result-followup'
        AND q.scheduled_for < pg_catalog.now() - INTERVAL '7 days')
      OR q.scheduled_for < pg_catalog.now() - INTERVAL '30 days'
    );
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  RETURN v_changed;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_expired_email_lifecycle_queue()
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_expired_email_lifecycle_queue()
  TO service_role;

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
  recipient_value_classified_at TIMESTAMPTZ,
  recipient_value_holdout_released_at TIMESTAMPTZ,
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
  WITH eligible AS (
    SELECT
      q.*,
      c.name AS lifecycle_campaign_name,
      c.category AS lifecycle_campaign_category,
      c.template_name AS lifecycle_campaign_template_name,
      c.email_type AS lifecycle_campaign_email_type,
      c.preference_key AS lifecycle_campaign_preference_key,
      c.enabled AS lifecycle_campaign_enabled,
      c.cooldown_days AS lifecycle_campaign_cooldown_days,
      c.priority AS lifecycle_campaign_priority,
      c.sort_priority AS lifecycle_campaign_sort_priority,
      pg_catalog.row_number() OVER (
        PARTITION BY q.campaign_key
        ORDER BY q.scheduled_for ASC, q.id ASC
      ) AS campaign_position
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
          AND q.recipient_value_policy_version = 'v1'
          AND (
            q.recipient_value_decision IN ('protected', 'keep_high', 'keep_medium')
            OR (
              q.recipient_value_decision = 'hold_experiment'
              AND q.recipient_value_holdout_released_at IS NOT NULL
              AND q.recipient_value_holdout_released_at <= pg_catalog.now()
            )
          )
        )
      )
  )
  SELECT
    e.id,
    e.campaign_key,
    e.user_id,
    e.recipient_email,
    e.scheduled_for,
    e.status,
    e.reason,
    e.template_data,
    e.metadata,
    e.sent_at,
    e.created_at,
    e.subscription_id,
    e.processing_claim_id,
    e.processing_claimed_at,
    e.recipient_value_score,
    e.recipient_value_band,
    e.recipient_value_decision,
    e.recipient_value_policy_version,
    e.recipient_value_classified_at,
    e.recipient_value_holdout_released_at,
    e.lifecycle_campaign_name,
    e.lifecycle_campaign_category,
    e.lifecycle_campaign_template_name,
    e.lifecycle_campaign_email_type,
    e.lifecycle_campaign_preference_key,
    e.lifecycle_campaign_enabled,
    e.lifecycle_campaign_cooldown_days,
    e.lifecycle_campaign_priority,
    e.lifecycle_campaign_sort_priority
  FROM eligible AS e
  ORDER BY
    e.campaign_position ASC,
    CASE e.lifecycle_campaign_priority
      WHEN 'transactional' THEN 0
      WHEN 'revenue_critical' THEN 1
      WHEN 'lifecycle' THEN 2
      WHEN 'education' THEN 3
      ELSE 4
    END,
    e.scheduled_for ASC,
    e.id ASC
  LIMIT LEAST(GREATEST(p_limit, 1), 250);
$$;

REVOKE ALL ON FUNCTION public.get_due_email_lifecycle_queue(INTEGER, TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_due_email_lifecycle_queue(INTEGER, TIMESTAMPTZ)
  TO service_role;

CREATE OR REPLACE FUNCTION public.get_email_lifecycle_queue_health(
  p_due_before TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (
  pending_count BIGINT,
  overdue_count BIGINT,
  eligible_count BIGINT,
  held_count BIGINT,
  unclassified_count BIGINT,
  oldest_pending_scheduled_for TIMESTAMPTZ
)
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  SELECT
    pg_catalog.count(*) FILTER (WHERE q.status = 'pending') AS pending_count,
    pg_catalog.count(*) FILTER (
      WHERE q.status = 'pending' AND q.scheduled_for <= p_due_before
    ) AS overdue_count,
    pg_catalog.count(*) FILTER (
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
            AND q.recipient_value_policy_version = 'v1'
            AND (
              q.recipient_value_decision IN ('protected', 'keep_high', 'keep_medium')
              OR (
                q.recipient_value_decision = 'hold_experiment'
                AND q.recipient_value_holdout_released_at IS NOT NULL
                AND q.recipient_value_holdout_released_at <= pg_catalog.now()
              )
            )
          )
        )
    ) AS eligible_count,
    pg_catalog.count(*) FILTER (
      WHERE q.status = 'pending' AND q.recipient_value_decision = 'hold_experiment'
    ) AS held_count,
    pg_catalog.count(*) FILTER (
      WHERE q.status = 'pending'
        AND c.email_type = 'marketing'
        AND (
          q.recipient_value_decision IS NULL
          OR q.recipient_value_policy_version IS NULL
        )
    ) AS unclassified_count,
    pg_catalog.min(q.scheduled_for) FILTER (WHERE q.status = 'pending')
      AS oldest_pending_scheduled_for
  FROM public.email_lifecycle_queue AS q
  JOIN public.email_lifecycle_campaigns AS c ON c.key = q.campaign_key;
$$;

REVOKE ALL ON FUNCTION public.get_email_lifecycle_queue_health(TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_email_lifecycle_queue_health(TIMESTAMPTZ)
  TO service_role;

-- Add the PRD counter-metrics to the pre-send health gate. Unsubscribes are
-- global because preference events are intentionally not tied to one campaign.
DROP FUNCTION IF EXISTS public.get_email_lifecycle_health(TIMESTAMPTZ);
CREATE FUNCTION public.get_email_lifecycle_health(
  p_since TIMESTAMPTZ DEFAULT (pg_catalog.now() - INTERVAL '7 days')
)
RETURNS TABLE (
  campaign_priority TEXT,
  sent_count BIGINT,
  suppression_count BIGINT,
  fallback_count BIGINT,
  provider_failure_count BIGINT,
  hard_bounce_count BIGINT,
  complaint_count BIGINT,
  unsubscribe_count BIGINT,
  provider_block_count BIGINT,
  conversion_count BIGINT,
  fallback_rate NUMERIC,
  provider_failure_rate NUMERIC,
  hard_bounce_rate NUMERIC,
  complaint_rate NUMERIC,
  unsubscribe_rate NUMERIC,
  stop_recommended BOOLEAN
)
LANGUAGE SQL
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH global_metrics AS (
    SELECT
      pg_catalog.count(*) FILTER (
        WHERE e.event_type = 'sent' AND c.email_type = 'marketing'
      ) AS sent_count,
      pg_catalog.count(*) FILTER (WHERE e.event_type = 'unsubscribed') AS unsubscribe_count,
      pg_catalog.count(*) FILTER (
        WHERE e.event_type = 'failed'
          AND e.metadata ->> 'classification' = 'provider_blocked'
      ) AS provider_block_count
    FROM public.email_lifecycle_events AS e
    LEFT JOIN public.email_lifecycle_campaigns AS c ON c.key = e.campaign_key
    WHERE e.occurred_at >= p_since
  ),
  metrics AS (
    SELECT
      c.priority AS campaign_priority,
      pg_catalog.count(*) FILTER (WHERE e.event_type = 'sent') AS sent_count,
      pg_catalog.count(*) FILTER (
        WHERE e.event_type IN ('suppressed_frequency_cap', 'suppressed_preference', 'skipped')
      ) AS suppression_count,
      pg_catalog.count(*) FILTER (
        WHERE e.event_type = 'sent'
          AND (
            pg_catalog.jsonb_array_length(
              COALESCE(e.metadata -> 'attemptedProviders', '[]'::jsonb)
            ) > 1
            OR pg_catalog.jsonb_array_length(
              COALESCE(e.metadata -> 'unavailableProviders', '[]'::jsonb)
            ) > 0
          )
      ) AS fallback_count,
      pg_catalog.count(*) FILTER (WHERE e.event_type = 'failed') AS provider_failure_count,
      pg_catalog.count(*) FILTER (
        WHERE e.event_type = 'failed'
          AND e.metadata ->> 'error' = 'hard_bounce'
      ) AS hard_bounce_count,
      pg_catalog.count(*) FILTER (
        WHERE e.event_type = 'failed'
          AND e.metadata ->> 'error' = 'complaint'
      ) AS complaint_count,
      pg_catalog.count(*) FILTER (WHERE e.event_type = 'purchased_after_email')
        AS conversion_count
    FROM public.email_lifecycle_campaigns AS c
    LEFT JOIN public.email_lifecycle_events AS e
      ON e.campaign_key = c.key
     AND e.occurred_at >= p_since
    GROUP BY c.priority
  )
  SELECT
    m.campaign_priority,
    m.sent_count,
    m.suppression_count,
    m.fallback_count,
    m.provider_failure_count,
    m.hard_bounce_count,
    m.complaint_count,
    g.unsubscribe_count,
    g.provider_block_count,
    m.conversion_count,
    pg_catalog.round(m.fallback_count::NUMERIC / NULLIF(m.sent_count, 0), 4),
    pg_catalog.round(
      m.provider_failure_count::NUMERIC /
        NULLIF(m.sent_count + m.provider_failure_count, 0),
      4
    ),
    pg_catalog.round(m.hard_bounce_count::NUMERIC / NULLIF(m.sent_count, 0), 4),
    pg_catalog.round(m.complaint_count::NUMERIC / NULLIF(m.sent_count, 0), 4),
    pg_catalog.round(g.unsubscribe_count::NUMERIC / NULLIF(g.sent_count, 0), 4),
    (
      g.provider_block_count > 0
      OR m.hard_bounce_count::NUMERIC / NULLIF(m.sent_count, 0) > 0.02
      OR g.unsubscribe_count::NUMERIC / NULLIF(g.sent_count, 0) > 0.03
      OR (
        m.sent_count + m.provider_failure_count >= 500
        AND (
          m.complaint_count::NUMERIC / NULLIF(m.sent_count, 0) > 0.001
          OR m.provider_failure_count::NUMERIC /
            NULLIF(m.sent_count + m.provider_failure_count, 0) > 0.05
        )
      )
    )
  FROM metrics AS m
  CROSS JOIN global_metrics AS g
  ORDER BY CASE m.campaign_priority
    WHEN 'transactional' THEN 0
    WHEN 'revenue_critical' THEN 1
    WHEN 'lifecycle' THEN 2
    WHEN 'education' THEN 3
    ELSE 4
  END;
$$;

REVOKE ALL ON FUNCTION public.get_email_lifecycle_health(TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_email_lifecycle_health(TIMESTAMPTZ)
  TO service_role;

CREATE INDEX IF NOT EXISTS idx_email_lifecycle_queue_holdout_release
  ON public.email_lifecycle_queue(recipient_value_holdout_released_at, scheduled_for)
  WHERE status = 'pending' AND recipient_value_decision = 'hold_experiment';

-- Rollback: restore the prior definitions of apply_email_recipient_value_run and
-- get_due_email_lifecycle_queue before dropping the trigger, helper functions,
-- index, and recipient_value_holdout_released_at column.
