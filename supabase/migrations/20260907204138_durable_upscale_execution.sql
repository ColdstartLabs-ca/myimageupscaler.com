-- Durable authenticated upscale execution.
--
-- This migration is self-contained. A v2 admission owns the execution row,
-- the existing credit reservation, the batch slot and the first outbox action
-- in one transaction. Provider work and output delivery are performed by the
-- external executor; the browser never writes these tables directly.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'upscale-inputs', 'upscale-inputs', FALSE, 134217728,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

ALTER TABLE public.processing_credit_reservations
  ADD COLUMN IF NOT EXISTS protocol_version TEXT NOT NULL DEFAULT 'v1',
  ADD COLUMN IF NOT EXISTS output_staged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_attempted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.processing_credit_reservations'::regclass
      AND conname = 'processing_credit_reservations_protocol_version_check'
  ) THEN
    ALTER TABLE public.processing_credit_reservations
      ADD CONSTRAINT processing_credit_reservations_protocol_version_check
      CHECK (protocol_version IN ('v1', 'v2'));
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.upscale_executions (
  job_id UUID PRIMARY KEY REFERENCES public.processing_credit_reservations(job_id),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  protocol_version TEXT NOT NULL DEFAULT 'v2' CHECK (protocol_version = 'v2'),
  request_fingerprint TEXT NOT NULL,
  config JSONB NOT NULL DEFAULT '{}'::JSONB,
  selection_mode TEXT NOT NULL DEFAULT 'explicit' CHECK (selection_mode IN ('explicit', 'auto')),
  input_storage_path TEXT NOT NULL,
  input_mime_type TEXT NOT NULL,
  input_size_bytes BIGINT NOT NULL CHECK (input_size_bytes > 0),
  input_width INTEGER CHECK (input_width IS NULL OR input_width > 0),
  input_height INTEGER CHECK (input_height IS NULL OR input_height > 0),
  quality_tier TEXT NOT NULL,
  scale INTEGER NOT NULL CHECK (scale IN (2, 4, 8)),
  billing_model_id TEXT NOT NULL,
  resolved_model_id TEXT NOT NULL,
  provider TEXT NOT NULL CHECK (provider IN ('replicate', 'gemini', 'deferred')),
  model_version TEXT,
  credits_reserved INTEGER NOT NULL CHECK (credits_reserved > 0),
  batch_limit INTEGER NOT NULL CHECK (batch_limit > 0),
  batch_slot_released BOOLEAN NOT NULL DEFAULT FALSE,
  stage TEXT NOT NULL DEFAULT 'queued'
    CHECK (stage IN ('queued', 'submitting', 'submission_unknown', 'processing', 'staging', 'ready', 'completed', 'failed', 'expired')),
  retryable BOOLEAN NOT NULL DEFAULT FALSE,
  deadline_at TIMESTAMPTZ NOT NULL,
  submission_deadline_at TIMESTAMPTZ NOT NULL,
  next_action TEXT CHECK (next_action IS NULL OR next_action IN ('advance', 'poll', 'reconcile', 'stage', 'expire_output')),
  next_action_at TIMESTAMPTZ,
  lease_generation BIGINT NOT NULL DEFAULT 0 CHECK (lease_generation >= 0),
  output_storage_path TEXT,
  output_mime_type TEXT,
  output_size_bytes BIGINT CHECK (output_size_bytes IS NULL OR output_size_bytes > 0),
  output_width INTEGER CHECK (output_width IS NULL OR output_width > 0),
  output_height INTEGER CHECK (output_height IS NULL OR output_height > 0),
  output_expires_at TIMESTAMPTZ,
  delivery_token_hash TEXT,
  -- Preserve a short grace window when status polling rotates a capability
  -- while another tab is still downloading the same output.
  delivery_token_hash_history TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  delivery_lease_expires_at TIMESTAMPTZ,
  delivery_lease_token_hash TEXT,
  delivery_lease_generation BIGINT NOT NULL DEFAULT 0,
  delivery_attempted_at TIMESTAMPTZ,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_delivery_token_hash TEXT,
  failure_reason TEXT,
  build_id TEXT NOT NULL DEFAULT 'unknown',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  started_at TIMESTAMPTZ,
  ready_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.upscale_attempts (
  attempt_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.upscale_executions(job_id) ON DELETE CASCADE,
  ordinal INTEGER NOT NULL CHECK (ordinal > 0),
  provider TEXT NOT NULL,
  model_id TEXT NOT NULL,
  model_version TEXT,
  callback_correlation TEXT NOT NULL UNIQUE,
  submission_state TEXT NOT NULL DEFAULT 'persisted'
    CHECK (submission_state IN ('persisted', 'creating', 'unknown', 'bound', 'processing', 'terminal')),
  provider_prediction_id TEXT UNIQUE,
  provider_status TEXT,
  provider_output_url TEXT,
  provider_output_mime_type TEXT,
  provider_output_expires_at TIMESTAMPTZ,
  failure_reason TEXT,
  create_started_at TIMESTAMPTZ,
  provider_accepted_at TIMESTAMPTZ,
  terminal_at TIMESTAMPTZ,
  next_poll_at TIMESTAMPTZ,
  poll_count INTEGER NOT NULL DEFAULT 0 CHECK (poll_count >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, ordinal)
);

CREATE TABLE IF NOT EXISTS public.upscale_outbox (
  id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES public.upscale_executions(job_id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('advance', 'poll', 'reconcile', 'stage', 'expire_output')),
  generation BIGINT NOT NULL CHECK (generation >= 0),
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  due_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  claimed_at TIMESTAMPTZ,
  claim_expires_at TIMESTAMPTZ,
  claimed_by TEXT,
  published_at TIMESTAMPTZ,
  attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (job_id, action, generation)
);

-- Signed executor wakes are at-least-once. Keep a short-lived claim keyed by
-- the HMAC so a retried edge wake cannot run the dispatcher twice at once.
CREATE TABLE IF NOT EXISTS public.upscale_wake_claims (
  signature TEXT PRIMARY KEY CHECK (signature ~ '^[0-9a-f]{64}$'),
  expires_at TIMESTAMPTZ NOT NULL,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS upscale_wake_claims_expiry_idx
  ON public.upscale_wake_claims (expires_at);

-- A deployment is unavailable until an executor proves readiness. No default
-- healthy row is inserted by the migration or by application admission.
CREATE TABLE IF NOT EXISTS public.upscale_executor_health (
  singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
  image_digest TEXT NOT NULL CHECK (image_digest ~ '^sha256:[0-9a-f]{64}$'),
  healthy BOOLEAN NOT NULL,
  checked_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Capability lifetime is independent of the staged object's lifetime. A live
-- delivery lease remains authoritative for its stream after token expiry.
CREATE TABLE IF NOT EXISTS public.upscale_delivery_capabilities (
  job_id UUID NOT NULL REFERENCES public.upscale_executions(job_id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (job_id, token_hash)
);

ALTER TABLE public.upscale_executions
  ADD COLUMN IF NOT EXISTS delivery_token_hash_history TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS delivery_lease_token_hash TEXT;

CREATE INDEX IF NOT EXISTS upscale_executions_user_created_idx
  ON public.upscale_executions (user_id, created_at DESC, job_id DESC);
CREATE INDEX IF NOT EXISTS upscale_executions_active_idx
  ON public.upscale_executions (stage, next_action_at)
  WHERE stage IN ('queued', 'submitting', 'submission_unknown', 'processing', 'staging', 'ready');
CREATE INDEX IF NOT EXISTS upscale_executions_deadline_idx
  ON public.upscale_executions (deadline_at)
  WHERE stage IN ('queued', 'submitting', 'submission_unknown', 'processing', 'staging', 'ready');
CREATE INDEX IF NOT EXISTS upscale_executions_output_idx
  ON public.upscale_executions (output_storage_path)
  WHERE output_storage_path IS NOT NULL;
CREATE INDEX IF NOT EXISTS upscale_attempts_job_state_idx
  ON public.upscale_attempts (job_id, submission_state, ordinal DESC);
CREATE UNIQUE INDEX IF NOT EXISTS upscale_attempts_prediction_idx
  ON public.upscale_attempts (provider_prediction_id)
  WHERE provider_prediction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS upscale_outbox_due_idx
  ON public.upscale_outbox (due_at, id)
  WHERE published_at IS NULL;
CREATE INDEX IF NOT EXISTS upscale_outbox_claim_idx
  ON public.upscale_outbox (claim_expires_at)
  WHERE published_at IS NULL AND claim_expires_at IS NOT NULL;

ALTER TABLE public.upscale_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upscale_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upscale_outbox ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upscale_wake_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upscale_executor_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.upscale_delivery_capabilities ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.upscale_executions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.upscale_attempts FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.upscale_outbox FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.upscale_wake_claims FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.upscale_executions TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.upscale_attempts TO service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.upscale_outbox TO service_role;
REVOKE ALL ON TABLE public.upscale_wake_claims FROM service_role;
REVOKE ALL ON TABLE public.upscale_executor_health FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON TABLE public.upscale_delivery_capabilities FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.record_upscale_executor_health(p_image_digest TEXT,p_healthy BOOLEAN)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_image_digest IS NULL OR p_image_digest !~ '^sha256:[0-9a-f]{64}$' OR p_healthy IS NULL THEN RETURN FALSE; END IF;
  INSERT INTO public.upscale_executor_health(singleton,image_digest,healthy,checked_at)
  VALUES(TRUE,p_image_digest,p_healthy,now())
  ON CONFLICT(singleton) DO UPDATE SET image_digest=EXCLUDED.image_digest,healthy=EXCLUDED.healthy,checked_at=EXCLUDED.checked_at;
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_upscale_executor_availability()
RETURNS TABLE(healthy BOOLEAN,checked_at TIMESTAMPTZ,image_digest TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT COALESCE(h.healthy AND h.checked_at>=now()-interval '120 seconds' AND h.checked_at<=now(),FALSE),h.checked_at,h.image_digest
  FROM (VALUES(TRUE)) AS expected(singleton)
  LEFT JOIN public.upscale_executor_health h USING(singleton);
$$;

CREATE OR REPLACE FUNCTION public.sync_upscale_processing_projection(p_job_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_execution public.upscale_executions%ROWTYPE;
  v_status TEXT;
  v_completed_at TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_execution FROM public.upscale_executions WHERE job_id = p_job_id;
  IF NOT FOUND THEN RETURN; END IF;
  v_status := CASE
    WHEN v_execution.stage = 'completed' THEN 'completed'
    WHEN v_execution.stage IN ('failed', 'expired') THEN 'failed'
    WHEN v_execution.stage = 'queued' THEN 'queued'
    ELSE 'processing'
  END;
  v_completed_at := CASE WHEN v_status IN ('completed', 'failed')
    THEN COALESCE(v_execution.completed_at, v_execution.failed_at) ELSE NULL END;
  INSERT INTO public.processing_jobs (
    id, user_id, status, input_image_path, output_image_path, credits_used,
    processing_mode, settings, error_message, created_at, completed_at, updated_at,
    model_id, quality_tier, scale, credits_charged
  ) VALUES (
    v_execution.job_id, v_execution.user_id, v_status, v_execution.input_storage_path,
    v_execution.output_storage_path, CASE WHEN v_status = 'failed' THEN 0 ELSE v_execution.credits_reserved END, 'standard',
    v_execution.config, v_execution.failure_reason, v_execution.created_at, v_completed_at,
    now(), v_execution.resolved_model_id, v_execution.quality_tier, v_execution.scale,
    CASE WHEN v_status = 'completed' THEN v_execution.credits_reserved WHEN v_status = 'failed' THEN 0 ELSE NULL END
  )
  ON CONFLICT (id) DO UPDATE SET
    status = EXCLUDED.status, output_image_path = EXCLUDED.output_image_path, credits_used = EXCLUDED.credits_used,
    error_message = EXCLUDED.error_message, completed_at = EXCLUDED.completed_at,
    updated_at = now(), model_id = EXCLUDED.model_id, quality_tier = EXCLUDED.quality_tier,
    scale = EXCLUDED.scale, credits_charged = EXCLUDED.credits_charged, settings = EXCLUDED.settings;
END;
$$;

CREATE OR REPLACE FUNCTION public.admit_upscale_execution(
  p_user_id UUID, p_job_id UUID, p_request_fingerprint TEXT,
  p_input_storage_path TEXT, p_input_mime_type TEXT, p_input_size_bytes BIGINT,
  p_input_width INTEGER, p_input_height INTEGER, p_quality_tier TEXT, p_scale INTEGER,
  p_config JSONB, p_billing_model_id TEXT, p_resolved_model_id TEXT, p_provider TEXT,
  p_model_version TEXT, p_amount INTEGER, p_batch_limit INTEGER, p_deadline_at TIMESTAMPTZ,
  p_build_id TEXT, p_submission_deadline_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS TABLE(
  result_code TEXT, job_id UUID, stage TEXT, status TEXT, reserved_credits INTEGER,
  credits_remaining INTEGER, retry_after_ms INTEGER, batch_limit INTEGER,
  output_available BOOLEAN, failure_reason TEXT, created_at TIMESTAMPTZ, updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_existing public.upscale_executions%ROWTYPE;
  v_batch RECORD;
  v_credit RECORD;
  v_deadline TIMESTAMPTZ;
  v_submission_deadline TIMESTAMPTZ;
  v_balance INTEGER;
BEGIN
  IF p_user_id IS NULL OR p_job_id IS NULL OR p_request_fingerprint IS NULL
     OR length(trim(p_request_fingerprint)) < 32 OR length(p_request_fingerprint) > 128
     OR p_amount IS NULL OR p_amount <= 0 OR p_batch_limit IS NULL OR p_batch_limit <= 0
     OR p_scale IS NULL OR p_scale NOT IN (2, 4, 8) OR p_provider IS NULL
     OR p_provider NOT IN ('replicate', 'gemini', 'deferred') THEN
    RETURN QUERY SELECT 'invalid_admission', p_job_id, NULL::TEXT, NULL::TEXT, NULL::INTEGER,
      NULL::INTEGER, NULL::INTEGER, p_batch_limit, FALSE, 'invalid_admission', NULL::TIMESTAMPTZ, now();
    RETURN;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_job_id::TEXT, 741239));
  SELECT * INTO v_existing FROM public.upscale_executions AS e WHERE e.job_id = p_job_id FOR UPDATE;
  IF FOUND THEN
    IF v_existing.user_id <> p_user_id THEN
      RETURN QUERY SELECT 'not_found', p_job_id, NULL::TEXT, NULL::TEXT, NULL::INTEGER,
        NULL::INTEGER, NULL::INTEGER, p_batch_limit, FALSE, NULL::TEXT, NULL::TIMESTAMPTZ, now();
      RETURN;
    END IF;
    IF v_existing.request_fingerprint <> p_request_fingerprint THEN
      RETURN QUERY SELECT 'conflict', p_job_id, v_existing.stage, v_existing.stage,
        v_existing.credits_reserved, NULL::INTEGER, 0, v_existing.batch_limit,
        v_existing.output_storage_path IS NOT NULL, v_existing.failure_reason,
        v_existing.created_at, v_existing.updated_at;
      RETURN;
    END IF;
    SELECT COALESCE(pr.subscription_credits_balance, 0) + COALESCE(pr.purchased_credits_balance, 0)
      INTO v_balance FROM public.profiles AS pr WHERE pr.id = p_user_id;
    RETURN QUERY SELECT 'replay', v_existing.job_id, v_existing.stage, v_existing.stage,
      v_existing.credits_reserved, v_balance,
      CASE WHEN v_existing.stage IN ('completed', 'failed', 'expired') THEN 0 ELSE 2000 END,
      v_existing.batch_limit,
      v_existing.output_storage_path IS NOT NULL AND v_existing.stage IN ('ready', 'completed'),
      v_existing.failure_reason, v_existing.created_at, v_existing.updated_at;
    RETURN;
  END IF;

  IF NOT EXISTS(SELECT 1 FROM public.get_upscale_executor_availability() AS readiness WHERE readiness.healthy) THEN
    RETURN QUERY SELECT 'executor_unavailable',p_job_id,NULL::TEXT,NULL::TEXT,NULL::INTEGER,
      NULL::INTEGER,2000,p_batch_limit,FALSE,'executor_unavailable',NULL::TIMESTAMPTZ,now();
    RETURN;
  END IF;
  v_deadline := LEAST(COALESCE(p_deadline_at, now() + interval '15 minutes'), now() + interval '15 minutes');
  v_submission_deadline := COALESCE(p_submission_deadline_at, LEAST(v_deadline, now() + interval '15 seconds'));
  -- Refunds restore the profile before releasing batch capacity. Admission
  -- must use the same order when different jobs share an account.
  PERFORM 1 FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'User not found: %', p_user_id; END IF;
  SELECT * INTO v_batch FROM public.check_and_increment_batch_limit(p_user_id, p_batch_limit, 1);
  IF NOT COALESCE(v_batch.allowed, FALSE) THEN
    RETURN QUERY SELECT 'batch_limit', p_job_id, NULL::TEXT, NULL::TEXT, NULL::INTEGER,
      NULL::INTEGER, 0, p_batch_limit, FALSE,
      format('batch_limit:%s:%s:%s', v_batch.current_count, p_batch_limit, v_batch.reset_at),
      NULL::TIMESTAMPTZ, now();
    RETURN;
  END IF;
  SELECT * INTO v_credit FROM public.consume_credits_v3(
    p_user_id, p_amount, p_job_id, 'Durable upscale execution'
  );
  IF NOT EXISTS (
    SELECT 1 FROM public.processing_credit_reservations AS r
    WHERE r.job_id = p_job_id AND r.user_id = p_user_id AND r.status = 'processing'
  ) THEN
    RAISE EXCEPTION 'Durable reservation was not created: %', p_job_id;
  END IF;
  UPDATE public.processing_credit_reservations AS r
  SET protocol_version = 'v2', updated_at = now()
  WHERE r.job_id = p_job_id AND r.user_id = p_user_id;
  INSERT INTO public.upscale_executions (
    job_id, user_id, request_fingerprint, config, selection_mode, input_storage_path,
    input_mime_type, input_size_bytes, input_width, input_height, quality_tier, scale,
    billing_model_id, resolved_model_id, provider, model_version, credits_reserved,
    batch_limit, stage, retryable, deadline_at, submission_deadline_at, next_action,
    next_action_at, build_id
  ) VALUES (
    p_job_id, p_user_id, p_request_fingerprint, COALESCE(p_config, '{}'::JSONB),
    CASE WHEN lower(COALESCE(p_quality_tier, '')) = 'auto' THEN 'auto' ELSE 'explicit' END,
    p_input_storage_path, p_input_mime_type, p_input_size_bytes, p_input_width, p_input_height,
    p_quality_tier, p_scale, p_billing_model_id, p_resolved_model_id, p_provider, p_model_version,
    p_amount, p_batch_limit, 'queued', FALSE, v_deadline, v_submission_deadline, 'advance', now(), p_build_id
  );
  INSERT INTO public.upscale_outbox (job_id, action, generation, payload, due_at)
  VALUES (p_job_id, 'advance', 0,
    jsonb_build_object('jobId', p_job_id, 'action', 'advance', 'generation', 0), now());
  PERFORM public.sync_upscale_processing_projection(p_job_id);
  RETURN QUERY SELECT 'admitted', p_job_id, 'queued', 'queued', p_amount,
    v_credit.new_total_balance, 2000, p_batch_limit, FALSE, NULL::TEXT, now(), now();
END;
$$;

-- V2 refunds are only reachable from the execution state machine. Keeping the
-- accounting operation separate prevents a legacy caller from refunding a
-- committed durable job by age or by a Worker-tail observation.
CREATE OR REPLACE FUNCTION public.refund_v2_processing_credit_reservation(
  p_user_id UUID, p_job_id UUID, p_failure_reason TEXT DEFAULT 'processing_failed'
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_job_id::TEXT, 741239));
  PERFORM 1 FROM public.upscale_executions WHERE job_id=p_job_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  RETURN public.settle_upscale_execution_failure(p_job_id, p_failure_reason, FALSE);
END;
$$;

-- Preserve the legacy API for v1 callers, but make an accidental v2 call a
-- no-op. V2 callers must use the execution-aware helper above.
CREATE OR REPLACE FUNCTION public.refund_processing_credit_reservation(
  p_user_id UUID,
  p_job_id UUID,
  p_failure_reason TEXT DEFAULT 'processing_failed'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reservation public.processing_credit_reservations%ROWTYPE;
  v_refund_transaction_id UUID;
BEGIN
  SELECT * INTO v_reservation
  FROM public.processing_credit_reservations
  WHERE job_id = p_job_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Reservation not found: %', p_job_id; END IF;
  IF v_reservation.protocol_version = 'v2' THEN RETURN FALSE; END IF;
  IF v_reservation.status = 'refunded' THEN RETURN TRUE; END IF;
  IF v_reservation.status <> 'processing' THEN RETURN FALSE; END IF;

  PERFORM 1 FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'User not found: %', p_user_id; END IF;
  PERFORM set_config('app.trusted_credit_operation', 'true', true);

  UPDATE public.profiles
  SET subscription_credits_balance = subscription_credits_balance + v_reservation.consumed_subscription,
      purchased_credits_balance = purchased_credits_balance + v_reservation.consumed_purchased,
      updated_at = now()
  WHERE id = p_user_id;

  INSERT INTO public.credit_transactions (user_id, amount, type, reference_id, description)
  VALUES (
    p_user_id,
    v_reservation.amount,
    'refund',
    'reservation_refund_' || p_job_id::TEXT,
    'Automatic processing refund: ' || COALESCE(p_failure_reason, 'processing_failed') ||
      format(' (sub: %s, purchased: %s)',
        v_reservation.consumed_subscription, v_reservation.consumed_purchased)
  )
  RETURNING id INTO v_refund_transaction_id;

  UPDATE public.processing_credit_reservations
  SET status = 'refunded',
      refund_transaction_id = v_refund_transaction_id,
      failure_reason = left(COALESCE(p_failure_reason, 'processing_failed'), 500),
      refunded_at = now(),
      updated_at = now()
  WHERE job_id = p_job_id AND user_id = p_user_id AND status = 'processing';

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_upscale_attempt(
  p_job_id UUID, p_provider TEXT, p_model_id TEXT, p_model_version TEXT,
  p_callback_correlation TEXT
)
RETURNS TABLE(attempt_id UUID, ordinal INTEGER, callback_correlation TEXT, submission_state TEXT, may_create BOOLEAN)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_attempt public.upscale_attempts%ROWTYPE; v_execution public.upscale_executions%ROWTYPE; v_generation BIGINT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_job_id::TEXT, 741239));
  SELECT * INTO v_execution FROM public.upscale_executions WHERE job_id=p_job_id FOR UPDATE;
  IF NOT FOUND OR v_execution.stage IN ('staging','ready','completed','failed','expired')
    OR v_execution.deadline_at <= now() THEN RETURN; END IF;
  SELECT * INTO v_attempt FROM public.upscale_attempts AS a WHERE a.job_id=p_job_id
    ORDER BY a.ordinal DESC LIMIT 1;
  IF FOUND THEN
    RETURN QUERY SELECT v_attempt.attempt_id,v_attempt.ordinal,v_attempt.callback_correlation,v_attempt.submission_state,FALSE;
    RETURN;
  END IF;
  IF v_execution.stage <> 'queued' OR v_execution.provider IS DISTINCT FROM p_provider
    OR v_execution.resolved_model_id IS DISTINCT FROM p_model_id
    OR v_execution.model_version IS DISTINCT FROM p_model_version
    OR p_callback_correlation IS NULL OR length(p_callback_correlation)<16 THEN RETURN; END IF;
  INSERT INTO public.upscale_attempts(job_id,ordinal,provider,model_id,model_version,callback_correlation,submission_state,create_started_at)
  VALUES(p_job_id,1,p_provider,p_model_id,p_model_version,p_callback_correlation,'creating',now()) RETURNING * INTO v_attempt;
  UPDATE public.upscale_executions SET stage='submitting', started_at=COALESCE(started_at,now()),
    submission_deadline_at=LEAST(deadline_at,now()+interval '15 seconds'), next_action='reconcile',
    next_action_at=LEAST(deadline_at,now()+interval '15 seconds'), lease_generation=lease_generation+1, updated_at=now()
    WHERE job_id=p_job_id RETURNING lease_generation INTO v_generation;
  INSERT INTO public.upscale_outbox(job_id,action,generation,due_at)
    VALUES(p_job_id,'reconcile',v_generation,LEAST(v_execution.deadline_at,now()+interval '15 seconds'));
  PERFORM public.sync_upscale_processing_projection(p_job_id);
  RETURN QUERY SELECT v_attempt.attempt_id,v_attempt.ordinal,v_attempt.callback_correlation,v_attempt.submission_state,TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.bind_upscale_prediction(
  p_job_id UUID,p_attempt_id UUID,p_prediction_id TEXT,
  p_provider_status TEXT DEFAULT 'starting',p_next_poll_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_execution public.upscale_executions%ROWTYPE; v_attempt public.upscale_attempts%ROWTYPE;
  v_generation BIGINT; v_due TIMESTAMPTZ := COALESCE(p_next_poll_at,now()+interval '5 seconds');
BEGIN
  IF p_prediction_id IS NULL OR length(trim(p_prediction_id))=0 THEN RETURN FALSE; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_job_id::TEXT,741239));
  SELECT * INTO v_execution FROM public.upscale_executions WHERE job_id=p_job_id FOR UPDATE;
  IF NOT FOUND OR v_execution.stage NOT IN ('submitting','submission_unknown','processing') OR v_execution.deadline_at<=now() THEN RETURN FALSE; END IF;
  SELECT * INTO v_attempt FROM public.upscale_attempts WHERE attempt_id=p_attempt_id AND job_id=p_job_id FOR UPDATE;
  IF NOT FOUND OR v_attempt.submission_state='terminal' THEN RETURN FALSE; END IF;
  IF v_attempt.provider_prediction_id IS NOT NULL THEN RETURN v_attempt.provider_prediction_id=p_prediction_id; END IF;
  UPDATE public.upscale_attempts SET provider_prediction_id=p_prediction_id,
    provider_status=left(COALESCE(p_provider_status,'starting'),100), submission_state='bound',
    provider_accepted_at=now(),next_poll_at=v_due,updated_at=now() WHERE attempt_id=p_attempt_id;
  UPDATE public.upscale_executions SET stage='processing',next_action='poll',next_action_at=v_due,
    lease_generation=lease_generation+1,updated_at=now() WHERE job_id=p_job_id RETURNING lease_generation INTO v_generation;
  INSERT INTO public.upscale_outbox(job_id,action,generation,due_at) VALUES(p_job_id,'poll',v_generation,v_due);
  PERFORM public.sync_upscale_processing_projection(p_job_id);
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_upscale_submission_unknown(
  p_job_id UUID,p_attempt_id UUID,p_failure_reason TEXT DEFAULT 'provider_create_timeout'
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_execution public.upscale_executions%ROWTYPE; v_generation BIGINT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_job_id::TEXT,741239));
  SELECT * INTO v_execution FROM public.upscale_executions WHERE job_id=p_job_id FOR UPDATE;
  IF NOT FOUND OR v_execution.stage NOT IN ('submitting','submission_unknown') THEN RETURN FALSE; END IF;
  IF v_execution.stage='submission_unknown' THEN RETURN TRUE; END IF;
  UPDATE public.upscale_attempts SET submission_state='unknown',
    failure_reason=left(COALESCE(p_failure_reason,'provider_create_timeout'),500),updated_at=now()
    WHERE attempt_id=p_attempt_id AND job_id=p_job_id AND provider_prediction_id IS NULL
      AND submission_state IN ('persisted','creating');
  IF NOT FOUND THEN RETURN FALSE; END IF;
  UPDATE public.upscale_executions SET stage='submission_unknown',next_action='reconcile',
    next_action_at=now()+interval '5 seconds',lease_generation=lease_generation+1,updated_at=now()
    WHERE job_id=p_job_id RETURNING lease_generation INTO v_generation;
  INSERT INTO public.upscale_outbox(job_id,action,generation,due_at)
    VALUES(p_job_id,'reconcile',v_generation,now()+interval '5 seconds');
  PERFORM public.sync_upscale_processing_projection(p_job_id);
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_upscale_execution_failure(
  p_job_id UUID, p_failure_reason TEXT, p_expire BOOLEAN DEFAULT FALSE
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE
  v_execution public.upscale_executions%ROWTYPE;
  v_reservation public.processing_credit_reservations%ROWTYPE;
  v_refund_transaction_id UUID;
  p_user_id UUID;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_job_id::TEXT, 741239));
  SELECT * INTO v_execution FROM public.upscale_executions WHERE job_id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF v_execution.stage = 'completed' THEN RETURN FALSE; END IF;
  IF v_execution.stage IN ('failed', 'expired') THEN RETURN TRUE; END IF;
  IF p_expire AND v_execution.stage <> 'ready' AND v_execution.deadline_at > now() THEN RETURN FALSE; END IF;
  -- A ready output may be past its nominal retention time while a client is
  -- still streaming it.  The delivery lease is the settlement/cleanup guard;
  -- never refund or delete the output until that lease has expired.
  IF v_execution.stage = 'ready' AND (
    NOT p_expire OR v_execution.output_expires_at IS NULL OR v_execution.output_expires_at > now()
    OR v_execution.delivery_lease_expires_at > now()
  ) THEN RETURN FALSE; END IF;
  p_user_id := v_execution.user_id;
  SELECT * INTO v_reservation
  FROM public.processing_credit_reservations
  WHERE job_id = p_job_id AND user_id = p_user_id AND protocol_version = 'v2'
  FOR UPDATE;

  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF v_reservation.status = 'refunded' THEN RETURN FALSE; END IF;
  IF v_reservation.status <> 'processing' THEN RETURN FALSE; END IF;

  PERFORM 1 FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'User not found: %', p_user_id; END IF;
  PERFORM set_config('app.trusted_credit_operation', 'true', true);

  UPDATE public.profiles
  SET subscription_credits_balance = subscription_credits_balance + v_reservation.consumed_subscription,
      purchased_credits_balance = purchased_credits_balance + v_reservation.consumed_purchased,
      updated_at = now()
  WHERE id = p_user_id;

  INSERT INTO public.credit_transactions (user_id, amount, type, reference_id, description)
  VALUES (
    p_user_id,
    v_reservation.amount,
    'refund',
    'reservation_refund_' || p_job_id::TEXT,
    'Automatic durable processing refund: ' || COALESCE(p_failure_reason, 'processing_failed') ||
      format(' (sub: %s, purchased: %s)',
        v_reservation.consumed_subscription, v_reservation.consumed_purchased)
  )
  RETURNING id INTO v_refund_transaction_id;

  UPDATE public.processing_credit_reservations
  SET status = 'refunded',
      refund_transaction_id = v_refund_transaction_id,
      failure_reason = left(COALESCE(p_failure_reason, 'processing_failed'), 500),
      refunded_at = now(),
      updated_at = now()
  WHERE job_id = p_job_id AND user_id = p_user_id
    AND protocol_version = 'v2' AND status = 'processing';

  UPDATE public.upscale_executions SET
    stage = CASE WHEN p_expire THEN 'expired' ELSE 'failed' END, retryable = TRUE,
    failure_reason = left(COALESCE(p_failure_reason, 'processing_failed'), 500),
    failed_at = COALESCE(failed_at, now()), refunded_at = COALESCE(refunded_at, now()),
    next_action = NULL, next_action_at = NULL, delivery_token_hash = NULL,
    delivery_token_hash_history = ARRAY[]::TEXT[],
    delivery_lease_expires_at = NULL, delivery_lease_token_hash = NULL, updated_at = now()
  WHERE job_id = p_job_id;
  IF NOT v_execution.batch_slot_released THEN
    UPDATE public.batch_usage SET count = GREATEST(0, count - 1), updated_at = now()
      WHERE user_id = v_execution.user_id AND window_start = date_trunc('hour', v_execution.created_at);
    UPDATE public.upscale_executions SET batch_slot_released = TRUE WHERE job_id = p_job_id;
  END IF;
  PERFORM public.sync_upscale_processing_projection(p_job_id);
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_upscale_provider_terminal(
  p_job_id UUID, p_attempt_id UUID, p_provider_status TEXT,
  p_output_url TEXT DEFAULT NULL, p_output_mime_type TEXT DEFAULT NULL,
  p_output_expires_at TIMESTAMPTZ DEFAULT NULL, p_failure_reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_execution public.upscale_executions%ROWTYPE; v_generation BIGINT; v_status TEXT := lower(COALESCE(p_provider_status, 'failed'));
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_job_id::TEXT, 741239));
  SELECT * INTO v_execution FROM public.upscale_executions WHERE job_id = p_job_id FOR UPDATE;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF v_execution.stage IN ('completed', 'failed', 'expired') THEN
    RETURN v_execution.stage = 'completed' AND v_status IN ('succeeded', 'success', 'completed');
  END IF;
  IF v_status NOT IN ('succeeded','success','completed','failed','canceled','cancelled') THEN RETURN FALSE; END IF;
  PERFORM 1 FROM public.upscale_attempts WHERE attempt_id=p_attempt_id AND job_id=p_job_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF v_execution.stage NOT IN ('staging','ready') AND v_execution.deadline_at<=now() THEN RETURN FALSE; END IF;
  -- Provider callbacks are at-least-once. Once the provider result has already
  -- entered staging or the output is ready, a duplicate callback must not move
  -- the execution backwards and recreate a staging task.
  IF v_execution.stage IN ('staging', 'ready') THEN
    RETURN TRUE;
  END IF;
  UPDATE public.upscale_attempts SET submission_state = 'terminal', provider_status = left(v_status, 100),
    provider_output_url = p_output_url, provider_output_mime_type = p_output_mime_type,
    provider_output_expires_at = p_output_expires_at, failure_reason = left(p_failure_reason, 500),
    terminal_at = COALESCE(terminal_at, now()), updated_at = now()
  WHERE attempt_id = p_attempt_id AND job_id = p_job_id;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF v_status IN ('succeeded', 'success', 'completed') AND p_output_url IS NOT NULL THEN
    UPDATE public.upscale_executions SET stage = 'staging', next_action = 'stage', next_action_at = now(),
      lease_generation = lease_generation + 1, started_at = COALESCE(started_at, now()), updated_at = now()
    WHERE job_id = p_job_id RETURNING lease_generation INTO v_generation;
    INSERT INTO public.upscale_outbox (job_id, action, generation, payload, due_at)
    VALUES (p_job_id, 'stage', v_generation,
      jsonb_build_object('jobId', p_job_id, 'action', 'stage', 'generation', v_generation), now())
    ON CONFLICT (job_id, action, generation) DO NOTHING;
    IF NOT v_execution.batch_slot_released THEN
      UPDATE public.batch_usage SET count = GREATEST(0, count - 1), updated_at = now()
      WHERE user_id = v_execution.user_id AND window_start = date_trunc('hour', v_execution.created_at);
      UPDATE public.upscale_executions SET batch_slot_released = TRUE WHERE job_id = p_job_id;
    END IF;
    PERFORM public.sync_upscale_processing_projection(p_job_id);
    RETURN TRUE;
  END IF;
  RETURN public.settle_upscale_execution_failure(p_job_id, COALESCE(p_failure_reason, 'provider_' || v_status), FALSE);
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_upscale_ready(
  p_job_id UUID, p_storage_path TEXT, p_output_mime_type TEXT, p_output_size_bytes BIGINT,
  p_output_expires_at TIMESTAMPTZ, p_delivery_token_hash TEXT,
  p_output_width INTEGER DEFAULT NULL, p_output_height INTEGER DEFAULT NULL
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_execution public.upscale_executions%ROWTYPE; v_extension TEXT; v_generation BIGINT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_job_id::TEXT, 741239));
  SELECT * INTO v_execution FROM public.upscale_executions WHERE job_id = p_job_id FOR UPDATE;
  IF NOT FOUND OR v_execution.stage IN ('failed', 'expired') THEN RETURN FALSE; END IF;
  v_extension := CASE lower(COALESCE(p_output_mime_type, ''))
    WHEN 'image/png' THEN 'png' WHEN 'image/webp' THEN 'webp' WHEN 'image/heic' THEN 'heic' ELSE 'jpg' END;
  IF p_storage_path IS NULL OR NOT EXISTS (SELECT 1 FROM public.upscale_attempts a WHERE a.job_id=p_job_id
       AND a.submission_state='terminal' AND a.provider_status IN ('succeeded','success','completed')
       AND p_storage_path=v_execution.user_id::TEXT || '/outputs/' || p_job_id::TEXT || '/' || a.attempt_id::TEXT || '.' || v_extension)
     OR p_output_size_bytes IS NULL OR p_output_size_bytes <= 0 OR p_output_size_bytes > 134217728
     OR p_output_width IS NOT NULL AND p_output_width<=0 OR p_output_height IS NOT NULL AND p_output_height<=0
     OR lower(COALESCE(p_output_mime_type, '')) NOT IN ('image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/heic')
     OR p_output_expires_at IS NULL OR p_output_expires_at <= now()
     OR length(COALESCE(p_delivery_token_hash, '')) <> 64
     OR p_delivery_token_hash !~ '^[0-9a-f]{64}$' THEN RETURN FALSE; END IF;
  IF v_execution.stage IN ('ready', 'completed') THEN
    RETURN v_execution.output_storage_path = p_storage_path AND v_execution.output_size_bytes = p_output_size_bytes;
  END IF;
  IF v_execution.stage <> 'staging' OR v_execution.deadline_at<=now() THEN RETURN FALSE; END IF;
  PERFORM 1 FROM public.processing_credit_reservations
  WHERE job_id = p_job_id AND user_id = v_execution.user_id
    AND protocol_version = 'v2' AND status = 'processing' FOR UPDATE;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  UPDATE public.upscale_executions SET stage = 'ready', retryable = FALSE,
    output_storage_path = p_storage_path,
    output_mime_type = CASE WHEN lower(p_output_mime_type) = 'image/jpg' THEN 'image/jpeg' ELSE lower(p_output_mime_type) END,
    output_size_bytes = p_output_size_bytes, output_expires_at = p_output_expires_at,
    output_width=p_output_width,output_height=p_output_height,
    delivery_token_hash = p_delivery_token_hash,
    delivery_token_hash_history = ARRAY[p_delivery_token_hash],
    delivery_lease_expires_at = NULL, delivery_lease_token_hash = NULL,
    ready_at = COALESCE(ready_at, now()), next_action = 'expire_output', next_action_at = p_output_expires_at,
    lease_generation = lease_generation + 1, updated_at = now()
  WHERE job_id = p_job_id
  RETURNING lease_generation INTO v_generation;
  INSERT INTO public.upscale_delivery_capabilities(job_id,token_hash,expires_at)
  VALUES(p_job_id,p_delivery_token_hash,LEAST(p_output_expires_at,now()+interval '5 minutes'));
  INSERT INTO public.upscale_outbox (job_id, action, generation, payload, due_at)
  VALUES (p_job_id, 'expire_output', v_generation,
    jsonb_build_object('jobId', p_job_id, 'action', 'expire_output', 'generation', v_generation),
    p_output_expires_at)
  ON CONFLICT (job_id, action, generation) DO NOTHING;
  PERFORM public.sync_upscale_processing_projection(p_job_id);
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.issue_upscale_delivery_capability(
  p_user_id UUID, p_job_id UUID, p_delivery_token_hash TEXT
)
RETURNS TABLE(output_storage_path TEXT, output_mime_type TEXT, output_size_bytes BIGINT, output_expires_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_job_id::TEXT,741239));
  IF p_delivery_token_hash IS NULL OR length(p_delivery_token_hash) <> 64
     OR p_delivery_token_hash !~ '^[0-9a-f]{64}$' THEN RETURN; END IF;
  UPDATE public.upscale_executions SET delivery_token_hash = p_delivery_token_hash,
    delivery_token_hash_history = (
      SELECT array_agg(value ORDER BY ord)
      FROM (
        SELECT value, ord
        FROM unnest(
          ARRAY[p_delivery_token_hash] ||
          CASE WHEN delivery_lease_expires_at>now() AND delivery_lease_token_hash IS NOT NULL
            THEN ARRAY[delivery_lease_token_hash] ELSE ARRAY[]::TEXT[] END ||
          COALESCE(delivery_token_hash_history, ARRAY[]::TEXT[]) ||
          CASE WHEN delivery_token_hash IS NULL THEN ARRAY[]::TEXT[] ELSE ARRAY[delivery_token_hash] END
        ) WITH ORDINALITY AS entries(value, ord)
        WHERE value IS NOT NULL
        ORDER BY ord
        LIMIT 5
      ) AS bounded
    ),
    delivery_attempted_at = now(), updated_at = now()
  WHERE job_id = p_job_id AND user_id = p_user_id AND stage IN ('ready', 'completed')
    AND EXISTS (SELECT 1 FROM public.processing_credit_reservations r WHERE r.job_id=p_job_id
      AND r.user_id=p_user_id AND r.protocol_version='v2' AND r.status IN ('processing','completed'))
    AND upscale_executions.output_storage_path IS NOT NULL AND upscale_executions.output_expires_at > now()
  RETURNING upscale_executions.output_storage_path, upscale_executions.output_mime_type,
    upscale_executions.output_size_bytes, upscale_executions.output_expires_at
  INTO output_storage_path, output_mime_type, output_size_bytes, output_expires_at;
  IF NOT FOUND THEN RETURN; END IF;
  DELETE FROM public.upscale_delivery_capabilities AS c WHERE c.job_id=p_job_id AND c.expires_at<=now();
  INSERT INTO public.upscale_delivery_capabilities(job_id,token_hash,expires_at)
    VALUES(p_job_id,p_delivery_token_hash,LEAST(output_expires_at,now()+interval '5 minutes'))
    ON CONFLICT(job_id,token_hash) DO NOTHING;
  DELETE FROM public.upscale_delivery_capabilities AS c
    WHERE c.job_id=p_job_id AND c.token_hash IN (
      SELECT old.token_hash FROM public.upscale_delivery_capabilities old WHERE old.job_id=p_job_id
      ORDER BY (old.token_hash=p_delivery_token_hash) DESC,old.created_at DESC,old.token_hash
      OFFSET 5
    );
  RETURN NEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.acquire_upscale_delivery_lease(
  p_user_id UUID, p_job_id UUID, p_delivery_token_hash TEXT, p_lease_seconds INTEGER DEFAULT 120
)
RETURNS TABLE(output_storage_path TEXT, output_mime_type TEXT, output_size_bytes BIGINT,
  output_expires_at TIMESTAMPTZ, delivery_lease_expires_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_until TIMESTAMPTZ := now() + make_interval(secs => LEAST(GREATEST(p_lease_seconds, 1), 120));
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_job_id::TEXT,741239));
  IF p_delivery_token_hash IS NULL OR length(p_delivery_token_hash) <> 64
     OR p_delivery_token_hash !~ '^[0-9a-f]{64}$' THEN RETURN; END IF;
  UPDATE public.upscale_executions SET delivery_lease_expires_at = v_until,
    delivery_lease_token_hash = p_delivery_token_hash,
    delivery_lease_generation = delivery_lease_generation + 1, delivery_attempted_at = now(), updated_at = now()
  WHERE job_id = p_job_id AND user_id = p_user_id AND stage IN ('ready', 'completed')
    AND EXISTS(SELECT 1 FROM public.upscale_delivery_capabilities c
      WHERE c.job_id=p_job_id AND c.token_hash=p_delivery_token_hash AND c.expires_at>now())
    AND EXISTS (SELECT 1 FROM public.processing_credit_reservations r WHERE r.job_id=p_job_id
      AND r.user_id=p_user_id AND r.protocol_version='v2' AND r.status IN ('processing','completed'))
    AND upscale_executions.output_storage_path IS NOT NULL AND upscale_executions.output_expires_at > now()
    AND (upscale_executions.delivery_lease_expires_at IS NULL OR upscale_executions.delivery_lease_expires_at <= now()
      )
  RETURNING upscale_executions.output_storage_path, upscale_executions.output_mime_type,
    upscale_executions.output_size_bytes, upscale_executions.output_expires_at,
    upscale_executions.delivery_lease_expires_at
  INTO output_storage_path, output_mime_type, output_size_bytes, output_expires_at, delivery_lease_expires_at;
  IF FOUND THEN RETURN NEXT; END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.renew_upscale_delivery_lease(
  p_user_id UUID, p_job_id UUID, p_delivery_token_hash TEXT, p_lease_seconds INTEGER DEFAULT 120
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_job_id::TEXT,741239));
  IF p_delivery_token_hash IS NULL OR length(p_delivery_token_hash) <> 64
     OR p_delivery_token_hash !~ '^[0-9a-f]{64}$' THEN RETURN FALSE; END IF;
  UPDATE public.upscale_executions SET delivery_lease_expires_at = now() + make_interval(secs => LEAST(GREATEST(p_lease_seconds, 1), 120)),
    delivery_lease_generation = delivery_lease_generation + 1, updated_at = now()
  WHERE job_id = p_job_id AND user_id = p_user_id AND stage IN ('ready', 'completed')
    AND delivery_lease_token_hash = p_delivery_token_hash
    AND delivery_lease_expires_at > now();
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_upscale_delivery_lease(
  p_user_id UUID, p_job_id UUID, p_delivery_token_hash TEXT
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_job_id::TEXT,741239));
  UPDATE public.upscale_executions SET delivery_lease_expires_at = NULL,
    delivery_lease_token_hash = NULL, updated_at = now()
  WHERE job_id = p_job_id AND user_id = p_user_id
    -- A rotated/stale capability may be valid for reading, but it must not be
    -- able to release a newer tab's active lease.
    AND delivery_lease_token_hash = p_delivery_token_hash;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.acknowledge_upscale_execution(
  p_user_id UUID, p_job_id UUID, p_output_storage_path TEXT, p_output_mime_type TEXT,
  p_delivery_token_hash TEXT
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_execution public.upscale_executions%ROWTYPE; v_updated INTEGER;
BEGIN
  IF p_delivery_token_hash IS NULL OR length(p_delivery_token_hash) <> 64
     OR p_delivery_token_hash !~ '^[0-9a-f]{64}$' THEN RETURN FALSE; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_job_id::TEXT, 741239));
  SELECT * INTO v_execution FROM public.upscale_executions WHERE job_id = p_job_id AND user_id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF v_execution.stage = 'completed' THEN
    IF v_execution.output_storage_path IS DISTINCT FROM p_output_storage_path
      OR v_execution.output_mime_type IS DISTINCT FROM p_output_mime_type THEN RETURN FALSE; END IF;
    IF v_execution.delivery_lease_token_hash=p_delivery_token_hash AND v_execution.delivery_lease_expires_at>now() THEN
      UPDATE public.upscale_executions SET delivery_lease_token_hash=NULL,delivery_lease_expires_at=NULL,updated_at=now()
        WHERE job_id=p_job_id;
      RETURN TRUE;
    END IF;
    RETURN v_execution.output_storage_path = p_output_storage_path
      AND v_execution.output_mime_type IS NOT DISTINCT FROM p_output_mime_type
      AND (v_execution.acknowledged_delivery_token_hash = p_delivery_token_hash
        OR v_execution.delivery_token_hash = p_delivery_token_hash
        OR p_delivery_token_hash = ANY(v_execution.delivery_token_hash_history));
  END IF;
  IF v_execution.stage <> 'ready' OR v_execution.output_storage_path IS DISTINCT FROM p_output_storage_path
     OR v_execution.output_mime_type IS DISTINCT FROM p_output_mime_type
     OR v_execution.delivery_lease_token_hash IS DISTINCT FROM p_delivery_token_hash
     OR v_execution.delivery_lease_expires_at IS NULL OR v_execution.delivery_lease_expires_at <= now() THEN RETURN FALSE; END IF;
  UPDATE public.processing_credit_reservations SET status = 'completed', output_url = p_output_storage_path,
    output_mime_type = p_output_mime_type, output_expires_at = v_execution.output_expires_at,
    completed_at = COALESCE(completed_at, now()), acknowledged_at = COALESCE(acknowledged_at, now()), updated_at = now()
  WHERE job_id = p_job_id AND user_id = p_user_id AND status = 'processing';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN RETURN FALSE; END IF;
  UPDATE public.upscale_executions SET stage = 'completed', completed_at = COALESCE(completed_at, now()),
    acknowledged_at = COALESCE(acknowledged_at, now()), next_action=NULL,next_action_at=NULL,
    acknowledged_delivery_token_hash=p_delivery_token_hash,
    delivery_lease_expires_at = NULL,
    delivery_lease_token_hash = NULL, updated_at = now()
  WHERE job_id = p_job_id AND stage = 'ready';
  PERFORM public.sync_upscale_processing_projection(p_job_id);
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_upscale_outbox(
  p_limit INTEGER DEFAULT 50,p_claimant TEXT DEFAULT NULL,p_claim_seconds INTEGER DEFAULT 120
)
RETURNS TABLE(id BIGINT,job_id UUID,action TEXT,generation BIGINT,payload JSONB)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_row RECORD;
BEGIN
  IF p_claimant IS NULL OR length(trim(p_claimant))=0 THEN RETURN; END IF;
  FOR v_row IN
    SELECT o.id FROM public.upscale_outbox o JOIN public.upscale_executions e ON e.job_id=o.job_id
    WHERE o.published_at IS NULL AND o.due_at<=now()
      AND (o.claim_expires_at IS NULL OR o.claim_expires_at<=now())
      AND e.stage NOT IN ('completed','failed','expired') AND e.lease_generation=o.generation AND e.next_action=o.action
    ORDER BY o.due_at,o.id LIMIT LEAST(GREATEST(p_limit,1),50) FOR UPDATE OF o SKIP LOCKED
  LOOP
    UPDATE public.upscale_outbox SET claimed_at=now(),
      claim_expires_at=now()+make_interval(secs=>LEAST(GREATEST(p_claim_seconds,1),120)),
      claimed_by=p_claimant,attempt_count=attempt_count+1 WHERE upscale_outbox.id=v_row.id
    RETURNING upscale_outbox.id,upscale_outbox.job_id,upscale_outbox.action,upscale_outbox.generation,
      upscale_outbox.payload INTO id,job_id,action,generation,payload;
    RETURN NEXT;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.ack_upscale_outbox(p_id BIGINT, p_claimant TEXT DEFAULT NULL)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.upscale_outbox SET published_at = COALESCE(published_at, now()),
    claimed_at = NULL, claim_expires_at = NULL, claimed_by = NULL
  WHERE id = p_id AND published_at IS NULL
    AND p_claimant IS NOT NULL AND claimed_by=p_claimant AND claim_expires_at>now();
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.retry_upscale_outbox(p_id BIGINT,p_error TEXT,p_due_at TIMESTAMPTZ,p_claimant TEXT DEFAULT NULL)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  UPDATE public.upscale_outbox SET due_at=COALESCE(p_due_at,now()+interval '5 seconds'),
    last_error=left(COALESCE(p_error,'executor_retry'),500),claimed_at=NULL,claim_expires_at=NULL,claimed_by=NULL
    WHERE id=p_id AND published_at IS NULL AND p_claimant IS NOT NULL
      AND claimed_by=p_claimant AND claim_expires_at>now();
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.schedule_upscale_action(
  p_job_id UUID,p_action TEXT,p_due_at TIMESTAMPTZ,p_expected_generation BIGINT DEFAULT NULL
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_execution public.upscale_executions%ROWTYPE; v_generation BIGINT;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_job_id::TEXT,741239));
  SELECT * INTO v_execution FROM public.upscale_executions WHERE job_id=p_job_id FOR UPDATE;
  IF NOT FOUND OR (p_expected_generation IS NOT NULL AND v_execution.lease_generation<>p_expected_generation) THEN RETURN FALSE; END IF;
  IF NOT COALESCE((v_execution.stage='queued' AND p_action='advance')
    OR (v_execution.stage IN ('submitting','submission_unknown') AND p_action='reconcile')
    OR (v_execution.stage='processing' AND p_action IN ('poll','reconcile'))
    OR (v_execution.stage='staging' AND p_action='stage')
    OR (v_execution.stage='ready' AND p_action='expire_output'),FALSE) THEN RETURN FALSE; END IF;
  v_generation:=v_execution.lease_generation+1;
  UPDATE public.upscale_executions SET lease_generation=v_generation,next_action=p_action,
    next_action_at=COALESCE(p_due_at,now()),updated_at=now() WHERE job_id=p_job_id;
  IF p_action='poll' THEN
    UPDATE public.upscale_attempts SET poll_count=poll_count+1,next_poll_at=p_due_at
      WHERE job_id=p_job_id AND submission_state IN ('bound','processing');
  END IF;
  INSERT INTO public.upscale_outbox(job_id,action,generation,payload,due_at)
  VALUES(p_job_id,p_action,v_generation,jsonb_build_object('jobId',p_job_id,'action',p_action,'generation',v_generation),COALESCE(p_due_at,now()));
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_upscale_deadlines(p_limit INTEGER DEFAULT 100)
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_row RECORD; v_execution public.upscale_executions%ROWTYPE; v_attempt_id UUID; v_count INTEGER:=0;
BEGIN
  FOR v_row IN SELECT job_id FROM public.upscale_executions
    WHERE (stage IN ('queued','submitting','submission_unknown','processing','staging')
      AND (deadline_at<=now() OR next_action_at<now()-interval '120 seconds'
        OR stage='submitting' AND submission_deadline_at<=now()))
      OR (stage='ready' AND output_expires_at<=now()
        AND (delivery_lease_expires_at IS NULL OR delivery_lease_expires_at<=now()))
    ORDER BY COALESCE(output_expires_at,deadline_at) LIMIT LEAST(GREATEST(p_limit,1),500)
  LOOP
    IF NOT pg_try_advisory_xact_lock(hashtextextended(v_row.job_id::TEXT,741239)) THEN CONTINUE; END IF;
    SELECT * INTO v_execution FROM public.upscale_executions WHERE job_id=v_row.job_id FOR UPDATE;
    IF v_execution.stage='ready' OR v_execution.deadline_at<=now() THEN
      IF public.settle_upscale_execution_failure(v_row.job_id,
        CASE WHEN v_execution.stage='ready' THEN 'durable_output_expired' ELSE 'durable_execution_deadline_exceeded' END,TRUE)
        THEN v_count:=v_count+1; END IF;
    ELSIF v_execution.stage='submitting' AND v_execution.submission_deadline_at<=now() THEN
      SELECT attempt_id INTO v_attempt_id FROM public.upscale_attempts
        WHERE job_id=v_row.job_id AND provider_prediction_id IS NULL ORDER BY ordinal DESC LIMIT 1;
      PERFORM public.mark_upscale_submission_unknown(v_row.job_id,v_attempt_id,'submission_lease_expired');
    ELSE
      PERFORM public.request_upscale_recovery(v_row.job_id);
    END IF;
  END LOOP;
  RETURN v_count;
