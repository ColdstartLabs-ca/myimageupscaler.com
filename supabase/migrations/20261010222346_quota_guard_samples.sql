-- PRD-SQR-03 AC-6: daily quota guard history for MIU byte budgets.
--
-- One sample per UTC day records the measured database, Supabase Storage and
-- (when available) R2 bytes. The history drives the 30-day growth rate and the
-- days-left runway. A NULL r2_bytes means the R2 measurement was unavailable,
-- which is a visible missing signal rather than a fabricated zero.

CREATE TABLE IF NOT EXISTS public.quota_guard_samples (
  sample_day DATE PRIMARY KEY,
  database_bytes BIGINT NOT NULL CHECK (database_bytes >= 0),
  storage_bytes BIGINT NOT NULL CHECK (storage_bytes >= 0),
  r2_bytes BIGINT NULL CHECK (r2_bytes IS NULL OR r2_bytes >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.quota_guard_samples ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.quota_guard_samples FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.quota_guard_samples TO service_role;

CREATE OR REPLACE FUNCTION public.record_quota_guard_sample(
  p_sample_day DATE,
  p_database_bytes BIGINT,
  p_storage_bytes BIGINT,
  p_r2_bytes BIGINT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_sample_day IS NULL THEN
    RAISE EXCEPTION 'sample day is required';
  END IF;
  IF p_database_bytes IS NULL OR p_database_bytes < 0 THEN
    RAISE EXCEPTION 'database bytes must be a nonnegative integer';
  END IF;
  IF p_storage_bytes IS NULL OR p_storage_bytes < 0 THEN
    RAISE EXCEPTION 'storage bytes must be a nonnegative integer';
  END IF;
  IF p_r2_bytes IS NOT NULL AND p_r2_bytes < 0 THEN
    RAISE EXCEPTION 'r2 bytes must be nonnegative when present';
  END IF;

  INSERT INTO public.quota_guard_samples(sample_day, database_bytes, storage_bytes, r2_bytes, updated_at)
  VALUES (p_sample_day, p_database_bytes, p_storage_bytes, p_r2_bytes, pg_catalog.now())
  ON CONFLICT (sample_day) DO UPDATE
    SET database_bytes = EXCLUDED.database_bytes,
        storage_bytes = EXCLUDED.storage_bytes,
        r2_bytes = COALESCE(EXCLUDED.r2_bytes, public.quota_guard_samples.r2_bytes),
        updated_at = EXCLUDED.updated_at;
END;
$$;

REVOKE ALL ON FUNCTION public.record_quota_guard_sample(DATE, BIGINT, BIGINT, BIGINT)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_quota_guard_sample(DATE, BIGINT, BIGINT, BIGINT)
  TO service_role;

-- Sum of every database size in the cluster, not just current_database(). The
-- Free-plan budget and the SQR-03 audit both measure the cluster total, so a
-- current_database()-only value under-reports by the other databases' bytes.
CREATE OR REPLACE FUNCTION public.measure_current_database_bytes()
RETURNS BIGINT
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT COALESCE(pg_catalog.sum(pg_catalog.pg_database_size(datname)), 0)::BIGINT
  FROM pg_catalog.pg_database;
$$;

REVOKE ALL ON FUNCTION public.measure_current_database_bytes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.measure_current_database_bytes() TO service_role;

-- Sum of Supabase Storage object sizes. Metadata size is the recorded object
-- byte length, so this is a metadata measurement, not a billed-storage figure.
CREATE OR REPLACE FUNCTION public.measure_supabase_storage_bytes()
RETURNS BIGINT
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
STABLE
AS $$
  SELECT COALESCE(pg_catalog.sum((o.metadata ->> 'size')::BIGINT), 0)::BIGINT
  FROM storage.objects AS o;
$$;

REVOKE ALL ON FUNCTION public.measure_supabase_storage_bytes() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.measure_supabase_storage_bytes() TO service_role;

COMMENT ON TABLE public.quota_guard_samples IS
  'PRD-SQR-03 AC-6: daily MIU database/storage/r2 byte samples for budget and runway alerts.';

-- Rollback:
--   DROP FUNCTION IF EXISTS public.measure_supabase_storage_bytes();
--   DROP FUNCTION IF EXISTS public.measure_current_database_bytes();
--   DROP FUNCTION IF EXISTS public.record_quota_guard_sample(DATE, BIGINT, BIGINT, BIGINT);
--   DROP TABLE IF EXISTS public.quota_guard_samples;
