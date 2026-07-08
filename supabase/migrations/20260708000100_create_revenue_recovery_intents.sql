CREATE TABLE IF NOT EXISTS public.revenue_recovery_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  audience_key TEXT NOT NULL,
  source TEXT NOT NULL,
  source_id TEXT NULL,
  price_id TEXT NULL,
  purchase_type TEXT NULL CHECK (purchase_type IN ('subscription', 'credit_pack') OR purchase_type IS NULL),
  selected_key TEXT NULL,
  trigger TEXT NULL,
  pricing_region TEXT NULL,
  credits_remaining INTEGER NULL,
  free_usage_count INTEGER NULL,
  context JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'queued', 'converted', 'suppressed', 'expired')),
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  queued_at TIMESTAMPTZ NULL,
  converted_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, audience_key)
);

CREATE INDEX IF NOT EXISTS idx_revenue_recovery_intents_status_seen
  ON public.revenue_recovery_intents(status, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_revenue_recovery_intents_audience_status
  ON public.revenue_recovery_intents(audience_key, status);

ALTER TABLE public.revenue_recovery_intents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages revenue recovery intents" ON public.revenue_recovery_intents;
CREATE POLICY "Service role manages revenue recovery intents"
  ON public.revenue_recovery_intents FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS on_revenue_recovery_intents_updated ON public.revenue_recovery_intents;
CREATE TRIGGER on_revenue_recovery_intents_updated
  BEFORE UPDATE ON public.revenue_recovery_intents
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

INSERT INTO public.email_lifecycle_campaigns
  (key, name, category, template_name, email_type, preference_key, cooldown_days, priority)
VALUES
  ('checkout-abandoned-24h', 'Checkout abandoner recovery', 'revenue_recovery', 'checkout-recovery', 'marketing', 'marketing_emails', 7, 100),
  ('upgrade-click-no-purchase-24h', 'Upgrade click no purchase recovery', 'revenue_recovery', 'checkout-recovery', 'marketing', 'marketing_emails', 7, 90)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  template_name = EXCLUDED.template_name,
  email_type = EXCLUDED.email_type,
  preference_key = EXCLUDED.preference_key,
  cooldown_days = EXCLUDED.cooldown_days,
  priority = EXCLUDED.priority,
  updated_at = NOW();
