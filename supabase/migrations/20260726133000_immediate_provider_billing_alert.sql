-- Replicate does not expose account balance through its public API. Treat the
-- provider's billing failure signal as an immediate operational warning while
-- retaining the provider-agnostic rolling failure-rate alert.
CREATE OR REPLACE FUNCTION public.claim_provider_health_alert(
    p_provider TEXT,
    p_window_minutes INTEGER DEFAULT 10,
    p_min_attempts INTEGER DEFAULT 5,
    p_failure_ratio NUMERIC DEFAULT 0.5,
    p_alert_cooldown_minutes INTEGER DEFAULT 30
)
RETURNS TABLE(
    should_alert BOOLEAN,
    attempts BIGINT,
    failures BIGINT,
    failure_ratio NUMERIC,
    billing_failures BIGINT,
    circuit_status TEXT,
    retry_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_state public.provider_health_state%ROWTYPE;
    v_attempts BIGINT;
    v_failures BIGINT;
    v_billing_failures BIGINT;
    v_ratio NUMERIC;
    v_should_alert BOOLEAN;
BEGIN
    INSERT INTO public.provider_health_state(provider)
    VALUES (p_provider)
    ON CONFLICT (provider) DO NOTHING;

    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE success = FALSE),
        COUNT(*) FILTER (WHERE success = FALSE AND failure_kind = 'billing')
    INTO v_attempts, v_failures, v_billing_failures
    FROM public.provider_health_events
    WHERE provider = p_provider
      AND created_at >= NOW() - make_interval(mins => p_window_minutes);

    v_ratio := CASE
        WHEN v_attempts = 0 THEN 0
        ELSE v_failures::NUMERIC / v_attempts::NUMERIC
    END;

    SELECT * INTO v_state
    FROM public.provider_health_state
    WHERE provider = p_provider
    FOR UPDATE;

    v_should_alert :=
        (
            v_billing_failures > 0
            OR (
                v_attempts >= p_min_attempts
                AND v_ratio >= p_failure_ratio
            )
        )
        AND (
            v_state.last_alerted_at IS NULL
            OR v_state.last_alerted_at
                < NOW() - make_interval(mins => p_alert_cooldown_minutes)
        );

    IF v_should_alert THEN
        UPDATE public.provider_health_state
        SET last_alerted_at = NOW(), updated_at = NOW()
        WHERE provider = p_provider;
    END IF;

    DELETE FROM public.provider_health_events
    WHERE created_at < NOW() - INTERVAL '24 hours';

    RETURN QUERY SELECT
        v_should_alert,
        v_attempts,
        v_failures,
        v_ratio,
        v_billing_failures,
        v_state.status,
        v_state.opened_until;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_provider_health_alert(TEXT, INTEGER, INTEGER, NUMERIC, INTEGER)
    FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_provider_health_alert(TEXT, INTEGER, INTEGER, NUMERIC, INTEGER)
    TO service_role;
