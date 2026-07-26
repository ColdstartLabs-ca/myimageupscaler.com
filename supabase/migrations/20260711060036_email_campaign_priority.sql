-- Add typed campaign priority without losing the existing numeric queue ordering.
ALTER TABLE public.email_lifecycle_campaigns
  RENAME COLUMN priority TO sort_priority;

ALTER TABLE public.email_lifecycle_campaigns
  ADD COLUMN priority TEXT NOT NULL DEFAULT 'lifecycle';

ALTER TABLE public.email_lifecycle_campaigns
  ADD CONSTRAINT email_lifecycle_campaigns_priority_check
  CHECK (priority IN ('transactional', 'revenue_critical', 'lifecycle', 'education'));

UPDATE public.email_lifecycle_campaigns
SET priority = CASE
  WHEN email_type = 'transactional' THEN 'transactional'
  WHEN category = 'blog_education' THEN 'education'
  WHEN key IN (
    'low-credits',
    'zero-credits',
    'insufficient-credits-finish-image',
    'checkout-abandoned-24h',
    'upgrade-click-no-purchase-24h',
    'credit-wall-dismissed-48h',
    'high-usage-free-user',
    'winback-former-buyer-45d'
  ) THEN 'revenue_critical'
  ELSE 'lifecycle'
END;

CREATE INDEX IF NOT EXISTS idx_email_lifecycle_campaigns_priority
  ON public.email_lifecycle_campaigns(priority, sort_priority DESC);

CREATE OR REPLACE FUNCTION public.get_due_email_lifecycle_queue(
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
  ORDER BY
    CASE c.priority
      WHEN 'transactional' THEN 0
      WHEN 'revenue_critical' THEN 1
      WHEN 'lifecycle' THEN 2
      WHEN 'education' THEN 3
    END,
    c.sort_priority DESC,
    q.scheduled_for ASC,
    q.id ASC
  LIMIT LEAST(GREATEST(p_limit, 1), 250);
$$;

REVOKE ALL ON FUNCTION public.get_due_email_lifecycle_queue(INTEGER, TIMESTAMPTZ) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_due_email_lifecycle_queue(INTEGER, TIMESTAMPTZ) TO service_role;
