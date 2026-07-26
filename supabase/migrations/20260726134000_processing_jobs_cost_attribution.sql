-- Per-run provider cost attribution for credit-economy reconciliation.
-- Fresh backup verified before this migration was created:
-- backups/backup_2026-07-26_13-37-00.schema.sql.gz
-- backups/backup_2026-07-26_13-37-00.data.sql.gz

ALTER TABLE public.processing_jobs
  ADD COLUMN IF NOT EXISTS model_id TEXT,
  ADD COLUMN IF NOT EXISTS quality_tier TEXT,
  ADD COLUMN IF NOT EXISTS scale INTEGER,
  ADD COLUMN IF NOT EXISTS effective_resolution TEXT,
  ADD COLUMN IF NOT EXISTS provider_cost_usd NUMERIC(10, 6),
  ADD COLUMN IF NOT EXISTS credits_charged INTEGER;

CREATE INDEX IF NOT EXISTS idx_processing_jobs_created_at_model_id
  ON public.processing_jobs(created_at, model_id);

COMMENT ON COLUMN public.processing_jobs.provider_cost_usd IS
  'Provider cost attributed at billing time, in USD, for invoice reconciliation.';
COMMENT ON COLUMN public.processing_jobs.credits_charged IS
  'Final credits charged to the user for this provider run.';
