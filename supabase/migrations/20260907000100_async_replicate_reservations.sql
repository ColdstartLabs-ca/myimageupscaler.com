-- Phase 1: short Replicate requests backed by the existing credit reservation.
-- Apply transactionally. All RPCs are service-role-only; owner IDs are supplied
-- by the authenticated API, never taken from a browser's provider/price fields.
-- The original refund bodies are retained as private implementation functions
-- so legacy arithmetic and a local rollback do not depend on copied SQL.

ALTER TABLE public.processing_credit_reservations
  ADD COLUMN execution_mode TEXT,
  ADD COLUMN request_fingerprint TEXT,
  ADD COLUMN input_storage_path TEXT,
  ADD COLUMN resolved_provider TEXT,
  ADD COLUMN resolved_model TEXT,
  ADD COLUMN quality_tier TEXT,
  ADD COLUMN result_context JSONB,
  ADD COLUMN attempt_id UUID,
  ADD COLUMN attempt_started_at TIMESTAMPTZ,
  ADD COLUMN provider_prediction_id TEXT,
  ADD COLUMN provider_phase TEXT,
  ADD COLUMN next_observation_at TIMESTAMPTZ,
  ADD COLUMN observation_lease_token UUID,
  ADD COLUMN observation_lease_expires_at TIMESTAMPTZ,
  ADD COLUMN execution_deadline_at TIMESTAMPTZ,
  ADD COLUMN delivery_deadline_at TIMESTAMPTZ,
  ADD COLUMN delivery_lease_expires_at TIMESTAMPTZ,
  ADD COLUMN batch_window_start TIMESTAMPTZ,
  ADD COLUMN batch_slot_released_at TIMESTAMPTZ,
  ADD COLUMN async_delivery_token TEXT,
  ADD COLUMN provider_completed_at TIMESTAMPTZ,
  ADD COLUMN terminal_at TIMESTAMPTZ,
  ADD COLUMN provider_health_recorded_at TIMESTAMPTZ,
  ADD COLUMN terminal_effects_claimed_at TIMESTAMPTZ,
  ADD COLUMN failure_code TEXT,
  ADD COLUMN hard_worker_outcome TEXT,
  ADD COLUMN hard_worker_observed_at TIMESTAMPTZ,
  ADD CONSTRAINT async_upscale_mode CHECK (
    execution_mode IS NULL OR execution_mode = 'replicate_async_v1'
  ),
  ADD CONSTRAINT async_upscale_required_context CHECK (
    execution_mode IS NULL OR (
      request_fingerprint IS NOT NULL AND request_fingerprint ~ '^[0-9a-f]{64}$'
      AND input_storage_path IS NOT NULL AND length(input_storage_path) BETWEEN 1 AND 2048
      AND resolved_provider IS NOT NULL AND resolved_provider = 'replicate'
      AND resolved_model IS NOT NULL AND length(resolved_model) BETWEEN 1 AND 128
      AND quality_tier IS NOT NULL AND length(quality_tier) BETWEEN 1 AND 64
      AND result_context IS NOT NULL AND jsonb_typeof(result_context) = 'object'
      AND octet_length(result_context::TEXT) <= 32768
      AND attempt_id IS NOT NULL AND attempt_started_at IS NOT NULL
      AND execution_deadline_at = attempt_started_at + INTERVAL '15 minutes'
      AND execution_deadline_at IS NOT NULL AND batch_window_start IS NOT NULL
      AND provider_phase IS NOT NULL
      AND provider_phase IN ('submitting', 'processing', 'succeeded', 'failed', 'canceled')
      AND async_delivery_token IS NOT NULL AND length(async_delivery_token) BETWEEN 32 AND 256
      AND delivery_token_hash IS NOT NULL
      AND delivery_token_hash = encode(sha256(convert_to(async_delivery_token, 'UTF8')), 'hex')
    )
  ),
  ADD CONSTRAINT async_upscale_prediction_id_bound CHECK (
    provider_prediction_id IS NULL OR length(provider_prediction_id) BETWEEN 1 AND 128
  );

CREATE UNIQUE INDEX processing_credit_reservations_async_prediction_idx
  ON public.processing_credit_reservations (resolved_provider, provider_prediction_id)
  WHERE execution_mode IS NOT NULL AND provider_prediction_id IS NOT NULL;
CREATE INDEX processing_credit_reservations_async_due_idx
  ON public.processing_credit_reservations (next_observation_at, job_id)
  WHERE execution_mode IS NOT NULL AND status = 'processing';
CREATE INDEX processing_credit_reservations_async_owner_idx
  ON public.processing_credit_reservations (user_id, created_at DESC, job_id)
  WHERE execution_mode IS NOT NULL;

