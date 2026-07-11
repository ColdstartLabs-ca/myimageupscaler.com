ALTER TABLE public.auto_top_up_settings
ADD COLUMN charge_claim_id uuid,
ADD COLUMN charge_claimed_at timestamptz;

CREATE INDEX idx_auto_top_up_settings_charge_claim
  ON public.auto_top_up_settings(charge_claim_id)
  WHERE charge_claim_id IS NOT NULL;