END;
$$;

-- Legacy cleanup remains responsible for v1 reservations only. Durable jobs
-- must be reconciled from their execution deadline/state machine, otherwise an
-- age-based cleanup can refund work that is still recoverable by the executor.
CREATE OR REPLACE FUNCTION public.reconcile_stale_credit_reservations(
  p_stale_before TIMESTAMPTZ,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE(refunded_count INTEGER, quarantined_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row RECORD;
  v_refunded INTEGER := 0;
  v_quarantined INTEGER := 0;
BEGIN
  FOR v_row IN
    SELECT job_id, user_id
    FROM public.processing_credit_reservations
    WHERE status = 'processing'
      AND protocol_version <> 'v2'
      AND created_at < p_stale_before
      AND COALESCE(delivery_attempted_at, output_staged_at, created_at) < p_stale_before
    ORDER BY created_at
    LIMIT LEAST(GREATEST(p_limit, 1), 500)
    FOR UPDATE SKIP LOCKED
  LOOP
    BEGIN
      IF public.refund_processing_credit_reservation(
        v_row.user_id, v_row.job_id, 'stale_worker_reservation'
      ) THEN
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





CREATE OR REPLACE FUNCTION public.request_upscale_recovery(p_job_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_execution public.upscale_executions%ROWTYPE; v_action TEXT; v_due TIMESTAMPTZ:=now();
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_job_id::TEXT,741239));
  SELECT * INTO v_execution FROM public.upscale_executions WHERE job_id=p_job_id FOR UPDATE;
  IF NOT FOUND OR v_execution.stage IN ('completed','failed','expired') THEN RETURN FALSE; END IF;
  v_action:=CASE v_execution.stage WHEN 'queued' THEN 'advance' WHEN 'processing' THEN 'poll'
    WHEN 'staging' THEN 'stage' WHEN 'ready' THEN 'expire_output' ELSE 'reconcile' END;
  IF v_execution.stage='submitting' THEN v_due:=GREATEST(now(),v_execution.submission_deadline_at); END IF;
  IF v_execution.stage='ready' THEN v_due:=GREATEST(now(),v_execution.output_expires_at,v_execution.delivery_lease_expires_at); END IF;
  RETURN public.schedule_upscale_action(p_job_id,v_action,v_due,v_execution.lease_generation);
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_upscale_execution_plan(
  p_job_id UUID,p_model_id TEXT,p_provider TEXT,p_model_version TEXT,p_charge INTEGER,p_config JSONB DEFAULT NULL
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_execution public.upscale_executions%ROWTYPE; v_reservation public.processing_credit_reservations%ROWTYPE;
  v_sub INTEGER; v_purchased INTEGER; v_returned INTEGER;
BEGIN
  IF p_charge IS NULL OR p_charge<=0 OR p_provider IS NULL OR p_provider NOT IN ('replicate','gemini')
    OR p_model_id IS NULL OR length(trim(p_model_id))=0
    OR p_config IS NOT NULL AND (jsonb_typeof(p_config)<>'object' OR octet_length(p_config::TEXT)>16384) THEN RETURN FALSE; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_job_id::TEXT,741239));
  SELECT * INTO v_execution FROM public.upscale_executions WHERE job_id=p_job_id FOR UPDATE;
  IF NOT FOUND OR v_execution.stage<>'queued' OR v_execution.deadline_at<=now() OR p_charge>v_execution.credits_reserved
    OR EXISTS(SELECT 1 FROM public.upscale_attempts WHERE job_id=p_job_id) THEN RETURN FALSE; END IF;
  IF v_execution.selection_mode='explicit' AND (v_execution.resolved_model_id<>p_model_id
    OR v_execution.model_version IS DISTINCT FROM p_model_version) THEN RETURN FALSE; END IF;
  IF p_config ? 'scale' AND p_config->>'scale' IS DISTINCT FROM v_execution.scale::TEXT THEN RETURN FALSE; END IF;
  IF v_execution.provider<>'deferred' THEN
    RETURN v_execution.resolved_model_id=p_model_id AND v_execution.provider=p_provider
      AND v_execution.model_version IS NOT DISTINCT FROM p_model_version AND v_execution.credits_reserved=p_charge
      AND (p_config IS NULL OR v_execution.config=p_config);
  END IF;
  SELECT * INTO v_reservation FROM public.processing_credit_reservations
    WHERE job_id=p_job_id AND user_id=v_execution.user_id AND protocol_version='v2' AND status='processing' FOR UPDATE;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  v_sub:=LEAST(v_reservation.consumed_subscription,p_charge);
  v_purchased:=p_charge-v_sub;
  v_returned:=v_reservation.amount-p_charge;
  IF v_returned>0 THEN
    PERFORM set_config('app.trusted_credit_operation','true',true);
    UPDATE public.profiles SET subscription_credits_balance=subscription_credits_balance+v_reservation.consumed_subscription-v_sub,
      purchased_credits_balance=purchased_credits_balance+v_reservation.consumed_purchased-v_purchased,updated_at=now()
      WHERE id=v_execution.user_id;
    INSERT INTO public.credit_transactions(user_id,amount,type,reference_id,description)
      VALUES(v_execution.user_id,v_returned,'refund','reservation_adjustment_'||p_job_id::TEXT,'Unused Auto processing reservation');
  END IF;
  UPDATE public.processing_credit_reservations SET amount=p_charge,consumed_subscription=v_sub,consumed_purchased=v_purchased,
    updated_at=now() WHERE job_id=p_job_id;
  UPDATE public.upscale_executions SET resolved_model_id=p_model_id,provider=p_provider,model_version=p_model_version,
    config=COALESCE(p_config,config),credits_reserved=p_charge,updated_at=now() WHERE job_id=p_job_id;
  PERFORM public.sync_upscale_processing_projection(p_job_id);
  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_expired_upscale_predictions(p_limit INTEGER DEFAULT 50)
