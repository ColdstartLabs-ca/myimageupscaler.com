ALTER TABLE public.subscriptions
ADD COLUMN retention_claim_id uuid,
ADD COLUMN retention_claimed_at timestamptz;

COMMENT ON COLUMN public.subscriptions.retention_claim_id IS
  'Short-lived lease owner for an in-progress cancellation retention change.';
COMMENT ON COLUMN public.subscriptions.retention_claimed_at IS
  'Lease timestamp used to recover an interrupted cancellation retention change.';
