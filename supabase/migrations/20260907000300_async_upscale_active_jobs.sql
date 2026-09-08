-- Phase 5b: bounded owner-scoped async job recovery.
-- This list is database-only. It never claims an observation and never returns
-- provider URLs, input paths, delivery capabilities or private context.

CREATE FUNCTION public.list_active_async_upscale_jobs(
  p_user_id UUID,
  p_limit INTEGER DEFAULT 20
)
RETURNS TABLE(
  job_id UUID,
  status TEXT,
  provider_phase TEXT,
  created_at TIMESTAMPTZ,
  execution_deadline_at TIMESTAMPTZ,
  delivery_deadline_at TIMESTAMPTZ,
  display JSONB
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    r.job_id,
    r.status,
    r.provider_phase,
    r.created_at,
    r.execution_deadline_at,
    r.delivery_deadline_at,
    jsonb_strip_nulls(jsonb_build_object(
      'modelDisplayName', r.result_context #>> '{response,modelDisplayName}',
      'dimensionPreservingFallback', CASE
        WHEN r.result_context #>> '{response,dimensionPreservingFallback}' IN ('true', 'false')
          THEN (r.result_context #>> '{response,dimensionPreservingFallback}')::BOOLEAN
        ELSE NULL
      END,
      'mimeType', r.result_context #>> '{response,mimeType}',
      'dimensions', r.result_context #> '{response,dimensions}'
    )) AS display
  FROM public.processing_credit_reservations r
  WHERE r.user_id = p_user_id
    AND r.execution_mode = 'replicate_async_v1'
    AND r.status IN ('processing', 'completed')
    AND (
      (r.provider_phase = 'succeeded' AND r.delivery_deadline_at > now())
      OR (r.provider_phase <> 'succeeded' AND r.execution_deadline_at > now())
    )
  ORDER BY r.created_at DESC, r.job_id DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 20), 1), 20);
$$;

REVOKE ALL ON FUNCTION public.list_active_async_upscale_jobs(UUID, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_active_async_upscale_jobs(UUID, INTEGER)
  TO service_role;

COMMENT ON FUNCTION public.list_active_async_upscale_jobs(UUID, INTEGER) IS
  'Returns at most 20 unexpired owner jobs for reload recovery without provider work or delivery capabilities.';

/* LOCAL DOWN
BEGIN;
DROP FUNCTION public.list_active_async_upscale_jobs(UUID, INTEGER);
COMMIT;
END LOCAL DOWN */
