ALTER TABLE public.sync_runs DROP CONSTRAINT sync_runs_job_type_check;
ALTER TABLE public.sync_runs ADD CONSTRAINT sync_runs_job_type_check
  CHECK (job_type = ANY (ARRAY[
    'expiration_check'::text,
    'webhook_recovery'::text,
    'full_reconciliation'::text,
    'three_kings_sitemap_refresh'::text,
    'seo_lock_digest'::text
  ]));
