-- Count-only recipient-value performance reporting.
-- Groups with fewer than twenty sends never leave this function. Groups with
-- fewer than one hundred sends are visible only as insufficient evidence.

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
  WITH normalized_queue AS (
    SELECT
      q.id,
      q.user_id,
      q.campaign_key,
      q.recipient_value_policy_version,
      q.recipient_value_band,
      q.recipient_value_decision,
      CASE
        WHEN p.signup_country IS NOT NULL
          AND pg_catalog.upper(pg_catalog.btrim(p.signup_country)) ~ '^[A-Z]{2}$'
          AND pg_catalog.upper(pg_catalog.btrim(p.signup_country)) NOT IN ('XX', 'ZZ')
          THEN pg_catalog.upper(pg_catalog.btrim(p.signup_country))
        ELSE 'UNKNOWN'
      END AS country
    FROM public.email_lifecycle_queue AS q
    LEFT JOIN public.profiles AS p ON p.id = q.user_id
    WHERE q.created_at >= p_since
       OR q.recipient_value_classified_at >= p_since
       OR q.sent_at >= p_since
  ),
  with_region AS (
    SELECT
      nq.*,
      CASE
        WHEN nq.country IN ('IN', 'PK', 'BD', 'LK', 'NP', 'AF', 'BT') THEN 'south_asia'
        WHEN nq.country IN ('PH', 'ID', 'VN', 'TH', 'MM', 'KH', 'LA', 'MY', 'TL') THEN 'southeast_asia'
        WHEN nq.country IN (
          'BR', 'MX', 'CO', 'AR', 'PE', 'CL', 'EC', 'VE', 'BO', 'PY', 'UY', 'GY', 'SR',
          'GT', 'HN', 'SV', 'NI', 'CR', 'PA', 'BZ', 'DO', 'HT', 'JM', 'CU', 'TT'
        ) THEN 'latam'
        WHEN nq.country IN (
          'UA', 'RO', 'BG', 'RS', 'HR', 'BA', 'MK', 'AL', 'MD', 'GE', 'ME', 'XK', 'RU',
          'BY', 'AM', 'AZ', 'KZ', 'UZ', 'KG', 'TJ', 'TM', 'TR', 'CN', 'IR', 'IQ', 'JO', 'LB'
        ) THEN 'eastern_europe'
        WHEN nq.country IN (
          'EG', 'MA', 'TN', 'DZ', 'LY', 'SD', 'NG', 'GH', 'SN', 'CI', 'ML', 'BF', 'NE',
          'TD', 'GN', 'SL', 'LR', 'TG', 'BJ', 'MR', 'GM', 'GW', 'CV', 'ST', 'CM', 'CD',
          'CF', 'CG', 'GA', 'GQ', 'AO', 'ET', 'KE', 'TZ', 'UG', 'RW', 'BI', 'MZ', 'MG',
          'DJ', 'ER', 'SO', 'SS', 'KM', 'ZA', 'ZM', 'ZW', 'MW', 'BW', 'NA', 'LS', 'SZ'
        ) THEN 'africa'
        ELSE 'standard'
      END AS pricing_region
    FROM normalized_queue AS nq
  ),
  sent_events AS (
    SELECT e.queue_id, pg_catalog.min(e.occurred_at) AS sent_at
    FROM public.email_lifecycle_events AS e
    WHERE e.event_type = 'sent'
      AND e.occurred_at >= p_since
    GROUP BY e.queue_id
  ),
  click_events AS (
    SELECT DISTINCT e.queue_id
    FROM public.email_lifecycle_events AS e
    WHERE e.event_type = 'clicked'
      AND e.occurred_at >= p_since
  ),
  returned_events AS (
    SELECT DISTINCT e.queue_id
    FROM public.email_lifecycle_events AS e
    WHERE e.event_type = 'returned'
      AND e.occurred_at >= p_since
  ),
  purchase_events AS (
    SELECT DISTINCT e.queue_id
    FROM public.email_lifecycle_events AS e
    JOIN sent_events AS s ON s.queue_id = e.queue_id
    WHERE e.event_type = 'purchased_after_email'
      AND e.occurred_at >= s.sent_at
      AND e.occurred_at <= s.sent_at + INTERVAL '7 days'
  ),
  failure_events AS (
    SELECT
      e.queue_id,
      count(*) FILTER (
        WHERE lower(coalesce(e.metadata ->> 'error', '')) ~ 'hard.?bounce|permanent.?bounce'
      ) AS hard_bounce_count,
      count(*) FILTER (
        WHERE lower(coalesce(e.metadata ->> 'error', '')) ~ 'complaint|complained'
      ) AS complaint_count
    FROM public.email_lifecycle_events AS e
    WHERE e.event_type = 'failed'
      AND e.occurred_at >= p_since
    GROUP BY e.queue_id
  ),
  email_log_failure_events AS (
    SELECT
      nq.id AS queue_id,
      count(*) FILTER (
        WHERE lower(coalesce(l.provider_response::TEXT, '')) ~ 'hard.?bounce|permanent.?bounce'
      ) AS hard_bounce_count,
      count(*) FILTER (
        WHERE lower(coalesce(l.provider_response::TEXT, '')) ~ 'complaint|complained'
      ) AS complaint_count
    FROM normalized_queue AS nq
    JOIN public.email_logs AS l
      ON l.user_id = nq.user_id
     AND l.status = 'failed'
     AND l.sent_at >= p_since
    GROUP BY nq.id
  ),
  delivery AS (
    SELECT
      wr.*,
      se.sent_at,
      (ce.queue_id IS NOT NULL) AS clicked,
      (re.queue_id IS NOT NULL) AS returned,
      (pe.queue_id IS NOT NULL) AS purchased_after_email,
      CASE
        WHEN fe.queue_id IS NOT NULL THEN fe.hard_bounce_count
        ELSE coalesce(le.hard_bounce_count, 0)
      END::BIGINT AS hard_bounce_count,
      CASE
        WHEN fe.queue_id IS NOT NULL THEN fe.complaint_count
        ELSE coalesce(le.complaint_count, 0)
      END::BIGINT AS complaint_count
    FROM with_region AS wr
    LEFT JOIN sent_events AS se ON se.queue_id = wr.id
    LEFT JOIN click_events AS ce ON ce.queue_id = wr.id
    LEFT JOIN returned_events AS re ON re.queue_id = wr.id
    LEFT JOIN purchase_events AS pe ON pe.queue_id = wr.id
    LEFT JOIN failure_events AS fe ON fe.queue_id = wr.id
    LEFT JOIN email_log_failure_events AS le ON le.queue_id = wr.id
  ),
  grouped AS (
    SELECT
      d.country,
      d.pricing_region,
      d.campaign_key,
      coalesce(d.recipient_value_policy_version, 'unclassified') AS policy_version,
      coalesce(d.recipient_value_band, 'unclassified') AS value_band,
      count(*) FILTER (WHERE d.recipient_value_policy_version IS NOT NULL) AS classified_count,
      count(*) FILTER (WHERE d.recipient_value_decision = 'hold_experiment') AS held_count,
      count(*) FILTER (WHERE d.recipient_value_decision = 'cancel') AS cancelled_count,
      count(*) FILTER (WHERE d.sent_at IS NOT NULL) AS sent_count,
      count(*) FILTER (WHERE d.clicked) AS clicked_count,
      count(*) FILTER (WHERE d.returned) AS returned_count,
      count(*) FILTER (WHERE d.purchased_after_email) AS purchased_after_email_count,
      sum(d.hard_bounce_count)::BIGINT AS hard_bounce_count,
      sum(d.complaint_count)::BIGINT AS complaint_count
    FROM delivery AS d
    GROUP BY d.country, d.pricing_region, d.campaign_key,
      coalesce(d.recipient_value_policy_version, 'unclassified'),
      coalesce(d.recipient_value_band, 'unclassified')
  ),
  qualified AS (
    SELECT
      g.*,
      CASE
        WHEN g.sent_count = 0 THEN NULL
        ELSE round(g.purchased_after_email_count::NUMERIC / g.sent_count, 4)
      END AS conversion_rate,
      CASE
        WHEN g.sent_count = 0 THEN NULL
        ELSE round(
          (
            (
              g.purchased_after_email_count::NUMERIC / g.sent_count
              + (1.96 * 1.96) / (2 * g.sent_count)
              - 1.96 * sqrt(
                (
                  (
                    g.purchased_after_email_count::NUMERIC / g.sent_count
                    * (1 - g.purchased_after_email_count::NUMERIC / g.sent_count)
                  )
                  + (1.96 * 1.96) / (4 * g.sent_count)
                ) / g.sent_count
              )
            ) / (1 + (1.96 * 1.96) / g.sent_count)
          ),
          4
        )
      END AS conversion_ci_lower,
      CASE
        WHEN g.sent_count = 0 THEN NULL
        ELSE round(
          (
            (
              g.purchased_after_email_count::NUMERIC / g.sent_count
              + (1.96 * 1.96) / (2 * g.sent_count)
              + 1.96 * sqrt(
                (
                  (
                    g.purchased_after_email_count::NUMERIC / g.sent_count
                    * (1 - g.purchased_after_email_count::NUMERIC / g.sent_count)
                  )
                  + (1.96 * 1.96) / (4 * g.sent_count)
                ) / g.sent_count
              )
            ) / (1 + (1.96 * 1.96) / g.sent_count)
          ),
          4
        )
      END AS conversion_ci_upper
    FROM grouped AS g
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
    CASE WHEN q.sent_count = 0 THEN NULL ELSE round(q.hard_bounce_count::NUMERIC / q.sent_count, 4) END,
    CASE WHEN q.sent_count = 0 THEN NULL ELSE round(q.complaint_count::NUMERIC / q.sent_count, 4) END,
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
  WHERE q.sent_count >= 20
  ORDER BY q.country, q.pricing_region, q.campaign_key, q.policy_version, q.value_band;
$$;

REVOKE ALL ON FUNCTION public.get_email_recipient_value_performance(TIMESTAMPTZ)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_email_recipient_value_performance(TIMESTAMPTZ)
  TO service_role;
