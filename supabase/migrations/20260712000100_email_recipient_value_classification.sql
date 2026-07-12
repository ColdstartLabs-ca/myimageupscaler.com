-- Recipient-value policy metadata and count-only pruning run audit records.
-- This migration never changes queue status and is safe to deploy before the
-- guarded audit/apply workflow is enabled.

CREATE TABLE IF NOT EXISTS public.email_queue_pruning_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_version TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('dry_run', 'applied', 'rolled_back')),
  queue_snapshot_at TIMESTAMPTZ NOT NULL,
  candidate_count INTEGER NOT NULL CHECK (candidate_count >= 0),
  candidate_checksum TEXT NOT NULL,
  summary_by_decision JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary_by_reason JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary_by_campaign JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary_by_country JSONB NOT NULL DEFAULT '{}'::jsonb,
  summary_by_band JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  applied_at TIMESTAMPTZ NULL,
  rolled_back_at TIMESTAMPTZ NULL
);

CREATE TABLE IF NOT EXISTS public.email_queue_pruning_run_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID NOT NULL REFERENCES public.email_queue_pruning_runs(id) ON DELETE CASCADE,
  queue_id UUID NOT NULL REFERENCES public.email_lifecycle_queue(id) ON DELETE CASCADE,
  queue_updated_at TIMESTAMPTZ NOT NULL,
  recipient_value_score INTEGER NOT NULL,
  recipient_value_band TEXT NOT NULL,
  recipient_value_decision TEXT NOT NULL,
  recipient_value_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  recipient_value_policy_version TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (run_id, queue_id)
);

ALTER TABLE public.email_queue_pruning_runs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.email_queue_pruning_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.email_queue_pruning_runs TO service_role;

ALTER TABLE public.email_queue_pruning_run_items ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.email_queue_pruning_run_items FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.email_queue_pruning_run_items TO service_role;

ALTER TABLE public.email_lifecycle_queue
  ADD COLUMN IF NOT EXISTS recipient_value_score INTEGER NULL,
  ADD COLUMN IF NOT EXISTS recipient_value_band TEXT NULL,
  ADD COLUMN IF NOT EXISTS recipient_value_decision TEXT NULL,
  ADD COLUMN IF NOT EXISTS recipient_value_reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS recipient_value_policy_version TEXT NULL,
  ADD COLUMN IF NOT EXISTS recipient_value_classified_at TIMESTAMPTZ NULL,
  ADD COLUMN IF NOT EXISTS recipient_value_run_id UUID NULL
    REFERENCES public.email_queue_pruning_runs(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'email_lifecycle_queue_recipient_value_band_check'
      AND conrelid = 'public.email_lifecycle_queue'::regclass
  ) THEN
    ALTER TABLE public.email_lifecycle_queue
      ADD CONSTRAINT email_lifecycle_queue_recipient_value_band_check
      CHECK (
        recipient_value_band IN ('protected', 'high', 'medium', 'experiment', 'cancel')
        OR recipient_value_band IS NULL
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'email_lifecycle_queue_recipient_value_decision_check'
      AND conrelid = 'public.email_lifecycle_queue'::regclass
  ) THEN
    ALTER TABLE public.email_lifecycle_queue
      ADD CONSTRAINT email_lifecycle_queue_recipient_value_decision_check
      CHECK (
        recipient_value_decision IN (
          'protected', 'keep_high', 'keep_medium', 'hold_experiment', 'cancel'
        )
        OR recipient_value_decision IS NULL
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'email_lifecycle_queue_recipient_value_reasons_array_check'
      AND conrelid = 'public.email_lifecycle_queue'::regclass
  ) THEN
    ALTER TABLE public.email_lifecycle_queue
      ADD CONSTRAINT email_lifecycle_queue_recipient_value_reasons_array_check
      CHECK (jsonb_typeof(recipient_value_reasons) = 'array');
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_email_lifecycle_queue_recipient_value_due
  ON public.email_lifecycle_queue(
    status,
    recipient_value_decision,
    recipient_value_score DESC NULLS LAST,
    scheduled_for
  );

CREATE INDEX IF NOT EXISTS idx_email_lifecycle_queue_recipient_value_run
  ON public.email_lifecycle_queue(recipient_value_run_id)
  WHERE recipient_value_run_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_queue_pruning_run_items_run_queue
  ON public.email_queue_pruning_run_items(run_id, queue_id);

COMMENT ON TABLE public.email_queue_pruning_runs IS
  'Count-only audit records for deterministic recipient-value queue pruning. It stores no recipient PII.';

COMMENT ON TABLE public.email_queue_pruning_run_items IS
  'Non-PII per-queue snapshot used to apply a bounded dry-run atomically; never expose in operator output.';

COMMENT ON COLUMN public.email_lifecycle_queue.recipient_value_reasons IS
  'Stable machine-readable recipient-value reason codes; never store recipient PII here.';