RETURNS TABLE(job_id UUID,prediction_id TEXT,provider TEXT,model_id TEXT)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT e.job_id,a.provider_prediction_id,a.provider,a.model_id
  FROM public.upscale_executions e JOIN public.upscale_attempts a ON a.job_id=e.job_id
  WHERE e.stage IN ('submitting','submission_unknown','processing') AND e.deadline_at<=now()
    AND a.provider_prediction_id IS NOT NULL AND a.submission_state<>'terminal'
  ORDER BY e.deadline_at LIMIT LEAST(GREATEST(p_limit,1),50);
$$;

CREATE OR REPLACE FUNCTION public.claim_upscale_wake(p_signature TEXT,p_expires_at TIMESTAMPTZ)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_signature IS NULL OR p_signature !~ '^[0-9a-f]{64}$' OR p_expires_at IS NULL
    OR p_expires_at<=now() OR p_expires_at>now()+interval '5 minutes' THEN RETURN FALSE; END IF;
  DELETE FROM public.upscale_wake_claims WHERE signature IN (
    SELECT signature FROM public.upscale_wake_claims WHERE expires_at<=now() ORDER BY expires_at LIMIT 500
  );
  INSERT INTO public.upscale_wake_claims(signature,expires_at) VALUES(p_signature,p_expires_at) ON CONFLICT DO NOTHING;
  RETURN FOUND;