-- Legacy output staging must not replace an async capability or terminal result.
-- Admission's NULL -> async update is the only initialization of immutable data.
CREATE FUNCTION public.enforce_async_upscale_immutability()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF OLD.execution_mode IS NOT NULL AND ROW(
    NEW.job_id, NEW.user_id, NEW.usage_transaction_id, NEW.amount,
    NEW.consumed_subscription, NEW.consumed_purchased, NEW.execution_mode,
    NEW.request_fingerprint, NEW.input_storage_path, NEW.resolved_provider,
    NEW.resolved_model, NEW.quality_tier, NEW.result_context, NEW.attempt_id,
    NEW.attempt_started_at, NEW.execution_deadline_at, NEW.batch_window_start,
    NEW.async_delivery_token, NEW.delivery_token_hash
  ) IS DISTINCT FROM ROW(
    OLD.job_id, OLD.user_id, OLD.usage_transaction_id, OLD.amount,
    OLD.consumed_subscription, OLD.consumed_purchased, OLD.execution_mode,
    OLD.request_fingerprint, OLD.input_storage_path, OLD.resolved_provider,
    OLD.resolved_model, OLD.quality_tier, OLD.result_context, OLD.attempt_id,
    OLD.attempt_started_at, OLD.execution_deadline_at, OLD.batch_window_start,
    OLD.async_delivery_token, OLD.delivery_token_hash
  ) THEN
    RAISE EXCEPTION 'Async upscale admission context is immutable' USING ERRCODE = '22023';
  END IF;
  IF OLD.execution_mode IS NOT NULL AND OLD.provider_prediction_id IS NOT NULL
    AND NEW.provider_prediction_id IS DISTINCT FROM OLD.provider_prediction_id THEN
    RAISE EXCEPTION 'Async upscale prediction identity is immutable' USING ERRCODE = '22023';
  END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER protect_async_upscale_context
  BEFORE UPDATE ON public.processing_credit_reservations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_async_upscale_immutability();

-- Private shared response builder; it is never callable through the Data API.
CREATE FUNCTION public.async_upscale_job_state_private(p_job_id UUID)
RETURNS JSONB LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'reservation', to_jsonb(r),
    'balance', jsonb_build_object(
      'subscription', p.subscription_credits_balance,
      'purchased', p.purchased_credits_balance,
      'total', p.subscription_credits_balance + p.purchased_credits_balance
    )
  ) FROM public.processing_credit_reservations r
  JOIN public.profiles p ON p.id = r.user_id
  WHERE r.job_id = p_job_id;
$$;

CREATE FUNCTION public.read_async_upscale_job(
  p_user_id UUID, p_job_id UUID, p_request_fingerprint TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.processing_credit_reservations%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.processing_credit_reservations WHERE job_id = p_job_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', CASE
      WHEN p_request_fingerprint IS NOT NULL THEN 'new' ELSE 'not_found' END);
  END IF;
  IF v_row.user_id IS DISTINCT FROM p_user_id OR v_row.execution_mode IS NULL THEN
    RETURN jsonb_build_object('outcome', 'not_found');
  END IF;
  IF p_request_fingerprint IS NOT NULL
    AND v_row.request_fingerprint IS DISTINCT FROM p_request_fingerprint THEN
    RETURN jsonb_build_object('outcome', 'conflict');
  END IF;
  RETURN jsonb_build_object('outcome', 'found') || public.async_upscale_job_state_private(p_job_id);
END;
$$;

