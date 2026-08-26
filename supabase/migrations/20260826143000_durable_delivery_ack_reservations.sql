-- Durable server-gated delivery for credit reservations.
-- Provider output is staged after provider success, but the raw provider URL is
-- never returned to the browser. The authenticated browser receives only a job
-- id + plaintext capability token and must POST it to /api/upscale/output.
-- Service-role RPCs validate the exact user/job/token hash, stream the staged
-- URL server-side, and complete billing only after the stream reaches EOF.

ALTER TABLE public.processing_credit_reservations
  ADD COLUMN IF NOT EXISTS delivery_token_hash TEXT,
  ADD COLUMN IF NOT EXISTS output_staged_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS delivery_attempted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS acknowledged_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS processing_credit_reservations_delivery_token_idx
  ON public.processing_credit_reservations (job_id, user_id, delivery_token_hash)
  WHERE delivery_token_hash IS NOT NULL;

CREATE OR REPLACE FUNCTION public.record_processing_credit_reservation_output(
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
  v_updated INTEGER;
BEGIN
  IF p_output_url IS NULL OR length(trim(p_output_url)) = 0 THEN
    RETURN FALSE;
  END IF;
  IF p_delivery_token_hash IS NULL OR length(trim(p_delivery_token_hash)) = 0 THEN
    RETURN FALSE;
  END IF;

  UPDATE public.processing_credit_reservations
  SET status = 'processing',
      output_url = p_output_url,
      output_mime_type = p_output_mime_type,
      output_expires_at = p_output_expires_at,
      delivery_token_hash = p_delivery_token_hash,
      output_staged_at = now(),
      updated_at = now()
  WHERE job_id = p_job_id
    AND user_id = p_user_id
    AND status = 'processing';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

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
    AND r.delivery_token_hash IS NOT DISTINCT FROM p_delivery_token_hash
    AND r.output_url IS NOT NULL
    AND r.status IN ('processing', 'completed')
  RETURNING r.output_url, r.output_mime_type, r.output_expires_at
  INTO output_url, output_mime_type, output_expires_at;

  IF FOUND THEN
    RETURN NEXT;
  END IF;
END;
$$;

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
  IF p_output_url IS NULL OR length(trim(p_output_url)) = 0 THEN
    RETURN FALSE;
  END IF;
  IF p_delivery_token_hash IS NULL OR length(trim(p_delivery_token_hash)) = 0 THEN
    RETURN FALSE;
  END IF;

  SELECT * INTO v_reservation
  FROM public.processing_credit_reservations
  WHERE job_id = p_job_id
    AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;

  IF v_reservation.output_url IS NULL
    OR v_reservation.delivery_token_hash IS NULL THEN
    RETURN FALSE;
  END IF;

  IF v_reservation.status = 'completed' THEN
    RETURN v_reservation.output_url = p_output_url
      AND v_reservation.output_mime_type IS NOT DISTINCT FROM p_output_mime_type
      AND v_reservation.output_expires_at IS NOT DISTINCT FROM p_output_expires_at
      AND v_reservation.delivery_token_hash IS NOT DISTINCT FROM p_delivery_token_hash;
  END IF;

  IF v_reservation.status <> 'processing' THEN
    RETURN FALSE;
  END IF;

  IF v_reservation.output_url <> p_output_url
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
  WHERE job_id = p_job_id
    AND user_id = p_user_id
    AND status = 'processing';

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_stale_credit_reservations(
  p_stale_before TIMESTAMPTZ,
  p_limit INTEGER DEFAULT 100
)
RETURNS TABLE(refunded_count INTEGER, quarantined_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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

DROP FUNCTION IF EXISTS public.complete_processing_credit_reservation(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ);

REVOKE ALL ON FUNCTION public.record_processing_credit_reservation_output(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_processing_credit_reservation_output(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.record_processing_credit_reservation_output(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_processing_credit_reservation_output(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.retrieve_processing_credit_reservation_output(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.retrieve_processing_credit_reservation_output(UUID, UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.retrieve_processing_credit_reservation_output(UUID, UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.retrieve_processing_credit_reservation_output(UUID, UUID, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.acknowledge_processing_credit_reservation(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.acknowledge_processing_credit_reservation(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.acknowledge_processing_credit_reservation(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.acknowledge_processing_credit_reservation(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.reconcile_stale_credit_reservations(TIMESTAMPTZ, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_stale_credit_reservations(TIMESTAMPTZ, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.reconcile_stale_credit_reservations(TIMESTAMPTZ, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_stale_credit_reservations(TIMESTAMPTZ, INTEGER) TO service_role;