END;
$$;

-- Keep the legacy implementations private. Every old public entry point first
-- takes the admission job lock and checks protocol before touching accounting.
CREATE SCHEMA IF NOT EXISTS upscale_legacy;
REVOKE ALL ON SCHEMA upscale_legacy FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION public.refund_consumed_credits(UUID,INTEGER,TEXT,INTEGER,INTEGER,TEXT) SET SCHEMA upscale_legacy;
ALTER FUNCTION public.record_processing_credit_reservation_output(UUID,UUID,TEXT,TEXT,TIMESTAMPTZ,TEXT) SET SCHEMA upscale_legacy;
ALTER FUNCTION public.retrieve_processing_credit_reservation_output(UUID,UUID,TEXT) SET SCHEMA upscale_legacy;
ALTER FUNCTION public.acknowledge_processing_credit_reservation(UUID,UUID,TEXT,TEXT,TIMESTAMPTZ,TEXT) SET SCHEMA upscale_legacy;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA upscale_legacy FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.refund_consumed_credits(
  p_user_id UUID,p_amount INTEGER,p_job_id TEXT,p_subscription_amount INTEGER DEFAULT NULL,
  p_purchased_amount INTEGER DEFAULT NULL,p_description TEXT DEFAULT 'Credit refund for failed processing'
)
RETURNS TABLE(success BOOLEAN,already_refunded BOOLEAN,refunded_amount INTEGER,new_subscription_balance INTEGER,
  new_purchased_balance INTEGER,new_total_balance INTEGER)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE v_job UUID; v_reservation public.processing_credit_reservations%ROWTYPE; v_ok BOOLEAN; v_sub INTEGER; v_purchased INTEGER;
