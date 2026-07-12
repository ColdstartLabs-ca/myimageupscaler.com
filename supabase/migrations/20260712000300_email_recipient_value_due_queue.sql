-- Value-aware due queue selection. Unclassified rows remain eligible as
-- keep_medium during rollout; held and pruned rows never enter normal cron.

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
  LEFT JOIN public.email_lifecycle_campaigns AS c ON c.key = q.campaign_key
  WHERE q.status = 'pending'
    AND q.scheduled_for <= p_due_before
    AND (
      q.processing_claim_id IS NULL
      OR q.processing_claimed_at < pg_catalog.now() - INTERVAL '10 minutes'
    )
    AND (
      COALESCE(q.recipient_value_decision, 'keep_medium') IN (
        'protected', 'keep_high', 'keep_medium'
      )
      OR (
        q.recipient_value_decision = 'cancel'
        AND EXISTS (
          SELECT 1
          FROM public.email_queue_pruning_runs AS r
          WHERE r.id = q.recipient_value_run_id
            AND r.mode = 'rolled_back'
        )
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
    CASE COALESCE(q.recipient_value_decision, 'keep_medium')
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
