CREATE TABLE public.auto_top_up_settings (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  pending_enabled boolean NOT NULL DEFAULT false,
  threshold_credits integer NOT NULL CHECK (threshold_credits BETWEEN 1 AND 10000),
  pack_key text NOT NULL CHECK (pack_key IN ('small', 'medium')),
  stripe_price_id text NOT NULL,
  stripe_customer_id text NOT NULL,
  stripe_payment_method_id text,
  consent_version uuid NOT NULL,
  checkout_session_id text UNIQUE,
  consented_at timestamptz NOT NULL,
  last_refill_at timestamptz,
  consecutive_failures integer NOT NULL DEFAULT 0 CHECK (consecutive_failures >= 0),
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX idx_auto_top_up_settings_user_consent
  ON public.auto_top_up_settings(user_id, consent_version);
ALTER TABLE public.auto_top_up_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own auto top up settings"
  ON public.auto_top_up_settings FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
CREATE POLICY "Service role manages auto top up settings"
  ON public.auto_top_up_settings FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.auto_top_up_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  idempotency_key text NOT NULL UNIQUE,
  starting_balance integer NOT NULL CHECK (starting_balance >= 0),
  status text NOT NULL CHECK (status IN ('claimed', 'payment_pending', 'succeeded', 'failed', 'cancelled')),
  stripe_payment_intent_id text UNIQUE,
  amount_cents integer NOT NULL CHECK (amount_cents > 0),
  currency text NOT NULL,
  credited_transaction_id uuid REFERENCES public.credit_transactions(id),
  error_class text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_auto_top_up_attempts_user_created
  ON public.auto_top_up_attempts(user_id, created_at DESC);
ALTER TABLE public.auto_top_up_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Service role manages auto top up attempts"
  ON public.auto_top_up_attempts FOR ALL TO service_role USING (true) WITH CHECK (true);