BEGIN
  BEGIN v_job:=p_job_id::UUID; EXCEPTION WHEN invalid_text_representation THEN v_job:=NULL; END;
  IF v_job IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(v_job::TEXT,741239));
    SELECT * INTO v_reservation FROM public.processing_credit_reservations WHERE job_id=v_job FOR UPDATE;
    IF FOUND THEN
      IF v_reservation.user_id IS DISTINCT FROM p_user_id OR v_reservation.protocol_version='v2' THEN
        RETURN QUERY SELECT FALSE,FALSE,0,NULL::INTEGER,NULL::INTEGER,NULL::INTEGER;
        RETURN;
      END IF;
      v_ok:=public.refund_processing_credit_reservation(p_user_id,v_job,p_description);
      SELECT subscription_credits_balance,purchased_credits_balance INTO v_sub,v_purchased FROM public.profiles WHERE id=p_user_id;
      RETURN QUERY SELECT v_ok,v_reservation.status='refunded',
        CASE WHEN v_ok AND v_reservation.status<>'refunded' THEN v_reservation.amount ELSE 0 END,v_sub,v_purchased,v_sub+v_purchased;
      RETURN;
    END IF;
  END IF;
  RETURN QUERY SELECT * FROM upscale_legacy.refund_consumed_credits(p_user_id,p_amount,p_job_id,p_subscription_amount,p_purchased_amount,p_description);
