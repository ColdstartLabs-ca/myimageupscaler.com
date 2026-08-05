-- Harden EXECUTE grants on the provider circuit-breaker functions.
--
-- Same defect 20260802000000_harden_provider_health_alert_grants.sql fixed for the alert
-- claim functions: `REVOKE ALL ... FROM PUBLIC` does not remove the role-specific EXECUTE
-- grants Supabase's bootstrap default privileges hand to `anon` and `authenticated`.
-- Verified in production on 2026-08-05, all three still had `anon=X/postgres,
-- authenticated=X/postgres` despite the FROM PUBLIC revokes in 20260726132000 and
-- 20260805182000.
--
-- Left as-is, any caller holding the publishable anon key could call
-- record_provider_health_outcome to inject failures until the circuit opens, denying image
-- processing for every user, or hold the half-open probe via
-- acquire_provider_circuit_permit. All three are server-only:
-- server/services/provider-health.service.ts calls them through the service role.

REVOKE ALL ON FUNCTION public.acquire_provider_circuit_permit(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.acquire_provider_circuit_permit(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.acquire_provider_circuit_permit(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.acquire_provider_circuit_permit(TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.get_provider_circuit_availability(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_provider_circuit_availability(TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.get_provider_circuit_availability(TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_provider_circuit_availability(TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.record_provider_health_outcome(
    TEXT, BOOLEAN, TEXT, INTEGER, INTEGER
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_provider_health_outcome(
    TEXT, BOOLEAN, TEXT, INTEGER, INTEGER
) FROM anon;
REVOKE ALL ON FUNCTION public.record_provider_health_outcome(
    TEXT, BOOLEAN, TEXT, INTEGER, INTEGER
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.record_provider_health_outcome(
    TEXT, BOOLEAN, TEXT, INTEGER, INTEGER
) TO service_role;

-- release_provider_health_alert_claim is intentionally untouched here; its grants are owned
-- by 20260802000000_harden_provider_health_alert_grants.sql.
