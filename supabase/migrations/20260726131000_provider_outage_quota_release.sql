-- Release hourly processing quota after a non-user-attributable failure.
-- The update is atomic and can never move the counter below zero.
CREATE OR REPLACE FUNCTION public.release_batch_limit_slot(
    p_user_id UUID,
    p_window_hours INTEGER DEFAULT 1
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_window_start TIMESTAMP WITH TIME ZONE;
    v_current_count INTEGER;
BEGIN
    v_window_start := date_trunc('hour', NOW());

    UPDATE public.batch_usage
    SET
        count = GREATEST(count - 1, 0),
        updated_at = NOW()
    WHERE user_id = p_user_id
      AND window_start = v_window_start
    RETURNING count INTO v_current_count;

    RETURN COALESCE(v_current_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.release_batch_limit_slot(UUID, INTEGER) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.release_batch_limit_slot(UUID, INTEGER) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_batch_limit_slot(UUID, INTEGER) TO service_role;

COMMENT ON FUNCTION public.release_batch_limit_slot IS
'Atomically releases one current-window batch slot after a refunded provider or internal failure, floored at zero.';