END;
$$;

CREATE OR REPLACE FUNCTION public.record_processing_credit_reservation_output(
  p_user_id UUID,p_job_id UUID,p_output_url TEXT,p_output_mime_type TEXT,
  p_output_expires_at TIMESTAMPTZ DEFAULT NULL,p_delivery_token_hash TEXT DEFAULT NULL
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_job_id::TEXT,741239));
  IF EXISTS(SELECT 1 FROM public.processing_credit_reservations WHERE job_id=p_job_id AND protocol_version='v2') THEN RETURN FALSE; END IF;
  RETURN upscale_legacy.record_processing_credit_reservation_output(p_user_id,p_job_id,p_output_url,p_output_mime_type,p_output_expires_at,p_delivery_token_hash);
END;
$$;

CREATE OR REPLACE FUNCTION public.retrieve_processing_credit_reservation_output(p_user_id UUID,p_job_id UUID,p_delivery_token_hash TEXT)
RETURNS TABLE(output_url TEXT,output_mime_type TEXT,output_expires_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_job_id::TEXT,741239));
  IF EXISTS(SELECT 1 FROM public.processing_credit_reservations WHERE job_id=p_job_id AND protocol_version='v2') THEN RETURN; END IF;
  RETURN QUERY SELECT * FROM upscale_legacy.retrieve_processing_credit_reservation_output(p_user_id,p_job_id,p_delivery_token_hash);
