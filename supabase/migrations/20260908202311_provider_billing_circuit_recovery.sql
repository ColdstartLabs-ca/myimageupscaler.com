-- An account-level billing denial affects every model sharing the token. Pause
-- immediately instead of charging/refunding five users before opening the
-- circuit. Existing cooldown and stale half-open probe expiry provide recovery.
CREATE OR REPLACE FUNCTION public.record_provider_health_outcome(
    p_provider TEXT,
    p_success BOOLEAN,
    p_failure_kind TEXT DEFAULT NULL,
    p_failure_threshold INTEGER DEFAULT 5,
    p_cooldown_seconds INTEGER DEFAULT 300
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_state public.provider_health_state%ROWTYPE;
    v_failure_count INTEGER;
    v_open BOOLEAN;
BEGIN
    INSERT INTO public.provider_health_events(provider, success, failure_kind)
    VALUES (p_provider, p_success, CASE WHEN p_success THEN NULL ELSE p_failure_kind END);

    INSERT INTO public.provider_health_state(provider)
    VALUES (p_provider) ON CONFLICT (provider) DO NOTHING;

    SELECT * INTO v_state FROM public.provider_health_state
    WHERE provider = p_provider FOR UPDATE;

    IF p_success THEN
        UPDATE public.provider_health_state
        SET status = 'closed', consecutive_failures = 0, opened_until = NULL,
            half_open_since = NULL, last_success_at = NOW(), updated_at = NOW()
        WHERE provider = p_provider;
        RETURN;
    END IF;

    v_failure_count := v_state.consecutive_failures + 1;
    v_open := v_state.status = 'half_open'
        OR p_failure_kind IS NOT DISTINCT FROM 'billing'
        OR v_failure_count >= p_failure_threshold;
    UPDATE public.provider_health_state
    SET consecutive_failures = v_failure_count,
        status = CASE WHEN v_open THEN 'open' ELSE status END,
        opened_until = CASE WHEN v_open THEN NOW() + make_interval(secs => p_cooldown_seconds)
            ELSE opened_until END,
        half_open_since = NULL, last_failure_at = NOW(), updated_at = NOW()
    WHERE provider = p_provider;
END;
$$;

REVOKE ALL ON FUNCTION public.record_provider_health_outcome(TEXT, BOOLEAN, TEXT, INTEGER, INTEGER)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_provider_health_outcome(TEXT, BOOLEAN, TEXT, INTEGER, INTEGER)
  TO service_role;
