-- Run after the existing sync_runs migrations in an isolated database.
BEGIN;
INSERT INTO public.sync_runs (job_type) VALUES
  ('expiration_check'), ('webhook_recovery'), ('full_reconciliation'),
  ('three_kings_sitemap_refresh'), ('seo_lock_digest');
DO $$ BEGIN
  BEGIN
    INSERT INTO public.sync_runs (job_type) VALUES ('unknown_job');
    RAISE EXCEPTION 'Unknown sync job type was accepted';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
ROLLBACK;