END;
$$;

CREATE OR REPLACE FUNCTION public.acknowledge_processing_credit_reservation(
  p_user_id UUID,p_job_id UUID,p_output_url TEXT,p_output_mime_type TEXT,
  p_output_expires_at TIMESTAMPTZ DEFAULT NULL,p_delivery_token_hash TEXT DEFAULT NULL
)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_job_id::TEXT,741239));
  IF EXISTS(SELECT 1 FROM public.processing_credit_reservations WHERE job_id=p_job_id AND protocol_version='v2') THEN
    RETURN public.acknowledge_upscale_execution(p_user_id,p_job_id,p_output_url,p_output_mime_type,p_delivery_token_hash);
  END IF;
  RETURN upscale_legacy.acknowledge_processing_credit_reservation(p_user_id,p_job_id,p_output_url,p_output_mime_type,p_output_expires_at,p_delivery_token_hash);
END;
$$;

COMMENT ON TABLE public.upscale_executions IS 'Authoritative v2 ledger for authenticated upscale execution and delivery.';
COMMENT ON TABLE public.upscale_attempts IS 'Provider attempts persisted before external prediction creation.';
COMMENT ON TABLE public.upscale_outbox IS 'Transactional outbox for executor task publication and recovery.';
COMMENT ON TABLE public.upscale_wake_claims IS 'Short-lived replay protection for signed executor wakes.';

