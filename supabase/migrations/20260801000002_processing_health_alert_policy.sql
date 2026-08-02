-- TASK-10: production processing-health alert policy.
--
-- The existing provider circuit breaker remains unchanged. This separate RPC
-- evaluates terminal outcomes using the PRD's 15-minute policy so deployments
-- can adopt the corrected thresholds without changing the circuit semantics.
CREATE OR REPLACE FUNCTION public.claim_provider_health_alert_v2(
    p_provider TEXT,
    p_window_minutes INTEGER DEFAULT 15,
    p_min_attempts INTEGER DEFAULT 20,
    p_warning_ratio NUMERIC DEFAULT 0.05,
    p_critical_ratio NUMERIC DEFAULT 0.10,
    p_baseline_multiplier NUMERIC DEFAULT 3,
    p_alert_cooldown_minutes INTEGER DEFAULT 30
)
RETURNS TABLE(
    should_alert BOOLEAN,
    severity TEXT,
    attempts BIGINT,
    failures BIGINT,
    failure_ratio NUMERIC,
    baseline_ratio NUMERIC,
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
    v_current_start TIMESTAMP WITH TIME ZONE := NOW() - make_interval(mins => p_window_minutes);
    v_previous_start TIMESTAMP WITH TIME ZONE := NOW() - make_interval(mins => p_window_minutes * 2);
    v_baseline_start TIMESTAMP WITH TIME ZONE := NOW() - INTERVAL '7 days';
    v_attempts BIGINT;
    v_failures BIGINT;
    v_previous_attempts BIGINT;
    v_previous_failures BIGINT;
    v_baseline_attempts BIGINT;
    v_baseline_failures BIGINT;
    v_billing_failures BIGINT;
    v_ratio NUMERIC;
    v_previous_ratio NUMERIC;
    v_baseline_ratio NUMERIC;
    v_severity TEXT;
    v_should_alert BOOLEAN;
BEGIN
    IF p_window_minutes <= 0 OR p_min_attempts <= 0
        OR p_warning_ratio < 0 OR p_critical_ratio < p_warning_ratio
        OR p_baseline_multiplier <= 0 OR p_alert_cooldown_minutes < 0 THEN
        RAISE EXCEPTION 'Invalid provider health alert policy';
    END IF;

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
      AND created_at >= v_current_start;

    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE success = FALSE)
    INTO v_previous_attempts, v_previous_failures
    FROM public.provider_health_events
    WHERE provider = p_provider
      AND created_at >= v_previous_start
      AND created_at < v_current_start;

    SELECT
        COUNT(*),
        COUNT(*) FILTER (WHERE success = FALSE)
    INTO v_baseline_attempts, v_baseline_failures
    FROM public.provider_health_events
    WHERE provider = p_provider
      AND created_at >= v_baseline_start
      AND created_at < v_previous_start;

    v_ratio := CASE
        WHEN v_attempts = 0 THEN 0
        ELSE v_failures::NUMERIC / v_attempts::NUMERIC
    END;
    v_previous_ratio := CASE
        WHEN v_previous_attempts = 0 THEN 0
        ELSE v_previous_failures::NUMERIC / v_previous_attempts::NUMERIC
    END;
    v_baseline_ratio := CASE
        WHEN v_baseline_attempts = 0 THEN NULL
        ELSE v_baseline_failures::NUMERIC / v_baseline_attempts::NUMERIC
    END;

    IF v_attempts >= p_min_attempts AND (
        v_ratio >= p_critical_ratio
        OR (
            v_baseline_ratio IS NOT NULL
            AND v_baseline_ratio > 0
            AND v_ratio >= v_baseline_ratio * p_baseline_multiplier
        )
        OR (v_baseline_ratio = 0 AND v_failures > 0)
    ) THEN
        v_severity := 'critical';
    ELSIF v_attempts >= p_min_attempts
        AND v_ratio >= p_warning_ratio
        AND v_previous_attempts >= p_min_attempts
        AND v_previous_ratio >= p_warning_ratio THEN
        v_severity := 'warning';
    ELSE
        v_severity := NULL;
    END IF;

    SELECT * INTO v_state
    FROM public.provider_health_state
    WHERE provider = p_provider
    FOR UPDATE;

    v_should_alert := v_severity IS NOT NULL
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
    WHERE created_at < NOW() - INTERVAL '8 days';

    RETURN QUERY SELECT
        v_should_alert,
        CASE WHEN v_should_alert THEN v_severity ELSE NULL END,
        v_attempts,
        v_failures,
        v_ratio,
        v_baseline_ratio,
        v_billing_failures,
        v_state.status,
        v_state.opened_until;
END;
$$;

REVOKE ALL ON FUNCTION public.claim_provider_health_alert_v2(
    TEXT, INTEGER, INTEGER, NUMERIC, NUMERIC, NUMERIC, INTEGER
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.claim_provider_health_alert_v2(
    TEXT, INTEGER, INTEGER, NUMERIC, NUMERIC, NUMERIC, INTEGER
) TO service_role;