CREATE FUNCTION public.admit_async_upscale_job(
  p_user_id UUID,
  p_job_id UUID,
  p_request_fingerprint TEXT,
  p_input_storage_path TEXT,
  p_resolved_model TEXT,
  p_quality_tier TEXT,
  p_result_context JSONB,
  p_amount INTEGER,
  p_batch_limit INTEGER,
  p_delivery_token TEXT,
  p_delivery_token_hash TEXT,
  p_description TEXT DEFAULT 'Image processing',
  p_worker_ray_id TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row public.processing_credit_reservations%ROWTYPE;
  v_batch RECORD;
  v_balance INTEGER;
  v_rejection JSONB;
BEGIN
  IF p_job_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'Job and owner are required' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('async-upscale:' || p_job_id::TEXT, 0));
  SELECT * INTO v_row FROM public.processing_credit_reservations WHERE job_id = p_job_id;
  IF FOUND THEN
    IF v_row.user_id IS DISTINCT FROM p_user_id OR v_row.execution_mode IS NULL THEN
      RETURN jsonb_build_object('outcome', 'not_found');
    END IF;
    IF v_row.request_fingerprint IS DISTINCT FROM p_request_fingerprint THEN
      RETURN jsonb_build_object('outcome', 'conflict');
    END IF;
    RETURN jsonb_build_object('outcome', 'replay') || public.async_upscale_job_state_private(p_job_id);
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 OR p_batch_limit IS NULL OR p_batch_limit <= 0
    OR p_request_fingerprint IS NULL OR p_request_fingerprint !~ '^[0-9a-f]{64}$'
    OR p_input_storage_path IS NULL
    OR left(p_input_storage_path, 37) <> p_user_id::TEXT || '/'
    OR length(p_input_storage_path) > 2048
    OR p_resolved_model IS NULL OR length(p_resolved_model) NOT BETWEEN 1 AND 128
    OR p_quality_tier IS NULL OR length(p_quality_tier) NOT BETWEEN 1 AND 64
    OR p_result_context IS NULL OR jsonb_typeof(p_result_context) <> 'object'
    OR octet_length(p_result_context::TEXT) > 32768
    OR p_delivery_token IS NULL OR length(p_delivery_token) NOT BETWEEN 32 AND 256
    OR p_delivery_token_hash IS DISTINCT FROM encode(sha256(convert_to(p_delivery_token, 'UTF8')), 'hex')
    OR length(COALESCE(p_worker_ray_id, '')) > 128 THEN
    RAISE EXCEPTION 'Invalid async upscale admission context' USING ERRCODE = '22023';
  END IF;

  -- Lock order is job -> profile -> batch -> provider. A declined permit or any
  -- later error rolls back the actual existing credit/quota/permit functions.
  BEGIN
    SELECT subscription_credits_balance + purchased_credits_balance INTO v_balance
    FROM public.profiles WHERE id = p_user_id FOR UPDATE;
    IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'not_found'); END IF;
    IF v_balance < p_amount THEN
      RETURN jsonb_build_object('outcome', 'insufficient_credits', 'available', v_balance);
    END IF;
    SELECT * INTO v_batch FROM public.check_and_increment_batch_limit(p_user_id, p_batch_limit, 1);
    IF NOT v_batch.allowed THEN
      v_rejection := jsonb_build_object(
        'outcome', 'batch_limit', 'retry_at', v_batch.reset_at,
        'current_count', v_batch.current_count, 'batch_limit', v_batch.batch_limit
      );
      RAISE EXCEPTION 'Admission declined' USING ERRCODE = 'PA001';
    END IF;
    IF NOT public.acquire_provider_circuit_permit('image-processing') THEN
      v_rejection := jsonb_build_object('outcome', 'provider_unavailable');
      RAISE EXCEPTION 'Admission declined' USING ERRCODE = 'PA001';
    END IF;
    PERFORM public.consume_credits_v3(p_user_id, p_amount, p_job_id, p_description);
    UPDATE public.processing_credit_reservations SET
      execution_mode = 'replicate_async_v1', request_fingerprint = p_request_fingerprint,
      input_storage_path = p_input_storage_path, resolved_provider = 'replicate',
      resolved_model = p_resolved_model, quality_tier = p_quality_tier,
      result_context = p_result_context, attempt_id = gen_random_uuid(),
      attempt_started_at = now(), provider_phase = 'submitting',
      execution_deadline_at = now() + INTERVAL '15 minutes',
      next_observation_at = now() + INTERVAL '15 minutes',
      batch_window_start = date_trunc('hour', now()),
      async_delivery_token = p_delivery_token, delivery_token_hash = p_delivery_token_hash,
      failure_reason = CASE WHEN p_worker_ray_id IS NOT NULL THEN 'active_ray:' || p_worker_ray_id END,
      updated_at = now()
    WHERE job_id = p_job_id;
  EXCEPTION WHEN SQLSTATE 'PA001' THEN
    RETURN v_rejection;
  END;
  RETURN jsonb_build_object('outcome', 'admitted') || public.async_upscale_job_state_private(p_job_id);
END;
$$;

CREATE FUNCTION public.record_async_upscale_prediction(
  p_user_id UUID, p_job_id UUID, p_attempt_id UUID, p_prediction_id TEXT
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row public.processing_credit_reservations%ROWTYPE;
BEGIN
  IF p_prediction_id IS NULL OR p_prediction_id !~ '^[a-zA-Z0-9_-]{1,128}$' THEN
    RAISE EXCEPTION 'Invalid provider prediction ID' USING ERRCODE = '22023';
  END IF;
  SELECT * INTO v_row FROM public.processing_credit_reservations
  WHERE job_id = p_job_id AND user_id = p_user_id AND execution_mode IS NOT NULL FOR UPDATE;
  IF NOT FOUND OR v_row.attempt_id IS DISTINCT FROM p_attempt_id THEN RETURN FALSE; END IF;
  IF v_row.provider_prediction_id IS NOT NULL THEN
    RETURN v_row.provider_prediction_id = p_prediction_id;
  END IF;
  IF v_row.status <> 'processing' OR v_row.provider_phase <> 'submitting'
    OR v_row.execution_deadline_at <= now() THEN RETURN FALSE; END IF;
  UPDATE public.processing_credit_reservations SET
    provider_prediction_id = p_prediction_id, provider_phase = 'processing',
    next_observation_at = now(), updated_at = now()
  WHERE job_id = p_job_id;
  RETURN TRUE;
END;
$$;

CREATE FUNCTION public.claim_async_upscale_observation(p_user_id UUID, p_job_id UUID)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row public.processing_credit_reservations%ROWTYPE;
  v_token UUID;
BEGIN
  SELECT * INTO v_row FROM public.processing_credit_reservations
  WHERE job_id = p_job_id AND user_id = p_user_id AND execution_mode IS NOT NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'not_found', 'claimed', FALSE); END IF;
  IF v_row.status = 'processing' AND v_row.next_observation_at <= now()
    AND (v_row.observation_lease_expires_at IS NULL OR v_row.observation_lease_expires_at <= now())
    AND (v_row.provider_prediction_id IS NOT NULL OR v_row.execution_deadline_at <= now()) THEN
    v_token := gen_random_uuid();
    UPDATE public.processing_credit_reservations SET
      observation_lease_token = v_token,
      observation_lease_expires_at = now() + INTERVAL '10 seconds',
      next_observation_at = now() + INTERVAL '5 seconds', updated_at = now()
    WHERE job_id = p_job_id;
  END IF;
  RETURN jsonb_build_object('outcome', 'found', 'claimed', v_token IS NOT NULL,
    'observation_token', v_token) || public.async_upscale_job_state_private(p_job_id);