REVOKE ALL ON FUNCTION public.sync_upscale_processing_projection(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_upscale_processing_projection(UUID) TO service_role;
REVOKE ALL ON FUNCTION public.admit_upscale_execution(UUID, UUID, TEXT, TEXT, TEXT, BIGINT, INTEGER, INTEGER, TEXT, INTEGER, JSONB, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, TIMESTAMPTZ, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admit_upscale_execution(UUID, UUID, TEXT, TEXT, TEXT, BIGINT, INTEGER, INTEGER, TEXT, INTEGER, JSONB, TEXT, TEXT, TEXT, TEXT, INTEGER, INTEGER, TIMESTAMPTZ, TEXT, TIMESTAMPTZ) TO service_role;
REVOKE ALL ON FUNCTION public.create_upscale_attempt(UUID, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_upscale_attempt(UUID, TEXT, TEXT, TEXT, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.bind_upscale_prediction(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.bind_upscale_prediction(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ) TO service_role;
REVOKE ALL ON FUNCTION public.mark_upscale_submission_unknown(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_upscale_submission_unknown(UUID, UUID, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.mark_upscale_provider_terminal(UUID, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_upscale_provider_terminal(UUID, UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.settle_upscale_execution_failure(UUID, TEXT, BOOLEAN) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.settle_upscale_execution_failure(UUID, TEXT, BOOLEAN) TO service_role;
REVOKE ALL ON FUNCTION public.mark_upscale_ready(UUID, TEXT, TEXT, BIGINT, TIMESTAMPTZ, TEXT, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_upscale_ready(UUID, TEXT, TEXT, BIGINT, TIMESTAMPTZ, TEXT, INTEGER, INTEGER) TO service_role;
REVOKE ALL ON FUNCTION public.issue_upscale_delivery_capability(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.issue_upscale_delivery_capability(UUID, UUID, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.acquire_upscale_delivery_lease(UUID, UUID, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_upscale_delivery_lease(UUID, UUID, TEXT, INTEGER) TO service_role;
REVOKE ALL ON FUNCTION public.renew_upscale_delivery_lease(UUID, UUID, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.renew_upscale_delivery_lease(UUID, UUID, TEXT, INTEGER) TO service_role;
REVOKE ALL ON FUNCTION public.release_upscale_delivery_lease(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_upscale_delivery_lease(UUID, UUID, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.acknowledge_upscale_execution(UUID, UUID, TEXT, TEXT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acknowledge_upscale_execution(UUID, UUID, TEXT, TEXT, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.claim_upscale_outbox(INTEGER, TEXT, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_upscale_outbox(INTEGER, TEXT, INTEGER) TO service_role;
REVOKE ALL ON FUNCTION public.ack_upscale_outbox(BIGINT, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ack_upscale_outbox(BIGINT, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.retry_upscale_outbox(BIGINT, TEXT, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retry_upscale_outbox(BIGINT, TEXT, TIMESTAMPTZ, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.schedule_upscale_action(UUID, TEXT, TIMESTAMPTZ, BIGINT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_upscale_action(UUID, TEXT, TIMESTAMPTZ, BIGINT) TO service_role;
REVOKE ALL ON FUNCTION public.reconcile_upscale_deadlines(INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_upscale_deadlines(INTEGER) TO service_role;
REVOKE ALL ON FUNCTION public.refund_v2_processing_credit_reservation(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_v2_processing_credit_reservation(UUID, UUID, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.refund_processing_credit_reservation(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_processing_credit_reservation(UUID, UUID, TEXT) TO service_role;
REVOKE ALL ON FUNCTION public.reconcile_stale_credit_reservations(TIMESTAMPTZ, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_stale_credit_reservations(TIMESTAMPTZ, INTEGER) TO service_role;
REVOKE ALL ON FUNCTION public.claim_upscale_wake(TEXT, TIMESTAMPTZ) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_upscale_wake(TEXT, TIMESTAMPTZ) TO service_role;

REVOKE ALL ON FUNCTION public.request_upscale_recovery(UUID) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.request_upscale_recovery(UUID) TO service_role;

REVOKE ALL ON FUNCTION public.resolve_upscale_execution_plan(UUID,TEXT,TEXT,TEXT,INTEGER,JSONB) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_upscale_execution_plan(UUID,TEXT,TEXT,TEXT,INTEGER,JSONB) TO service_role;

REVOKE ALL ON FUNCTION public.record_upscale_executor_health(TEXT,BOOLEAN) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_upscale_executor_health(TEXT,BOOLEAN) TO service_role;
REVOKE ALL ON FUNCTION public.get_upscale_executor_availability() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_upscale_executor_availability() TO service_role;

REVOKE ALL ON FUNCTION public.get_expired_upscale_predictions(INTEGER) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_expired_upscale_predictions(INTEGER) TO service_role;

REVOKE ALL ON FUNCTION public.refund_consumed_credits(UUID,INTEGER,TEXT,INTEGER,INTEGER,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.refund_consumed_credits(UUID,INTEGER,TEXT,INTEGER,INTEGER,TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.record_processing_credit_reservation_output(UUID,UUID,TEXT,TEXT,TIMESTAMPTZ,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_processing_credit_reservation_output(UUID,UUID,TEXT,TEXT,TIMESTAMPTZ,TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.retrieve_processing_credit_reservation_output(UUID,UUID,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.retrieve_processing_credit_reservation_output(UUID,UUID,TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.acknowledge_processing_credit_reservation(UUID,UUID,TEXT,TEXT,TIMESTAMPTZ,TEXT) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.acknowledge_processing_credit_reservation(UUID,UUID,TEXT,TEXT,TIMESTAMPTZ,TEXT) TO service_role;
