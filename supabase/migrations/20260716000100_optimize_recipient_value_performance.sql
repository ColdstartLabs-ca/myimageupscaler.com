-- Keep recipient-value reporting bounded to rows that were actually sent in
-- the requested window. The previous report expanded every recently-created
-- queue row and joined failed provider logs by user, which both timed out and
-- could attribute one provider failure to several unrelated queue rows.

CREATE INDEX IF NOT EXISTS idx_email_lifecycle_events_type_time_queue
  ON public.email_lifecycle_events(event_type, occurred_at DESC, queue_id);

CREATE INDEX IF NOT EXISTS idx_email_logs_failed_message_time
  ON public.email_logs(status, ((provider_response ->> 'messageId')), sent_at DESC)
  WHERE status = 'failed';

CREATE INDEX IF NOT EXISTS idx_email_lifecycle_queue_sent_report
  ON public.email_lifecycle_queue(sent_at DESC, campaign_key, recipient_value_band)
  WHERE sent_at IS NOT NULL;

CREATE OR REPLACE FUNCTION public.get_email_recipient_value_performance(
  p_since TIMESTAMPTZ DEFAULT (pg_catalog.now() - INTERVAL '30 days')
)
RETURNS TABLE (
  country TEXT,
  pricing_region TEXT,
  campaign_key TEXT,
  policy_version TEXT,
  value_band TEXT,
  classified_count BIGINT,
  held_count BIGINT,
  cancelled_count BIGINT,
  sent_count BIGINT,
  clicked_count BIGINT,
  returned_count BIGINT,
  purchased_after_email_count BIGINT,
  send_to_purchase_conversion_rate NUMERIC,
  conversion_ci_lower NUMERIC,
  conversion_ci_upper NUMERIC,
  hard_bounce_count BIGINT,
  complaint_count BIGINT,
  hard_bounce_rate NUMERIC,
  complaint_rate NUMERIC,
  revenue_multiplier NUMERIC,
  evidence_status TEXT
)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH sent_queue AS (
    SELECT
      q.id,
      q.campaign_key,
      q.recipient_value_policy_version,
      q.recipient_value_band,
      q.recipient_value_decision,
      q.sent_at,
      CASE
        WHEN p.signup_country IS NOT NULL
          AND pg_catalog.upper(pg_catalog.btrim(p.signup_country)) ~ '^[A-Z]{2}$'
          AND pg_catalog.upper(pg_catalog.btrim(p.signup_country)) NOT IN ('XX', 'ZZ')
          THEN pg_catalog.upper(pg_catalog.btrim(p.signup_country))
        ELSE 'UNKNOWN'
      END AS country
    FROM public.email_lifecycle_queue AS q
    LEFT JOIN public.profiles AS p ON p.id = q.user_id
    WHERE q.sent_at >= p_since
  ),
  with_region AS (
    SELECT
      sq.*,
      CASE
        WHEN sq.country IN ('IN', 'PK', 'BD', 'LK', 'NP', 'AF', 'BT') THEN 'south_asia'
        WHEN sq.country IN ('PH', 'ID', 'VN', 'TH', 'MM', 'KH', 'LA', 'MY', 'TL') THEN 'southeast_asia'
        WHEN sq.country IN (
          'BR', 'MX', 'CO', 'AR', 'PE', 'CL', 'EC', 'VE', 'BO', 'PY', 'UY', 'GY', 'SR',
          'GT', 'HN', 'SV', 'NI', 'CR', 'PA', 'BZ', 'DO', 'HT', 'JM', 'CU', 'TT'
        ) THEN 'latam'
        WHEN sq.country IN (
          'UA', 'RO', 'BG', 'RS', 'HR', 'BA', 'MK', 'AL', 'MD', 'GE', 'ME', 'XK', 'RU',
          'BY', 'AM', 'AZ', 'KZ', 'UZ', 'KG', 'TJ', 'TM', 'TR', 'CN', 'IR', 'IQ', 'JO', 'LB'
        ) THEN 'eastern_europe'
        WHEN sq.country IN (
          'EG', 'MA', 'TN', 'DZ', 'LY', 'SD', 'NG', 'GH', 'SN', 'CI', 'ML', 'BF', 'NE',
          'TD', 'GN', 'SL', 'LR', 'TG', 'BJ', 'MR', 'GM', 'GW', 'CV', 'ST', 'CM', 'CD',
          'CF', 'CG', 'GA', 'GQ', 'AO', 'ET', 'KE', 'TZ', 'UG', 'RW', 'BI', 'MZ', 'MG',
          'DJ', 'ER', 'SO', 'SS', 'KM', 'ZA', 'ZM', 'ZW', 'MW', 'BW', 'NA', 'LS', 'SZ'
        ) THEN 'africa'
        ELSE 'standard'
      END AS pricing_region
    FROM sent_queue AS sq
  ),
  sent_events AS (
    SELECT DISTINCT ON (e.queue_id)
      e.queue_id,
      e.metadata ->> 'messageId' AS message_id
    FROM public.email_lifecycle_events AS e
    JOIN sent_queue AS sq ON sq.id = e.queue_id
    WHERE e.event_type = 'sent'
      AND e.occurred_at >= p_since
    ORDER BY e.queue_id, e.occurred_at ASC
  ),
  event_rollup AS (
    SELECT
      sq.id AS queue_id,
      pg_catalog.bool_or(e.event_type = 'clicked') AS clicked,
      pg_catalog.bool_or(e.event_type = 'returned') AS returned,
      pg_catalog.bool_or(
        e.event_type = 'purchased_after_email'
        AND e.occurred_at <= sq.sent_at + INTERVAL '7 days'
      ) AS purchased_after_email,
      count(*) FILTER (
        WHERE e.event_type = 'failed'
          AND lower(coalesce(e.metadata ->> 'error', '')) ~ 'hard.?bounce|permanent.?bounce'
      ) AS hard_bounce_count,
      count(*) FILTER (
        WHERE e.event_type = 'failed'
          AND lower(coalesce(e.metadata ->> 'error', '')) ~ 'complaint|complained'
      ) AS complaint_count
    FROM sent_queue AS sq
    LEFT JOIN public.email_lifecycle_events AS e
      ON e.queue_id = sq.id
     AND e.occurred_at >= sq.sent_at
     AND e.event_type IN ('clicked', 'returned', 'purchased_after_email', 'failed')
    GROUP BY sq.id
  ),
  email_log_failure_rollup AS (
    SELECT
      se.queue_id,
      count(*) FILTER (
        WHERE lower(coalesce(l.provider_response::TEXT, '')) ~ 'hard.?bounce|permanent.?bounce'
      ) AS hard_bounce_count,
      count(*) FILTER (
        WHERE lower(coalesce(l.provider_response::TEXT, '')) ~ 'complaint|complained'
      ) AS complaint_count
    FROM sent_events AS se
    JOIN public.email_logs AS l
      ON l.status = 'failed'
     AND l.sent_at >= p_since
     AND l.provider_response ->> 'messageId' = se.message_id
    WHERE se.message_id IS NOT NULL
    GROUP BY se.queue_id
  ),
  grouped AS (
    SELECT
      wr.country,
      wr.pricing_region,
      wr.campaign_key,
      coalesce(wr.recipient_value_policy_version, 'unclassified') AS policy_version,
      coalesce(wr.recipient_value_band, 'unclassified') AS value_band,
      count(*) FILTER (WHERE wr.recipient_value_policy_version IS NOT NULL) AS classified_count,
      count(*) FILTER (WHERE wr.recipient_value_decision = 'hold_experiment') AS held_count,
      count(*) FILTER (WHERE wr.recipient_value_decision = 'cancel') AS cancelled_count,
      count(*) AS sent_count,
      count(*) FILTER (WHERE er.clicked) AS clicked_count,
      count(*) FILTER (WHERE er.returned) AS returned_count,
      count(*) FILTER (WHERE er.purchased_after_email) AS purchased_after_email_count,
      sum(greatest(
        coalesce(er.hard_bounce_count, 0),
        coalesce(lr.hard_bounce_count, 0)
      ))::BIGINT AS hard_bounce_count,
      sum(greatest(
        coalesce(er.complaint_count, 0),
        coalesce(lr.complaint_count, 0)
      ))::BIGINT AS complaint_count
    FROM with_region AS wr
    LEFT JOIN event_rollup AS er ON er.queue_id = wr.id
    LEFT JOIN email_log_failure_rollup AS lr ON lr.queue_id = wr.id
    GROUP BY
      wr.country,
      wr.pricing_region,
      wr.campaign_key,
      coalesce(wr.recipient_value_policy_version, 'unclassified'),
      coalesce(wr.recipient_value_band, 'unclassified')
  ),
  qualified AS (
    SELECT
      g.*,
      round(g.purchased_after_email_count::NUMERIC / g.sent_count, 4) AS conversion_rate,
      round((
        g.purchased_after_email_count::NUMERIC / g.sent_count
        + (1.96 * 1.96) / (2 * g.sent_count)
        - 1.96 * sqrt((
          g.purchased_after_email_count::NUMERIC / g.sent_count
          * (1 - g.purchased_after_email_count::NUMERIC / g.sent_count)
          + (1.96 * 1.96) / (4 * g.sent_count)
        ) / g.sent_count)
      ) / (1 + (1.96 * 1.96) / g.sent_count), 4) AS conversion_ci_lower,
      round((
        g.purchased_after_email_count::NUMERIC / g.sent_count
        + (1.96 * 1.96) / (2 * g.sent_count)
        + 1.96 * sqrt((
          g.purchased_after_email_count::NUMERIC / g.sent_count
          * (1 - g.purchased_after_email_count::NUMERIC / g.sent_count)
          + (1.96 * 1.96) / (4 * g.sent_count)
        ) / g.sent_count)
      ) / (1 + (1.96 * 1.96) / g.sent_count), 4) AS conversion_ci_upper
    FROM grouped AS g
    WHERE g.sent_count >= 20
  )
  SELECT
    q.country,
    q.pricing_region,
    q.campaign_key,
    q.policy_version,
    q.value_band,
    q.classified_count,
    q.held_count,
    q.cancelled_count,
    q.sent_count,
    q.clicked_count,
    q.returned_count,
    q.purchased_after_email_count,
    q.conversion_rate,
    q.conversion_ci_lower,
    q.conversion_ci_upper,
    q.hard_bounce_count,
    q.complaint_count,
    round(q.hard_bounce_count::NUMERIC / q.sent_count, 4),
    round(q.complaint_count::NUMERIC / q.sent_count, 4),
    CASE q.pricing_region
      WHEN 'south_asia' THEN 0.35
      WHEN 'southeast_asia' THEN 0.40
      WHEN 'latam' THEN 0.50
      WHEN 'eastern_europe' THEN 0.60
      WHEN 'africa' THEN 0.35
      ELSE 1.00
    END::NUMERIC,
    CASE WHEN q.sent_count < 100 THEN 'insufficient_evidence' ELSE 'sufficient_evidence' END
  FROM qualified AS q
  ORDER BY q.country, q.pricing_region, q.campaign_key, q.policy_version, q.value_band;
$$;

REVOKE ALL ON FUNCTION public.get_email_recipient_value_performance(TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_email_recipient_value_performance(TIMESTAMPTZ)
  TO service_role;

-- Exact rollback (run with psql from this migrations directory):
--   DROP INDEX IF EXISTS public.idx_email_lifecycle_events_type_time_queue;
--   DROP INDEX IF EXISTS public.idx_email_logs_failed_message_time;
--   DROP INDEX IF EXISTS public.idx_email_lifecycle_queue_sent_report;
--   \ir 20260712000400_email_recipient_value_performance.sql
-- The referenced migration restores the prior function definition, privacy
-- behavior, revocations, and service_role grant verbatim.
