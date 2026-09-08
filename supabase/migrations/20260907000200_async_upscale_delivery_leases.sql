-- Phase 4: protect a server-side output stream from a concurrent async refund.
-- The capability token remains the customer-facing credential. The lease token is
-- generated and consumed only inside the authenticated server route.

ALTER TABLE public.processing_credit_reservations
  ADD COLUMN IF NOT EXISTS delivery_lease_token UUID;

CREATE OR REPLACE FUNCTION public.claim_async_upscale_delivery(
  p_user_id UUID,
  p_job_id UUID,
  p_delivery_token_hash TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.processing_credit_reservations%ROWTYPE;
  v_lease_token UUID;
  v_lease_expires_at TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_row
  FROM public.processing_credit_reservations
  WHERE job_id = p_job_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('outcome', 'not_found');
  END IF;

  -- Legacy output reservations stay on their incumbent retrieval RPC. Returning
  -- this marker lets the service fall back without exposing async rows to it.
  IF v_row.execution_mode IS NULL THEN
    RETURN jsonb_build_object('outcome', 'legacy');
  END IF;

  IF p_delivery_token_hash IS NULL
    OR v_row.delivery_token_hash IS DISTINCT FROM p_delivery_token_hash
    OR v_row.output_url IS NULL
    OR v_row.output_mime_type IS NULL
    OR v_row.status NOT IN ('processing', 'completed')
    OR v_row.provider_phase <> 'succeeded'
    OR v_row.delivery_deadline_at IS NULL
    -- The output route enforces a two-minute total stream deadline. Do not start
    -- a delivery that could outlive the reservation's refund protection.
    OR v_row.delivery_deadline_at <= now() + INTERVAL '2 minutes' THEN
    RETURN jsonb_build_object('outcome', 'not_found');
  END IF;

  IF v_row.delivery_lease_expires_at > now() THEN
    RETURN jsonb_build_object(
      'outcome', 'busy',
      'retry_at', v_row.delivery_lease_expires_at
    );
  END IF;

  v_lease_token := gen_random_uuid();
  -- Keep the lease strictly longer than the output route's two-minute deadline.
  -- The earlier guard ensures the delivery deadline cannot shorten this lease
  -- back to the route deadline.
  v_lease_expires_at := LEAST(v_row.delivery_deadline_at, now() + INTERVAL '3 minutes');

  UPDATE public.processing_credit_reservations
  SET delivery_lease_token = v_lease_token,
      delivery_lease_expires_at = v_lease_expires_at,
      delivery_attempted_at = now(),
      updated_at = now()
  WHERE job_id = p_job_id AND user_id = p_user_id;

  RETURN jsonb_build_object(
    'outcome', 'available',
    'output_url', v_row.output_url,
    'output_mime_type', v_row.output_mime_type,
    'output_expires_at', v_row.output_expires_at,
    'lease_token', v_lease_token,
    'lease_expires_at', v_lease_expires_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.release_async_upscale_delivery(
  p_user_id UUID,
  p_job_id UUID,
  p_delivery_token_hash TEXT,
  p_lease_token UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_delivery_token_hash IS NULL OR p_lease_token IS NULL THEN
    RETURN FALSE;
  END IF;

  UPDATE public.processing_credit_reservations
  SET delivery_lease_token = NULL,
      delivery_lease_expires_at = NULL,
      updated_at = now()
  WHERE user_id = p_user_id
    AND job_id = p_job_id
    AND execution_mode IS NOT NULL
    AND delivery_token_hash = p_delivery_token_hash
    AND delivery_lease_token = p_lease_token
    AND status IN ('processing', 'completed');

  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.acknowledge_async_upscale_delivery(
  p_user_id UUID,
  p_job_id UUID,
  p_delivery_token_hash TEXT,
  p_lease_token UUID,
  p_output_url TEXT,
  p_output_mime_type TEXT,
  p_output_expires_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.processing_credit_reservations%ROWTYPE;
BEGIN
  SELECT * INTO v_row
  FROM public.processing_credit_reservations
  WHERE job_id = p_job_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_row.execution_mode IS NULL
    OR p_delivery_token_hash IS NULL
    OR v_row.delivery_token_hash IS DISTINCT FROM p_delivery_token_hash
    OR v_row.output_url IS NULL THEN
    RETURN jsonb_build_object('outcome', 'not_found');
  END IF;

  IF v_row.status = 'completed' THEN
    IF v_row.output_url = p_output_url
      AND v_row.output_mime_type IS NOT DISTINCT FROM p_output_mime_type
      AND v_row.output_expires_at IS NOT DISTINCT FROM p_output_expires_at THEN
      RETURN jsonb_build_object('outcome', 'already_acknowledged');
    END IF;
    RETURN jsonb_build_object('outcome', 'not_found');
  END IF;

  IF v_row.status <> 'processing' OR v_row.provider_phase <> 'succeeded' THEN
    RETURN jsonb_build_object('outcome', 'not_found');
  END IF;

  IF p_lease_token IS NULL
    OR v_row.delivery_lease_token IS DISTINCT FROM p_lease_token
    OR v_row.delivery_lease_expires_at IS NULL
    OR v_row.delivery_lease_expires_at <= now() THEN
    RETURN jsonb_build_object('outcome', 'lease_expired');
  END IF;

  IF v_row.output_url <> p_output_url
    OR v_row.output_mime_type IS DISTINCT FROM p_output_mime_type
    OR v_row.output_expires_at IS DISTINCT FROM p_output_expires_at THEN
    RETURN jsonb_build_object('outcome', 'not_found');
  END IF;

  UPDATE public.processing_credit_reservations
  SET status = 'completed',
      completed_at = COALESCE(completed_at, now()),
      acknowledged_at = COALESCE(acknowledged_at, now()),
      delivery_lease_token = NULL,
      delivery_lease_expires_at = NULL,
      updated_at = now()
  WHERE job_id = p_job_id AND user_id = p_user_id AND status = 'processing';

  RETURN jsonb_build_object('outcome', 'acknowledged');
END;
$$;

-- Do not leave a legacy RPC capable of bypassing the async lease protocol.
CREATE OR REPLACE FUNCTION public.retrieve_processing_credit_reservation_output(
  p_user_id UUID,
  p_job_id UUID,
  p_delivery_token_hash TEXT
)
RETURNS TABLE(output_url TEXT, output_mime_type TEXT, output_expires_at TIMESTAMPTZ)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_delivery_token_hash IS NULL OR length(trim(p_delivery_token_hash)) = 0 THEN
    RETURN;
  END IF;

  UPDATE public.processing_credit_reservations r
  SET delivery_attempted_at = now(),
      updated_at = now()
  WHERE r.job_id = p_job_id
    AND r.user_id = p_user_id
    AND r.execution_mode IS NULL
    AND r.delivery_token_hash IS NOT DISTINCT FROM p_delivery_token_hash
    AND r.output_url IS NOT NULL
    AND r.status IN ('processing', 'completed')
  RETURNING r.output_url, r.output_mime_type, r.output_expires_at
  INTO output_url, output_mime_type, output_expires_at;

  IF FOUND THEN RETURN NEXT; END IF;
END;
$$;

-- The old EOF RPC remains available for legacy rows, but cannot complete an
-- async reservation without its server-side lease token.
CREATE OR REPLACE FUNCTION public.acknowledge_processing_credit_reservation(
  p_user_id UUID,
  p_job_id UUID,
  p_output_url TEXT,
  p_output_mime_type TEXT,
  p_output_expires_at TIMESTAMPTZ DEFAULT NULL,
  p_delivery_token_hash TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation public.processing_credit_reservations%ROWTYPE;
BEGIN
  IF p_output_url IS NULL OR length(trim(p_output_url)) = 0
    OR p_delivery_token_hash IS NULL OR length(trim(p_delivery_token_hash)) = 0 THEN
    RETURN FALSE;
  END IF;

  SELECT * INTO v_reservation
  FROM public.processing_credit_reservations
  WHERE job_id = p_job_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND OR v_reservation.execution_mode IS NOT NULL
    OR v_reservation.output_url IS NULL
    OR v_reservation.delivery_token_hash IS NULL THEN
    RETURN FALSE;
  END IF;

  IF v_reservation.status = 'completed' THEN
    RETURN v_reservation.output_url = p_output_url
      AND v_reservation.output_mime_type IS NOT DISTINCT FROM p_output_mime_type
      AND v_reservation.output_expires_at IS NOT DISTINCT FROM p_output_expires_at
      AND v_reservation.delivery_token_hash IS NOT DISTINCT FROM p_delivery_token_hash;
  END IF;

  IF v_reservation.status <> 'processing'
    OR v_reservation.output_url <> p_output_url
    OR v_reservation.output_mime_type IS DISTINCT FROM p_output_mime_type
    OR v_reservation.output_expires_at IS DISTINCT FROM p_output_expires_at
    OR v_reservation.delivery_token_hash IS DISTINCT FROM p_delivery_token_hash THEN
    RETURN FALSE;
  END IF;

  UPDATE public.processing_credit_reservations
  SET status = 'completed',
      completed_at = COALESCE(completed_at, now()),
      acknowledged_at = COALESCE(acknowledged_at, now()),
      updated_at = now()
  WHERE job_id = p_job_id AND user_id = p_user_id AND status = 'processing';
  RETURN TRUE;
END;
$$;

DO $$
DECLARE v_function REGPROCEDURE;
BEGIN
  FOR v_function IN SELECT p.oid::REGPROCEDURE FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname IN (
      'claim_async_upscale_delivery', 'release_async_upscale_delivery',
      'acknowledge_async_upscale_delivery'
    )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', v_function);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_function);
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.retrieve_processing_credit_reservation_output(UUID, UUID, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.retrieve_processing_credit_reservation_output(UUID, UUID, TEXT)
  TO service_role;
REVOKE ALL ON FUNCTION public.acknowledge_processing_credit_reservation(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.acknowledge_processing_credit_reservation(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT)
  TO service_role;

COMMENT ON COLUMN public.processing_credit_reservations.delivery_lease_token IS
  'Private per-stream lease token. It is never returned to the browser or logged.';
