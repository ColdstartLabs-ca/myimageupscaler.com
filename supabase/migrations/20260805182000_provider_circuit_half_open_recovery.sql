-- Make the half-open probe time-bounded so an abandoned probe cannot deadlock the circuit.
--
-- Incident 2026-08-05: `image-processing` sat at status='half_open' for 6.5h with zero
-- provider_health_events rows. The probe holder (a Cloudflare Worker) disappeared before
-- calling record_provider_health_outcome, and `half_open` had no expiry: both
-- acquire_provider_circuit_permit and get_provider_circuit_availability rejected every
-- caller for ANY half_open, so no request could ever become the next probe. Only a manual
-- DB write recovered it.
--
-- Fix: track when the probe started in a dedicated column and treat a probe older than the
-- timeout (or one with no start timestamp at all) as abandoned, handing the permit to the
-- next caller.

ALTER TABLE public.provider_health_state
    ADD COLUMN IF NOT EXISTS half_open_since TIMESTAMP WITH TIME ZONE;

COMMENT ON COLUMN public.provider_health_state.half_open_since IS
    'When the current half-open probe was handed out. NULL means no probe is in flight. '
    'A probe older than the 180s timeout (or a legacy half_open row with NULL here) is '
    'treated as abandoned so the next caller can become the probe. Deliberately separate '
    'from updated_at, which claim_provider_health_alert / release_provider_health_alert_claim '
    'bump for unrelated reasons and would otherwise keep a dead probe alive forever.';

-- The 180s probe timeout is hardcoded in the function bodies below rather than exposed as a
-- parameter: adding a defaulted argument would create an overload alongside the existing
-- 1-arg signature and make every current call ambiguous at runtime.
-- It must exceed PROCESSING_TIMEOUT_MS = 120000 in app/api/upscale/route.ts (the route's
-- per-attempt provider timeout) so a legitimately slow probe is never treated as abandoned.

CREATE OR REPLACE FUNCTION public.acquire_provider_circuit_permit(p_provider TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_state public.provider_health_state%ROWTYPE;
BEGIN
    INSERT INTO public.provider_health_state(provider)
    VALUES (p_provider)
    ON CONFLICT (provider) DO NOTHING;

    SELECT * INTO v_state
    FROM public.provider_health_state
    WHERE provider = p_provider
    FOR UPDATE;

    -- A probe is genuinely in flight: 180s must exceed PROCESSING_TIMEOUT_MS = 120000
    -- in app/api/upscale/route.ts.
    IF v_state.status = 'half_open'
        AND v_state.half_open_since IS NOT NULL
        AND v_state.half_open_since > NOW() - INTERVAL '180 seconds'
    THEN
        RETURN FALSE;
    END IF;

    IF v_state.status = 'open' AND v_state.opened_until > NOW() THEN
        RETURN FALSE;
    END IF;

    -- Either the open cooldown expired, or the previous probe was abandoned. Hand the
    -- permit to exactly one caller (the FOR UPDATE lock serializes the rest).
    IF v_state.status IN ('open', 'half_open') THEN
        UPDATE public.provider_health_state
        SET status = 'half_open', half_open_since = NOW(), updated_at = NOW()
        WHERE provider = p_provider;
    END IF;

    RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_provider_circuit_availability(p_provider TEXT)
RETURNS TABLE(
    available BOOLEAN,
    circuit_status TEXT,
    retry_at TIMESTAMP WITH TIME ZONE
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
    SELECT
        -- Only a fresh in-flight probe blocks callers; a stale half_open reports available
        -- so the next request can become the probe. 180s must exceed
        -- PROCESSING_TIMEOUT_MS = 120000 in app/api/upscale/route.ts.
        CASE
            WHEN state.status = 'half_open'
                AND state.half_open_since IS NOT NULL
                AND state.half_open_since > NOW() - INTERVAL '180 seconds' THEN FALSE
            WHEN state.status = 'open' AND state.opened_until > NOW() THEN FALSE
            ELSE TRUE
        END,
        CASE
            WHEN state.status = 'open' AND state.opened_until <= NOW() THEN 'half_open'
            ELSE state.status
        END,
        CASE
            WHEN state.status = 'open' AND state.opened_until > NOW() THEN state.opened_until
            WHEN state.status = 'half_open'
                AND state.half_open_since IS NOT NULL
                AND state.half_open_since > NOW() - INTERVAL '180 seconds'
                THEN state.half_open_since + INTERVAL '180 seconds'
            ELSE NULL
        END
    FROM public.provider_health_state AS state
    WHERE state.provider = p_provider
    UNION ALL
    SELECT TRUE, 'closed', NULL::TIMESTAMP WITH TIME ZONE
    WHERE NOT EXISTS (
        SELECT 1 FROM public.provider_health_state WHERE provider = p_provider
    )
    LIMIT 1;
$$;

-- Unchanged thresholds and cooldown behaviour; the probe is over either way, so both
-- branches clear half_open_since.
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
BEGIN
    INSERT INTO public.provider_health_events(provider, success, failure_kind)
    VALUES (p_provider, p_success, CASE WHEN p_success THEN NULL ELSE p_failure_kind END);

    INSERT INTO public.provider_health_state(provider)
    VALUES (p_provider)
    ON CONFLICT (provider) DO NOTHING;

    SELECT * INTO v_state
    FROM public.provider_health_state
    WHERE provider = p_provider
    FOR UPDATE;

    IF p_success THEN
        UPDATE public.provider_health_state
        SET
            status = 'closed',
            consecutive_failures = 0,
            opened_until = NULL,
            half_open_since = NULL,
            last_success_at = NOW(),
            updated_at = NOW()
        WHERE provider = p_provider;
        RETURN;
    END IF;

    v_failure_count := v_state.consecutive_failures + 1;
    UPDATE public.provider_health_state
    SET
        consecutive_failures = v_failure_count,
        status = CASE
            WHEN v_state.status = 'half_open' OR v_failure_count >= p_failure_threshold
                THEN 'open'
            ELSE status
        END,
        opened_until = CASE
            WHEN v_state.status = 'half_open' OR v_failure_count >= p_failure_threshold
                THEN NOW() + make_interval(secs => p_cooldown_seconds)
            ELSE opened_until
        END,
        half_open_since = NULL,
        last_failure_at = NOW(),
        updated_at = NOW()
    WHERE provider = p_provider;
END;
$$;

-- CREATE OR REPLACE preserves existing ACLs; re-assert them to match
-- 20260726132000_provider_health_circuit.sql. The alert-claim hardening in
-- 20260802000000_harden_provider_health_alert_grants.sql is untouched.
REVOKE ALL ON FUNCTION public.get_provider_circuit_availability(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.acquire_provider_circuit_permit(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_provider_health_outcome(TEXT, BOOLEAN, TEXT, INTEGER, INTEGER)
    FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_provider_circuit_availability(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.acquire_provider_circuit_permit(TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION public.record_provider_health_outcome(TEXT, BOOLEAN, TEXT, INTEGER, INTEGER)
    TO service_role;
