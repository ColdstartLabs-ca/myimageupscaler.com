-- PRD-SQR-03 AC-1: durable measured-success records for scheduled cron jobs.
--
-- A scheduled job records its last successful run and counts here. An existing
-- health or alert path can read last_success_at to prove the run happened and
-- that it reported failed: 0. A missing row is a visible "never succeeded"
-- signal, so the reader can fail closed.

CREATE TABLE IF NOT EXISTS public.cron_job_health (
  job_key TEXT PRIMARY KEY,
  last_success_at TIMESTAMPTZ NOT NULL,
  counts JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.cron_job_health ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.cron_job_health FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.cron_job_health TO service_role;

CREATE OR REPLACE FUNCTION public.record_cron_job_success(
  p_job_key TEXT,
  p_counts JSONB DEFAULT '{}'::jsonb
)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_now TIMESTAMPTZ := pg_catalog.now();
BEGIN
  IF p_job_key IS NULL OR pg_catalog.btrim(p_job_key) = '' THEN
    RAISE EXCEPTION 'cron job key is required';
  END IF;
  IF p_counts IS NULL OR pg_catalog.jsonb_typeof(p_counts) <> 'object' THEN
    RAISE EXCEPTION 'cron job counts must be a JSON object';
  END IF;

  INSERT INTO public.cron_job_health(job_key, last_success_at, counts, updated_at)
  VALUES (p_job_key, v_now, p_counts, v_now)
  ON CONFLICT (job_key) DO UPDATE
    SET last_success_at = EXCLUDED.last_success_at,
        counts = EXCLUDED.counts,
        updated_at = EXCLUDED.updated_at;

  RETURN v_now;
END;
$$;

REVOKE ALL ON FUNCTION public.record_cron_job_success(TEXT, JSONB)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_cron_job_success(TEXT, JSONB)
  TO service_role;

COMMENT ON FUNCTION public.record_cron_job_success(TEXT, JSONB) IS
  'PRD-SQR-03 AC-1: upserts the last successful run timestamp and counts for a cron job.';

-- Rollback:
--   DROP FUNCTION IF EXISTS public.record_cron_job_success(TEXT, JSONB);
--   DROP TABLE IF EXISTS public.cron_job_health;
