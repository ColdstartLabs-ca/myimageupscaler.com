-- Read-only rollout gate for purchase experiment reward attribution.
-- The caller supplies paid Stripe checkout metadata so missing reward rows remain
-- observable; this function validates assignments and never writes or backfills.

CREATE OR REPLACE FUNCTION public.get_experiment_reward_health(
  p_paid_checkouts JSONB,
  p_since TIMESTAMPTZ DEFAULT (now() - interval '7 days')
)
RETURNS TABLE (
  report_day DATE,
  paid_checkouts_with_known_assignment BIGINT,
  attributed_paid_checkouts BIGINT,
  attribution_rate NUMERIC,
  duplicate_reward_count BIGINT,
  healthy BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH supplied AS (
    SELECT DISTINCT ON (checkout.purchase_id, checkout.experiment_key)
      checkout.purchase_id,
      checkout.experiment_key,
      checkout.context_key,
      checkout.arm_id,
      checkout.assignment_key,
      checkout.paid_at
    FROM jsonb_to_recordset(COALESCE(p_paid_checkouts, '[]'::jsonb)) AS checkout(
      purchase_id TEXT,
      experiment_key TEXT,
      context_key TEXT,
      arm_id BIGINT,
      assignment_key TEXT,
      paid_at TIMESTAMPTZ
    )
    WHERE checkout.paid_at >= p_since
      AND checkout.paid_at < date_trunc('day', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
      AND NULLIF(btrim(checkout.purchase_id), '') IS NOT NULL
      AND NULLIF(btrim(checkout.experiment_key), '') IS NOT NULL
    ORDER BY checkout.purchase_id, checkout.experiment_key, checkout.paid_at
  ),
  known AS (
    SELECT supplied.*, assignment.arm_id AS assigned_arm_id
    FROM supplied
    JOIN public.experiment_assignments assignment
     ON assignment.experiment_key = supplied.experiment_key
     AND assignment.context_key = supplied.context_key
     AND assignment.assignment_key = supplied.assignment_key
     AND assignment.arm_id = supplied.arm_id
  ),
  reward_counts AS (
    SELECT
      known.purchase_id,
      known.experiment_key,
      count(reward.id)::BIGINT AS reward_count,
      count(reward.id) FILTER (
        WHERE reward.assignment_key = known.assignment_key
          AND reward.arm_id = known.assigned_arm_id
      )::BIGINT AS valid_reward_count
    FROM known
    LEFT JOIN public.experiment_rewards reward
      ON reward.purchase_id = known.purchase_id
     AND reward.experiment_key = known.experiment_key
     AND reward.reward_type = 'purchase_confirmed'
    GROUP BY
      known.purchase_id,
      known.experiment_key,
      known.assignment_key,
      known.assigned_arm_id
  ),
  daily_counts AS (
    SELECT
      (known.paid_at AT TIME ZONE 'UTC')::DATE AS report_day,
      count(*)::BIGINT AS paid_count,
      count(*) FILTER (
        WHERE reward_counts.reward_count = 1
          AND reward_counts.valid_reward_count = 1
      )::BIGINT AS attributed_count,
      COALESCE(sum(GREATEST(reward_counts.reward_count - 1, 0)), 0)::BIGINT AS duplicate_count
    FROM known
    JOIN reward_counts USING (purchase_id, experiment_key)
    GROUP BY (known.paid_at AT TIME ZONE 'UTC')::DATE
  ),
  report_days AS (
    SELECT generate_series(
      (now() AT TIME ZONE 'UTC')::DATE - 7,
      (now() AT TIME ZONE 'UTC')::DATE - 1,
      interval '1 day'
    )::DATE AS report_day
  )
  SELECT
    report_days.report_day,
    COALESCE(daily_counts.paid_count, 0),
    COALESCE(daily_counts.attributed_count, 0),
    round(
      daily_counts.attributed_count::NUMERIC / NULLIF(daily_counts.paid_count, 0),
      4
    ),
    COALESCE(daily_counts.duplicate_count, 0),
    COALESCE(daily_counts.paid_count, 0) > 0
      AND daily_counts.attributed_count::NUMERIC / daily_counts.paid_count >= 0.95
      AND COALESCE(daily_counts.duplicate_count, 0) = 0
  FROM report_days
  LEFT JOIN daily_counts USING (report_day)
  ORDER BY report_days.report_day;
$$;

REVOKE ALL ON FUNCTION public.get_experiment_reward_health(JSONB, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_experiment_reward_health(JSONB, TIMESTAMPTZ) FROM anon;
REVOKE ALL ON FUNCTION public.get_experiment_reward_health(JSONB, TIMESTAMPTZ) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_experiment_reward_health(JSONB, TIMESTAMPTZ) TO service_role;

COMMENT ON FUNCTION public.get_experiment_reward_health(JSONB, TIMESTAMPTZ) IS
  'Read-only daily comparison of caller-supplied paid Stripe checkouts with known assignments against purchase reward rows.';