END;
$$;

-- Cron only reads a bounded, DB-owned work list. The per-job claim remains the
-- authority, so two cron callers cannot both issue a provider observation.
CREATE FUNCTION public.list_due_async_upscale_jobs(p_limit INTEGER DEFAULT 20)
RETURNS TABLE(
  user_id UUID,
  job_id UUID,
  next_observation_at TIMESTAMPTZ,
  due_count BIGINT
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH due AS (
    SELECT r.user_id, r.job_id, r.next_observation_at
    FROM public.processing_credit_reservations r
    WHERE r.execution_mode = 'replicate_async_v1'
      AND r.status = 'processing'
      AND r.next_observation_at IS NOT NULL
      AND r.next_observation_at <= now()
      AND (r.observation_lease_expires_at IS NULL OR r.observation_lease_expires_at <= now())
  )
  SELECT due.user_id, due.job_id, due.next_observation_at,
    (SELECT count(*) FROM due)::BIGINT AS due_count
  FROM due
  ORDER BY due.next_observation_at, due.job_id
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 20);
$$;

-- Keep the incumbent pool arithmetic private. Only the guarded terminal RPC
-- below can call this implementation for an async reservation.
ALTER FUNCTION public.refund_processing_credit_reservation(UUID, UUID, TEXT)
  RENAME TO refund_processing_credit_reservation_legacy_private;

