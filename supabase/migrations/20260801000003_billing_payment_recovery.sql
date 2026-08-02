-- Durable correlation state for payment_failed -> payment_recovered.
-- This migration is intentionally additive. It is not applied to production by this task.

CREATE TABLE IF NOT EXISTS public.billing_payment_failures (
  failure_object_id TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  purchase_type TEXT NOT NULL CHECK (purchase_type IN ('subscription', 'credit_pack', 'unknown')),
  amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
  currency TEXT NOT NULL DEFAULT 'usd',
  failure_type TEXT NOT NULL,
  recovery_channel TEXT NOT NULL,
  failed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  recovered_at TIMESTAMPTZ,
  recovery_source_object_id TEXT
);

CREATE INDEX IF NOT EXISTS idx_billing_payment_failures_user_open
  ON public.billing_payment_failures(user_id, failed_at DESC)
  WHERE recovered_at IS NULL;

ALTER TABLE public.billing_payment_failures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages billing payment failures"
  ON public.billing_payment_failures;
CREATE POLICY "Service role manages billing payment failures"
  ON public.billing_payment_failures
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

COMMENT ON TABLE public.billing_payment_failures IS
  'Durable, non-sensitive correlation state for failed Stripe payments and later recovery.';
