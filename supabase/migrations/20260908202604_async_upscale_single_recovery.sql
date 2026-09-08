-- One durable, fenced recovery attempt for a definitive primary GPU failure.
-- Billing/authentication and ambiguous submissions are never retried.
ALTER TABLE public.processing_credit_reservations
  ADD COLUMN recovery_count INTEGER NOT NULL DEFAULT 0 CHECK (recovery_count IN (0, 1)),
  ADD COLUMN recovery_state TEXT CHECK (recovery_state IN ('queued', 'submitting')),
  ADD COLUMN attempt_history JSONB NOT NULL DEFAULT '[]'::JSONB;

CREATE OR REPLACE FUNCTION public.enforce_async_upscale_immutability()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_recovery BOOLEAN := OLD.execution_mode IS NOT NULL
    AND OLD.recovery_count = 0 AND NEW.recovery_count = 1
    AND OLD.status = 'processing' AND NEW.status = 'processing'
    AND OLD.provider_phase = 'processing' AND NEW.provider_phase = 'submitting'
    AND OLD.resolved_model = 'real-esrgan' AND NEW.resolved_model = 'real-esrgan-large'
    AND OLD.provider_prediction_id IS NOT NULL AND NEW.provider_prediction_id IS NULL
    AND NEW.recovery_state = 'queued' AND OLD.execution_deadline_at > now()
    AND NEW.attempt_id IS DISTINCT FROM OLD.attempt_id;
BEGIN
  IF OLD.execution_mode IS NOT NULL AND ROW(
    NEW.job_id, NEW.user_id, NEW.usage_transaction_id, NEW.amount,
    NEW.consumed_subscription, NEW.consumed_purchased, NEW.execution_mode,
    NEW.request_fingerprint, NEW.input_storage_path, NEW.resolved_provider,
    NEW.quality_tier, NEW.result_context, NEW.attempt_started_at, NEW.execution_deadline_at, NEW.batch_window_start,
    NEW.async_delivery_token, NEW.delivery_token_hash
  ) IS DISTINCT FROM ROW(
    OLD.job_id, OLD.user_id, OLD.usage_transaction_id, OLD.amount,
    OLD.consumed_subscription, OLD.consumed_purchased, OLD.execution_mode,
    OLD.request_fingerprint, OLD.input_storage_path, OLD.resolved_provider,
    OLD.quality_tier, OLD.result_context, OLD.attempt_started_at, OLD.execution_deadline_at, OLD.batch_window_start,
    OLD.async_delivery_token, OLD.delivery_token_hash
  ) THEN
    RAISE EXCEPTION 'Async upscale admission context is immutable' USING ERRCODE = '22023';
  END IF;
  IF OLD.execution_mode IS NOT NULL AND NOT COALESCE(v_recovery, FALSE) THEN
    IF ROW(NEW.resolved_model, NEW.attempt_id, NEW.attempt_started_at, NEW.recovery_count, NEW.attempt_history)
      IS DISTINCT FROM ROW(OLD.resolved_model, OLD.attempt_id, OLD.attempt_started_at, OLD.recovery_count, OLD.attempt_history) THEN
      RAISE EXCEPTION 'Async upscale attempt context is immutable' USING ERRCODE = '22023';
    END IF;
    IF OLD.provider_prediction_id IS NOT NULL AND NEW.provider_prediction_id IS DISTINCT FROM OLD.provider_prediction_id THEN
      RAISE EXCEPTION 'Async upscale prediction identity is immutable' USING ERRCODE = '22023';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE FUNCTION public.prepare_async_upscale_recovery(
  p_user_id UUID, p_job_id UUID, p_attempt_id UUID, p_observation_token UUID
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.processing_credit_reservations%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.processing_credit_reservations
  WHERE user_id = p_user_id AND job_id = p_job_id AND execution_mode IS NOT NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'not_found'); END IF;
  IF v_row.status <> 'processing' OR v_row.provider_phase <> 'processing'
    OR v_row.recovery_count <> 0 OR v_row.resolved_model <> 'real-esrgan'
    OR v_row.provider_prediction_id IS NULL OR v_row.attempt_id IS DISTINCT FROM p_attempt_id
    OR p_observation_token IS NULL OR v_row.observation_lease_token IS DISTINCT FROM p_observation_token
    OR COALESCE(v_row.observation_lease_expires_at <= now(), TRUE)
    OR v_row.execution_deadline_at <= now()
    OR COALESCE(v_row.result_context->'recovery'->>'modelId', '') <> 'real-esrgan-large'
  THEN
    RETURN jsonb_build_object('outcome', 'unchanged') || public.async_upscale_job_state_private(p_job_id);
  END IF;
  UPDATE public.processing_credit_reservations SET
    attempt_history = attempt_history || jsonb_build_array(jsonb_build_object(
      'attemptId', attempt_id, 'model', resolved_model, 'predictionId', provider_prediction_id,
      'startedAt', attempt_started_at, 'failedAt', now(), 'failure', 'gpu_contention')),
    recovery_count = 1, recovery_state = 'queued', resolved_model = 'real-esrgan-large',
    attempt_id = gen_random_uuid(), provider_prediction_id = NULL,
    provider_phase = 'submitting', next_observation_at = now(),
    observation_lease_token = NULL, observation_lease_expires_at = NULL, updated_at = now()
  WHERE job_id = p_job_id;
  RETURN jsonb_build_object('outcome', 'queued') || public.async_upscale_job_state_private(p_job_id);
END;
$$;

CREATE FUNCTION public.claim_async_upscale_recovery(p_user_id UUID, p_job_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row public.processing_credit_reservations%ROWTYPE;
  v_claimed BOOLEAN := FALSE;
BEGIN
  SELECT * INTO v_row FROM public.processing_credit_reservations
  WHERE user_id = p_user_id AND job_id = p_job_id AND execution_mode IS NOT NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'not_found', 'claimed', FALSE); END IF;
  IF v_row.status = 'processing' AND v_row.provider_phase = 'submitting'
    AND v_row.recovery_count = 1 AND v_row.recovery_state = 'queued'
    AND v_row.provider_prediction_id IS NULL AND v_row.execution_deadline_at > now() THEN
    -- Never re-claim submission, even after a crashed Worker or lost response.
    -- The original execution deadline refunds an unknown accepted prediction.
    UPDATE public.processing_credit_reservations SET recovery_state = 'submitting',
      next_observation_at = execution_deadline_at, updated_at = now() WHERE job_id = p_job_id;
    v_claimed := TRUE;
  END IF;
  RETURN jsonb_build_object('outcome', 'found', 'claimed', v_claimed)
    || public.async_upscale_job_state_private(p_job_id);
END;
$$;

REVOKE ALL ON FUNCTION public.prepare_async_upscale_recovery(UUID, UUID, UUID, UUID)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.claim_async_upscale_recovery(UUID, UUID)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prepare_async_upscale_recovery(UUID, UUID, UUID, UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.claim_async_upscale_recovery(UUID, UUID) TO service_role;