CREATE FUNCTION public.apply_async_upscale_observation(
  p_user_id UUID,
  p_job_id UUID,
  p_attempt_id UUID,
  p_observation_token UUID DEFAULT NULL,
  p_provider_status TEXT DEFAULT NULL,
  p_output_url TEXT DEFAULT NULL,
  p_output_mime_type TEXT DEFAULT NULL,
  p_provider_completed_at TIMESTAMPTZ DEFAULT NULL,
  p_provider_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_failure_code TEXT DEFAULT NULL,
  p_failure_message TEXT DEFAULT NULL,
  p_failure_kind TEXT DEFAULT NULL
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row public.processing_credit_reservations%ROWTYPE;
  v_deadline BOOLEAN;
  v_refund BOOLEAN := FALSE;
  v_transitioned BOOLEAN := FALSE;
  v_delivery_deadline TIMESTAMPTZ;
  v_failure_kind TEXT := p_failure_kind;
  v_failure_code TEXT := p_failure_code;
  v_failure_message TEXT := p_failure_message;
  v_health_success BOOLEAN;
BEGIN
  SELECT * INTO v_row FROM public.processing_credit_reservations
  WHERE job_id = p_job_id AND user_id = p_user_id AND execution_mode IS NOT NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('outcome', 'not_found', 'transitioned', FALSE); END IF;
  IF v_row.status <> 'processing' OR v_row.attempt_id IS DISTINCT FROM p_attempt_id THEN
    RETURN jsonb_build_object('outcome', 'found', 'transitioned', FALSE)
      || public.async_upscale_job_state_private(p_job_id);
  END IF;
  v_deadline := CASE WHEN v_row.provider_phase = 'succeeded'
    THEN v_row.delivery_deadline_at <= now() ELSE v_row.execution_deadline_at <= now() END;
  IF v_deadline THEN
    v_refund := TRUE;
    IF v_row.provider_phase = 'succeeded' THEN
      v_failure_code := 'OUTPUT_EXPIRED';
      v_failure_message := 'The result expired before it was downloaded.';
    ELSE
      v_failure_code := 'PROCESSING_TIMEOUT';
      v_failure_message := 'Processing did not finish before the deadline.';
      v_failure_kind := 'timeout';
      v_health_success := FALSE;
    END IF;
  ELSE
    -- A definitive create rejection is allowed only before an ID is known.
    -- Known predictions require the current observation token, even on failure.
    IF NOT COALESCE((
      (p_observation_token IS NOT NULL
        AND v_row.observation_lease_token = p_observation_token
        AND v_row.observation_lease_expires_at > now())
      OR (p_observation_token IS NULL AND v_row.provider_prediction_id IS NULL
        AND v_row.provider_phase = 'submitting' AND p_provider_status IN ('failed', 'canceled'))
    ), FALSE) OR v_row.provider_phase IN ('succeeded', 'failed', 'canceled') THEN
      RETURN jsonb_build_object('outcome', 'found', 'transitioned', FALSE)
        || public.async_upscale_job_state_private(p_job_id);
    END IF;
    IF p_provider_status IS NULL OR p_provider_status IN ('starting', 'processing') THEN
      -- A transport/read error is an observation error, not a failed prediction.
      UPDATE public.processing_credit_reservations SET
        observation_lease_token = NULL, observation_lease_expires_at = NULL,
        next_observation_at = LEAST(execution_deadline_at, now() + INTERVAL '5 seconds'),
        updated_at = now() WHERE job_id = p_job_id;
      RETURN jsonb_build_object('outcome', 'found', 'transitioned', FALSE)
        || public.async_upscale_job_state_private(p_job_id);
    ELSIF p_provider_status = 'succeeded' THEN
      IF p_output_url IS NULL OR length(p_output_url) > 8192
        OR p_output_url !~ '^https://([a-zA-Z0-9-]+\.)*replicate\.delivery/'
        OR p_output_mime_type IS NULL OR p_output_mime_type NOT IN ('image/png', 'image/jpeg', 'image/webp')
        OR p_provider_completed_at IS NULL OR p_provider_completed_at > now() + INTERVAL '1 minute' THEN
        RAISE EXCEPTION 'Invalid provider output metadata' USING ERRCODE = '22023';
      END IF;
      v_delivery_deadline := LEAST(
        COALESCE(p_provider_expires_at, p_provider_completed_at + INTERVAL '1 hour') - INTERVAL '5 minutes',
        now() + INTERVAL '30 minutes'
      );
      UPDATE public.processing_credit_reservations SET
        provider_phase = 'succeeded', provider_completed_at = p_provider_completed_at,
        output_url = p_output_url, output_mime_type = p_output_mime_type,
        output_expires_at = v_delivery_deadline, delivery_deadline_at = v_delivery_deadline,
        output_staged_at = now(), terminal_at = now(), failure_reason = NULL,
        observation_lease_token = NULL, observation_lease_expires_at = NULL,
        next_observation_at = v_delivery_deadline, updated_at = now()
      WHERE job_id = p_job_id;
      v_transitioned := TRUE;
      v_health_success := TRUE;
      IF v_delivery_deadline <= now() THEN
        v_refund := TRUE;
        v_failure_code := 'OUTPUT_EXPIRED';
        v_failure_message := 'The result expired before it was downloaded.';
      END IF;
    ELSIF p_provider_status IN ('failed', 'canceled') THEN
      v_refund := TRUE;
      v_health_success := FALSE;
    ELSE
      RAISE EXCEPTION 'Invalid provider observation status' USING ERRCODE = '22023';
    END IF;
  END IF;

  IF v_refund THEN
    -- Phase 4 will acquire this lease from the output route. Its refund exclusion
    -- is already enforced here; no generic caller can override it.
    IF v_row.delivery_lease_expires_at > now() THEN
      RETURN jsonb_build_object('outcome', 'found', 'transitioned', FALSE)
        || public.async_upscale_job_state_private(p_job_id);
    END IF;
    PERFORM public.refund_processing_credit_reservation_legacy_private(
      p_user_id, p_job_id, left(COALESCE(v_failure_message, 'Image processing failed.'), 512)
    );
    IF v_row.batch_slot_released_at IS NULL THEN
      UPDATE public.batch_usage SET count = GREATEST(count - 1, 0), updated_at = now()
      WHERE user_id = p_user_id AND window_start = v_row.batch_window_start;
    END IF;
    UPDATE public.processing_credit_reservations SET
      provider_phase = CASE WHEN v_row.provider_phase = 'succeeded' OR v_health_success IS TRUE THEN 'succeeded'
        WHEN p_provider_status = 'canceled' THEN 'canceled' ELSE 'failed' END,
      failure_code = left(COALESCE(v_failure_code, 'PROCESSING_FAILED'), 64),
      batch_slot_released_at = COALESCE(batch_slot_released_at, now()),
      output_url = NULL, observation_lease_token = NULL, observation_lease_expires_at = NULL,
      next_observation_at = NULL, terminal_at = COALESCE(terminal_at, now()), updated_at = now()
    WHERE job_id = p_job_id;
    v_transitioned := TRUE;
  END IF;
  IF v_transitioned AND v_row.provider_health_recorded_at IS NULL
    AND (v_health_success IS TRUE OR v_failure_kind IS NOT NULL) THEN
    IF v_failure_kind IS NOT NULL AND v_failure_kind NOT IN (
      'authentication', 'billing', 'internal', 'provider_unavailable', 'rate_limited', 'timeout'
    ) THEN RAISE EXCEPTION 'Invalid provider failure kind' USING ERRCODE = '22023'; END IF;
    PERFORM public.record_provider_health_outcome('image-processing', v_health_success, v_failure_kind, 5, 300);
    UPDATE public.processing_credit_reservations SET provider_health_recorded_at = now()
    WHERE job_id = p_job_id;
  END IF;
  RETURN jsonb_build_object('outcome', 'found', 'transitioned', v_transitioned)
    || public.async_upscale_job_state_private(p_job_id);
END;
$$;

CREATE FUNCTION public.claim_async_upscale_terminal_effects(p_user_id UUID, p_job_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.processing_credit_reservations SET terminal_effects_claimed_at = now(), updated_at = now()
  WHERE job_id = p_job_id AND user_id = p_user_id AND execution_mode IS NOT NULL
    AND terminal_at IS NOT NULL AND terminal_effects_claimed_at IS NULL;
  RETURN FOUND;
END;
$$;

-- A shared guard protects every historical job-reference refund entry point.
-- Its advisory lock serializes the absence check with a new async admission.
-- Non-job payment references keep their existing behavior.
CREATE FUNCTION public.allow_legacy_upscale_mutation_private(
  p_job_id TEXT, p_failure_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_job_id UUID;
BEGIN
  IF p_job_id IS NULL OR p_job_id !~* '^(refund_|reservation_refund_)?[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
    RETURN TRUE;
  END IF;
  v_job_id := regexp_replace(p_job_id, '^(refund_|reservation_refund_)', '', 'i')::UUID;
  PERFORM pg_advisory_xact_lock(hashtextextended('async-upscale:' || v_job_id::TEXT, 0));
  PERFORM 1 FROM public.processing_credit_reservations
  WHERE job_id = v_job_id AND execution_mode IS NOT NULL FOR UPDATE;
  IF NOT FOUND THEN RETURN TRUE; END IF;
  IF p_failure_reason LIKE 'tail_observed_%' THEN
    UPDATE public.processing_credit_reservations SET
      hard_worker_outcome = left(p_failure_reason, 128), hard_worker_observed_at = now(), updated_at = now()
    WHERE job_id = v_job_id;
  END IF;
  RETURN FALSE;
END;
$$;

CREATE FUNCTION public.refund_processing_credit_reservation(
  p_user_id UUID, p_job_id UUID, p_failure_reason TEXT DEFAULT 'processing_failed'
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.allow_legacy_upscale_mutation_private(p_job_id::TEXT, p_failure_reason) THEN RETURN FALSE; END IF;
  RETURN public.refund_processing_credit_reservation_legacy_private(p_user_id, p_job_id, p_failure_reason);
END;
$$;

ALTER FUNCTION public.refund_consumed_credits(UUID, INTEGER, TEXT, INTEGER, INTEGER, TEXT)
  RENAME TO refund_consumed_credits_legacy_private;
CREATE FUNCTION public.refund_consumed_credits(
  p_user_id UUID, p_amount INTEGER, p_job_id TEXT,
  p_subscription_amount INTEGER DEFAULT NULL, p_purchased_amount INTEGER DEFAULT NULL,
  p_description TEXT DEFAULT 'Credit refund for failed processing'
)
RETURNS TABLE(success BOOLEAN, already_refunded BOOLEAN, refunded_amount INTEGER,
  new_subscription_balance INTEGER, new_purchased_balance INTEGER, new_total_balance INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.allow_legacy_upscale_mutation_private(p_job_id, p_description) THEN
    RETURN QUERY SELECT FALSE, FALSE, 0, p.subscription_credits_balance, p.purchased_credits_balance,
      p.subscription_credits_balance + p.purchased_credits_balance FROM public.profiles p WHERE p.id = p_user_id;
    RETURN;
  END IF;
  RETURN QUERY SELECT * FROM public.refund_consumed_credits_legacy_private(
    p_user_id, p_amount, p_job_id, p_subscription_amount, p_purchased_amount, p_description);
END;
$$;

ALTER FUNCTION public.refund_credits(UUID, INTEGER, TEXT) RENAME TO refund_credits_legacy_private;
CREATE FUNCTION public.refund_credits(target_user_id UUID, amount INTEGER, job_id TEXT DEFAULT NULL)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.allow_legacy_upscale_mutation_private(job_id) THEN
    RAISE EXCEPTION 'Async reservations require a guarded terminal refund' USING ERRCODE = '22023';
  END IF;
  RETURN public.refund_credits_legacy_private(target_user_id, amount, job_id);
END;
$$;

-- Some deployed schemas have retired these unused legacy entrypoints. Guard
-- them where present without recreating an API that no longer exists.
DO $guard$
BEGIN
IF to_regprocedure('public.refund_credits_v2(uuid,integer,text,text,text)') IS NOT NULL THEN
ALTER FUNCTION public.refund_credits_v2(UUID, INTEGER, TEXT, TEXT, TEXT) RENAME TO refund_credits_v2_legacy_private;
EXECUTE $definition$
CREATE FUNCTION public.refund_credits_v2(
  target_user_id UUID, amount INTEGER, job_id TEXT, target_pool TEXT DEFAULT 'purchased',
  p_description TEXT DEFAULT 'Credit refund for failed processing'
)
RETURNS TABLE(success BOOLEAN, refunded_amount INTEGER, new_subscription_balance INTEGER,
  new_purchased_balance INTEGER, new_total_balance INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.allow_legacy_upscale_mutation_private(job_id, p_description) THEN
    RETURN QUERY SELECT FALSE, 0, p.subscription_credits_balance, p.purchased_credits_balance,
      p.subscription_credits_balance + p.purchased_credits_balance FROM public.profiles p WHERE p.id = target_user_id;
    RETURN;
  END IF;
  RETURN QUERY SELECT * FROM public.refund_credits_v2_legacy_private(
    target_user_id, amount, job_id, target_pool, p_description);
END;
$$;

$definition$;
END IF;
END;
$guard$;

DO $guard$
BEGIN
IF to_regprocedure('public.refund_credits_to_pool(uuid,integer,text,text,text)') IS NOT NULL THEN
ALTER FUNCTION public.refund_credits_to_pool(UUID, INTEGER, TEXT, TEXT, TEXT) RENAME TO refund_credits_to_pool_legacy_private;
EXECUTE $definition$
CREATE FUNCTION public.refund_credits_to_pool(
  p_target_user_id UUID, p_amount INTEGER, p_reason TEXT DEFAULT 'Credit refund',
  p_ref_id TEXT DEFAULT NULL, p_pool TEXT DEFAULT 'purchased'
)
RETURNS TABLE(success BOOLEAN, new_balance INTEGER, error_message TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.allow_legacy_upscale_mutation_private(p_ref_id, p_reason) THEN
    RETURN QUERY SELECT FALSE, 0, 'Async reservations require a guarded terminal refund'::TEXT;
    RETURN;
  END IF;
  RETURN QUERY SELECT * FROM public.refund_credits_to_pool_legacy_private(
    p_target_user_id, p_amount, p_reason, p_ref_id, p_pool);
END;
$$;
$definition$;
END IF;
END;
$guard$;

ALTER FUNCTION public.record_processing_credit_reservation_output(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT)
  RENAME TO record_processing_credit_reservation_output_legacy_private;
CREATE FUNCTION public.record_processing_credit_reservation_output(
  p_user_id UUID, p_job_id UUID, p_output_url TEXT, p_output_mime_type TEXT,
  p_output_expires_at TIMESTAMPTZ DEFAULT NULL, p_delivery_token_hash TEXT DEFAULT NULL
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.allow_legacy_upscale_mutation_private(p_job_id::TEXT) THEN RETURN FALSE; END IF;
  RETURN public.record_processing_credit_reservation_output_legacy_private(
    p_user_id, p_job_id, p_output_url, p_output_mime_type, p_output_expires_at, p_delivery_token_hash);
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_stale_credit_reservations(
  p_stale_before TIMESTAMPTZ, p_limit INTEGER DEFAULT 100
)
RETURNS TABLE(refunded_count INTEGER, quarantined_count INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row RECORD; v_refunded INTEGER := 0; v_quarantined INTEGER := 0;
BEGIN
  FOR v_row IN
    SELECT job_id, user_id FROM public.processing_credit_reservations
    WHERE execution_mode IS NULL AND status = 'processing' AND created_at < p_stale_before
      AND COALESCE(delivery_attempted_at, output_staged_at, created_at) < p_stale_before
    ORDER BY created_at LIMIT LEAST(GREATEST(p_limit, 1), 500) FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      IF public.refund_processing_credit_reservation_legacy_private(v_row.user_id, v_row.job_id, 'stale_worker_reservation') THEN
        v_refunded := v_refunded + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.processing_credit_reservations
      SET status = 'quarantined', failure_reason = SQLERRM, updated_at = now()
      WHERE job_id = v_row.job_id AND status = 'processing' AND execution_mode IS NULL;
      v_quarantined := v_quarantined + 1;
    END;
  END LOOP;
  RETURN QUERY SELECT v_refunded, v_quarantined;
END;
$$;

-- New functions default to PUBLIC EXECUTE. Restrict both internal implementations
-- and RPCs explicitly; renaming an incumbent function preserves its old grants.
DO $$
DECLARE v_function REGPROCEDURE;
BEGIN
  FOR v_function IN SELECT p.oid::REGPROCEDURE FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN (
      'enforce_async_upscale_immutability', 'async_upscale_job_state_private',
      'allow_legacy_upscale_mutation_private', 'refund_processing_credit_reservation_legacy_private',
      'refund_consumed_credits_legacy_private', 'refund_credits_legacy_private',
      'refund_credits_v2_legacy_private', 'refund_credits_to_pool_legacy_private',
      'record_processing_credit_reservation_output_legacy_private'
    )
  LOOP EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role', v_function); END LOOP;
  FOR v_function IN SELECT p.oid::REGPROCEDURE FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN (
      'read_async_upscale_job', 'admit_async_upscale_job', 'record_async_upscale_prediction',
      'claim_async_upscale_observation', 'list_due_async_upscale_jobs',
      'apply_async_upscale_observation', 'claim_async_upscale_terminal_effects',
      'refund_processing_credit_reservation', 'refund_consumed_credits', 'refund_credits',
      'refund_credits_v2', 'refund_credits_to_pool', 'record_processing_credit_reservation_output',
      'reconcile_stale_credit_reservations'
    )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_function);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_function);
  END LOOP;
END;
$$;

COMMENT ON COLUMN public.processing_credit_reservations.async_delivery_token IS
  'Private, random per-job capability, recoverable only through authenticated owner status. Never log or include in lists.';
COMMENT ON COLUMN public.processing_credit_reservations.terminal_effects_claimed_at IS
  'At-most-once external side-effect claim. A crash after claim may lose telemetry; financial state and health are transactional.';
COMMENT ON COLUMN public.processing_credit_reservations.delivery_lease_expires_at IS
  'Reserved for Phase 4 output leasing. Dedicated refunds already refuse an active lease; legacy Phase 1 output remains unchanged.';

-- DOWN (disposable local database only): first assert there are NO async rows.
-- Production rollback must keep async status/output/reconciliation and guards
-- alive until all admitted jobs settle. Never remove columns with live jobs.
-- Extract and execute this block only against an empty disposable async fixture.
/* LOCAL DOWN
BEGIN;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.processing_credit_reservations WHERE execution_mode IS NOT NULL) THEN
    RAISE EXCEPTION 'Async rows remain';
  END IF;
END $$;
DROP TRIGGER protect_async_upscale_context ON public.processing_credit_reservations;
DROP FUNCTION public.enforce_async_upscale_immutability();
DROP FUNCTION public.read_async_upscale_job(UUID, UUID, TEXT);
DROP FUNCTION public.admit_async_upscale_job(UUID, UUID, TEXT, TEXT, TEXT, TEXT, JSONB, INTEGER, INTEGER, TEXT, TEXT, TEXT, TEXT);
DROP FUNCTION public.record_async_upscale_prediction(UUID, UUID, UUID, TEXT);
DROP FUNCTION public.claim_async_upscale_observation(UUID, UUID);
DROP FUNCTION public.list_due_async_upscale_jobs(INTEGER);
DROP FUNCTION public.apply_async_upscale_observation(UUID, UUID, UUID, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT);
DROP FUNCTION public.claim_async_upscale_terminal_effects(UUID, UUID);
DROP FUNCTION public.async_upscale_job_state_private(UUID);
DO $$
DECLARE v_name TEXT; v_args TEXT;
BEGIN
  FOREACH v_name IN ARRAY ARRAY[
    'refund_processing_credit_reservation', 'refund_consumed_credits', 'refund_credits',
    'refund_credits_v2', 'refund_credits_to_pool', 'record_processing_credit_reservation_output'
  ] LOOP
    SELECT pg_get_function_identity_arguments(p.oid) INTO STRICT v_args
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = v_name;
    EXECUTE format('DROP FUNCTION public.%I(%s)', v_name, v_args);
    EXECUTE format('ALTER FUNCTION public.%I(%s) RENAME TO %I', v_name || '_legacy_private', v_args, v_name);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role', v_name, v_args);
  END LOOP;
END $$;
DROP FUNCTION public.allow_legacy_upscale_mutation_private(TEXT, TEXT);

-- Restore the incumbent sweeper from 20260826143000 (same exclusion-free body).
CREATE OR REPLACE FUNCTION public.reconcile_stale_credit_reservations(
  p_stale_before TIMESTAMPTZ, p_limit INTEGER DEFAULT 100
)
RETURNS TABLE(refunded_count INTEGER, quarantined_count INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_row RECORD; v_refunded INTEGER := 0; v_quarantined INTEGER := 0;
BEGIN
  FOR v_row IN
    SELECT job_id, user_id FROM public.processing_credit_reservations
    WHERE status = 'processing' AND created_at < p_stale_before
      AND COALESCE(delivery_attempted_at, output_staged_at, created_at) < p_stale_before
    ORDER BY created_at LIMIT LEAST(GREATEST(p_limit, 1), 500) FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      IF public.refund_processing_credit_reservation(v_row.user_id, v_row.job_id, 'stale_worker_reservation') THEN
        v_refunded := v_refunded + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.processing_credit_reservations
      SET status = 'quarantined', failure_reason = SQLERRM, updated_at = now()
      WHERE job_id = v_row.job_id AND status = 'processing';
      v_quarantined := v_quarantined + 1;
    END;
  END LOOP;
  RETURN QUERY SELECT v_refunded, v_quarantined;
END;
$$;
DROP INDEX public.processing_credit_reservations_async_prediction_idx,
  public.processing_credit_reservations_async_due_idx, public.processing_credit_reservations_async_owner_idx;
ALTER TABLE public.processing_credit_reservations
  DROP CONSTRAINT async_upscale_mode, DROP CONSTRAINT async_upscale_required_context,
  DROP CONSTRAINT async_upscale_prediction_id_bound,
  DROP COLUMN execution_mode, DROP COLUMN request_fingerprint, DROP COLUMN input_storage_path,
  DROP COLUMN resolved_provider, DROP COLUMN resolved_model, DROP COLUMN quality_tier,
  DROP COLUMN result_context, DROP COLUMN attempt_id, DROP COLUMN attempt_started_at,
  DROP COLUMN provider_prediction_id, DROP COLUMN provider_phase, DROP COLUMN next_observation_at,
  DROP COLUMN observation_lease_token, DROP COLUMN observation_lease_expires_at,
  DROP COLUMN execution_deadline_at, DROP COLUMN delivery_deadline_at, DROP COLUMN delivery_lease_expires_at,
  DROP COLUMN batch_window_start, DROP COLUMN batch_slot_released_at, DROP COLUMN async_delivery_token,
  DROP COLUMN provider_completed_at, DROP COLUMN terminal_at, DROP COLUMN provider_health_recorded_at,
  DROP COLUMN terminal_effects_claimed_at, DROP COLUMN failure_code,
  DROP COLUMN hard_worker_outcome, DROP COLUMN hard_worker_observed_at;
COMMIT;
END LOCAL DOWN */
