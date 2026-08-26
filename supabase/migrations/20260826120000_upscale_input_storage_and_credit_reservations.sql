-- Move upscale input bytes out of the Cloudflare Worker request body and make
-- credit debits recoverable when a Worker is terminated before its catch/finally.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'upscale-inputs',
  'upscale-inputs',
  false,
  26214400,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE TABLE public.processing_credit_reservations (
  job_id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  usage_transaction_id UUID NOT NULL UNIQUE REFERENCES public.credit_transactions(id),
  refund_transaction_id UUID UNIQUE REFERENCES public.credit_transactions(id),
  amount INTEGER NOT NULL CHECK (amount > 0),
  consumed_subscription INTEGER NOT NULL CHECK (consumed_subscription >= 0),
  consumed_purchased INTEGER NOT NULL CHECK (consumed_purchased >= 0),
  status TEXT NOT NULL DEFAULT 'processing'
    CHECK (status IN ('processing', 'completed', 'refunded', 'quarantined')),
  output_url TEXT,
  output_mime_type TEXT,
  output_expires_at TIMESTAMPTZ,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  refunded_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT reservation_pool_split_matches_amount
    CHECK (consumed_subscription + consumed_purchased = amount)
);

CREATE INDEX processing_credit_reservations_stale_idx
  ON public.processing_credit_reservations (created_at)
  WHERE status = 'processing';

ALTER TABLE public.processing_credit_reservations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.processing_credit_reservations FROM PUBLIC;
REVOKE ALL ON TABLE public.processing_credit_reservations FROM anon;
REVOKE ALL ON TABLE public.processing_credit_reservations FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.processing_credit_reservations TO service_role;

CREATE OR REPLACE FUNCTION public.consume_credits_v3(
  p_user_id UUID,
  p_amount INTEGER,
  p_job_id UUID,
  p_description TEXT DEFAULT NULL
)
RETURNS TABLE(
  new_subscription_balance INTEGER,
  new_purchased_balance INTEGER,
  new_total_balance INTEGER,
  consumed_subscription INTEGER,
  consumed_purchased INTEGER,
  usage_transaction_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_subscription INTEGER;
  v_purchased INTEGER;
  v_from_subscription INTEGER;
  v_from_purchased INTEGER;
  v_usage_transaction_id UUID;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Amount must be positive: %', p_amount;
  END IF;
  IF p_job_id IS NULL THEN
    RAISE EXCEPTION 'Job ID is required';
  END IF;
  IF EXISTS (SELECT 1 FROM public.processing_credit_reservations WHERE job_id = p_job_id) THEN
    RAISE EXCEPTION 'Reservation already exists: %', p_job_id;
  END IF;

  SELECT subscription_credits_balance, purchased_credits_balance
  INTO v_subscription, v_purchased
  FROM public.profiles
  WHERE id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found: %', p_user_id;
  END IF;
  v_subscription := COALESCE(v_subscription, 0);
  v_purchased := COALESCE(v_purchased, 0);
  IF v_subscription + v_purchased < p_amount THEN
    RAISE EXCEPTION 'Insufficient credits. Required: %, Available: %',
      p_amount, v_subscription + v_purchased;
  END IF;

  v_from_subscription := LEAST(v_subscription, p_amount);
  v_from_purchased := p_amount - v_from_subscription;
  PERFORM set_config('app.trusted_credit_operation', 'true', true);

  UPDATE public.profiles
  SET subscription_credits_balance = v_subscription - v_from_subscription,
      purchased_credits_balance = v_purchased - v_from_purchased,
      updated_at = now()
  WHERE id = p_user_id;

  INSERT INTO public.credit_transactions (user_id, amount, type, reference_id, description)
  VALUES (
    p_user_id,
    -p_amount,
    'usage',
    p_job_id::TEXT,
    COALESCE(p_description, 'Image processing') ||
      format(' (sub: %s, purchased: %s)', v_from_subscription, v_from_purchased)
  )
  RETURNING id INTO v_usage_transaction_id;

  INSERT INTO public.processing_credit_reservations (
    job_id, user_id, usage_transaction_id, amount,
    consumed_subscription, consumed_purchased, status
  ) VALUES (
    p_job_id, p_user_id, v_usage_transaction_id, p_amount,
    v_from_subscription, v_from_purchased, 'processing'
  );

  RETURN QUERY SELECT
    v_subscription - v_from_subscription,
    v_purchased - v_from_purchased,
    v_subscription + v_purchased - p_amount,
    v_from_subscription,
    v_from_purchased,
    v_usage_transaction_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_processing_credit_reservation(
  p_user_id UUID,
  p_job_id UUID,
  p_output_url TEXT,
  p_output_mime_type TEXT,
  p_output_expires_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE public.processing_credit_reservations
  SET status = 'completed',
      output_url = p_output_url,
      output_mime_type = p_output_mime_type,
      output_expires_at = p_output_expires_at,
      completed_at = now(),
      updated_at = now()
  WHERE job_id = p_job_id
    AND user_id = p_user_id
    AND status = 'processing';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.refund_processing_credit_reservation(
  p_user_id UUID,
  p_job_id UUID,
  p_failure_reason TEXT DEFAULT 'processing_failed'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_reservation public.processing_credit_reservations%ROWTYPE;
  v_refund_transaction_id UUID;
BEGIN
  SELECT * INTO v_reservation
  FROM public.processing_credit_reservations
  WHERE job_id = p_job_id AND user_id = p_user_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Reservation not found: %', p_job_id;
  END IF;
  IF v_reservation.status = 'refunded' THEN
    RETURN TRUE;
  END IF;
  IF v_reservation.status <> 'processing' THEN
    RETURN FALSE;
  END IF;

  PERFORM 1 FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'User not found: %', p_user_id;
  END IF;
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
      failure_reason = COALESCE(p_failure_reason, 'processing_failed'),
      refunded_at = now(),
      updated_at = now()
  WHERE job_id = p_job_id AND status = 'processing';

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
    WHERE status = 'processing' AND created_at < p_stale_before
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

REVOKE ALL ON FUNCTION public.consume_credits_v3(UUID, INTEGER, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_credits_v3(UUID, INTEGER, UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.consume_credits_v3(UUID, INTEGER, UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.consume_credits_v3(UUID, INTEGER, UUID, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.complete_processing_credit_reservation(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_processing_credit_reservation(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ) FROM anon;
REVOKE ALL ON FUNCTION public.complete_processing_credit_reservation(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.complete_processing_credit_reservation(UUID, UUID, TEXT, TEXT, TIMESTAMPTZ) TO service_role;

REVOKE ALL ON FUNCTION public.refund_processing_credit_reservation(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refund_processing_credit_reservation(UUID, UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.refund_processing_credit_reservation(UUID, UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.refund_processing_credit_reservation(UUID, UUID, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.reconcile_stale_credit_reservations(TIMESTAMPTZ, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reconcile_stale_credit_reservations(TIMESTAMPTZ, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.reconcile_stale_credit_reservations(TIMESTAMPTZ, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_stale_credit_reservations(TIMESTAMPTZ, INTEGER) TO service_role;
