ALTER TABLE public.revenue_recovery_intents
  ADD COLUMN IF NOT EXISTS identity_verified_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS consent_basis TEXT NULL,
  ADD COLUMN IF NOT EXISTS source_surface TEXT NULL,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ NULL;

ALTER TABLE public.revenue_recovery_intents
  DROP CONSTRAINT IF EXISTS revenue_recovery_intents_consent_basis_check;

ALTER TABLE public.revenue_recovery_intents
  ADD CONSTRAINT revenue_recovery_intents_consent_basis_check
  CHECK (consent_basis IN ('email_preferences.marketing_emails') OR consent_basis IS NULL);

CREATE INDEX IF NOT EXISTS idx_revenue_recovery_intents_active_expiry
  ON public.revenue_recovery_intents(expires_at)
  WHERE status = 'active';

COMMENT ON COLUMN public.revenue_recovery_intents.identity_verified_at IS
  'Time at which the server verified the intent owner through Supabase Auth.';
COMMENT ON COLUMN public.revenue_recovery_intents.consent_basis IS
  'Existing application preference that authorized marketing recovery contact.';
COMMENT ON COLUMN public.revenue_recovery_intents.source_surface IS
  'First-party product surface where the recoverable purchase intent originated.';
COMMENT ON COLUMN public.revenue_recovery_intents.expires_at IS
  'After this time the intent is ineligible and its retained context is minimized.';
