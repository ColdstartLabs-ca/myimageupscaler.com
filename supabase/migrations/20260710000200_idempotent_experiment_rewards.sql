-- Record purchase experiment rewards atomically and idempotently.
-- Historical rewards remain unchanged; purchase_id is required only for new
-- Stripe purchase rewards recorded through record_experiment_purchase_reward.

ALTER TABLE public.experiment_rewards
  ADD COLUMN IF NOT EXISTS purchase_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_experiment_rewards_purchase
  ON public.experiment_rewards (purchase_id, experiment_key)
  WHERE purchase_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.record_experiment_purchase_reward(
  p_experiment_key TEXT,
  p_context_key TEXT,
  p_arm_id BIGINT,
  p_assignment_key TEXT,
  p_purchase_id TEXT,
  p_reward_type TEXT,
  p_reward_value INTEGER,
  p_revenue_cents INTEGER,
  p_metadata JSONB DEFAULT '{}'::jsonb
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_assignment_arm_id BIGINT;
  v_inserted_id BIGINT;
BEGIN
  IF p_assignment_key IS NULL OR btrim(p_assignment_key) = '' THEN
    RETURN 'missing_assignment';
  END IF;

  IF p_purchase_id IS NULL OR btrim(p_purchase_id) = '' THEN
    RAISE EXCEPTION 'purchase_id is required';
  END IF;

  IF p_reward_value <= 0 OR p_revenue_cents < 0 THEN
    RAISE EXCEPTION 'reward values must be non-negative and reward_value must be positive';
  END IF;

  SELECT arm_id
  INTO v_assignment_arm_id
  FROM public.experiment_assignments
  WHERE experiment_key = p_experiment_key
    AND context_key = p_context_key
    AND assignment_key = p_assignment_key;

  IF v_assignment_arm_id IS NULL THEN
    RETURN 'missing_assignment';
  END IF;

  IF v_assignment_arm_id <> p_arm_id OR NOT EXISTS (
    SELECT 1
    FROM public.experiment_arms
    WHERE id = p_arm_id
      AND experiment_key = p_experiment_key
      AND context_key = p_context_key
  ) THEN
    RETURN 'invalid_arm';
  END IF;

  INSERT INTO public.experiment_rewards (
    experiment_key,
    context_key,
    arm_id,
    assignment_key,
    reward_type,
    reward_value,
    revenue_cents,
    source_event,
    purchase_id,
    metadata
  ) VALUES (
    p_experiment_key,
    p_context_key,
    p_arm_id,
    p_assignment_key,
    p_reward_type,
    p_reward_value,
    p_revenue_cents,
    p_purchase_id,
    p_purchase_id,
    p_metadata
  )
  ON CONFLICT (purchase_id, experiment_key) WHERE purchase_id IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_inserted_id;

  IF v_inserted_id IS NULL THEN
    RETURN 'duplicate';
  END IF;

  UPDATE public.experiment_arms
  SET rewards = rewards + p_reward_value,
      revenue_cents = revenue_cents + p_revenue_cents,
      updated_at = now()
  WHERE id = p_arm_id;

  RETURN 'recorded';
END;
$$;

REVOKE ALL ON FUNCTION public.record_experiment_purchase_reward(
  TEXT, TEXT, BIGINT, TEXT, TEXT, TEXT, INTEGER, INTEGER, JSONB
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_experiment_purchase_reward(
  TEXT, TEXT, BIGINT, TEXT, TEXT, TEXT, INTEGER, INTEGER, JSONB
) FROM anon;
REVOKE ALL ON FUNCTION public.record_experiment_purchase_reward(
  TEXT, TEXT, BIGINT, TEXT, TEXT, TEXT, INTEGER, INTEGER, JSONB
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_experiment_purchase_reward(
  TEXT, TEXT, BIGINT, TEXT, TEXT, TEXT, INTEGER, INTEGER, JSONB
) TO service_role;
