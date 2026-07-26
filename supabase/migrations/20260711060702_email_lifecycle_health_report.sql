-- Seven-day lifecycle delivery and conversion health by campaign priority.
-- This is intentionally a query surface, not an automatic bulk-release switch.

CREATE OR REPLACE FUNCTION public.get_email_lifecycle_health(
  p_since TIMESTAMPTZ DEFAULT (now() - interval '7 days')
)
RETURNS TABLE (
  campaign_priority TEXT,
  sent_count BIGINT,
  suppression_count BIGINT,
  fallback_count BIGINT,
  provider_failure_count BIGINT,
  hard_bounce_count BIGINT,
  complaint_count BIGINT,
  conversion_count BIGINT,
  fallback_rate NUMERIC,
  provider_failure_rate NUMERIC,
  hard_bounce_rate NUMERIC,
  complaint_rate NUMERIC,
  stop_recommended BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = ''
AS $$
  WITH metrics AS (
    SELECT
      c.priority AS campaign_priority,
      count(*) FILTER (WHERE e.event_type = 'sent') AS sent_count,
      count(*) FILTER (
        WHERE e.event_type IN ('suppressed_frequency_cap', 'suppressed_preference', 'skipped')
      ) AS suppression_count,
      count(*) FILTER (
        WHERE e.event_type = 'sent'
          AND (
            jsonb_array_length(COALESCE(e.metadata -> 'attemptedProviders', '[]'::jsonb)) > 1
            OR jsonb_array_length(COALESCE(e.metadata -> 'unavailableProviders', '[]'::jsonb)) > 0
          )
      ) AS fallback_count,
      count(*) FILTER (WHERE e.event_type = 'failed') AS provider_failure_count,
      count(*) FILTER (
        WHERE e.event_type = 'failed'
          AND lower(COALESCE(e.metadata ->> 'error', '')) ~ 'hard.?bounce|permanent.?bounce'
      ) AS hard_bounce_count,
      count(*) FILTER (
        WHERE e.event_type = 'failed'
          AND lower(COALESCE(e.metadata ->> 'error', '')) ~ 'complaint|complained'
      ) AS complaint_count,
      count(*) FILTER (WHERE e.event_type = 'purchased_after_email') AS conversion_count
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
    m.conversion_count,
    round(m.fallback_count::numeric / NULLIF(m.sent_count, 0), 4),
    round(
      m.provider_failure_count::numeric /
        NULLIF(m.sent_count + m.provider_failure_count, 0),
      4
    ),
    round(m.hard_bounce_count::numeric / NULLIF(m.sent_count, 0), 4),
    round(m.complaint_count::numeric / NULLIF(m.sent_count, 0), 4),
    (m.sent_count + m.provider_failure_count >= 500) AND (
      m.hard_bounce_count::numeric / NULLIF(m.sent_count, 0) > 0.02
      OR m.complaint_count::numeric / NULLIF(m.sent_count, 0) > 0.001
      OR m.provider_failure_count::numeric /
        NULLIF(m.sent_count + m.provider_failure_count, 0) > 0.05
    )
  FROM metrics AS m
  ORDER BY CASE m.campaign_priority
    WHEN 'transactional' THEN 0
    WHEN 'revenue_critical' THEN 1
    WHEN 'lifecycle' THEN 2
    WHEN 'education' THEN 3
    ELSE 4
  END;
$$;

REVOKE ALL ON FUNCTION public.get_email_lifecycle_health(TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_email_lifecycle_health(TIMESTAMPTZ) FROM anon;
REVOKE ALL ON FUNCTION public.get_email_lifecycle_health(TIMESTAMPTZ) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_email_lifecycle_health(TIMESTAMPTZ) TO service_role;
