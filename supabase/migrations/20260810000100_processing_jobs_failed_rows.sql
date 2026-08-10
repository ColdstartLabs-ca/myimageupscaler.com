-- Make the failure-observation path explicit for service-role writes.
-- The table and its existing service-role policy already exist; this migration
-- adds a narrow insert policy for failed rows and intentionally backfills nothing.
GRANT INSERT ON TABLE public.processing_jobs TO service_role;

DROP POLICY IF EXISTS "Service role inserts failed processing jobs"
  ON public.processing_jobs;

CREATE POLICY "Service role inserts failed processing jobs"
  ON public.processing_jobs
  FOR INSERT
  TO service_role
  WITH CHECK (status = 'failed');
