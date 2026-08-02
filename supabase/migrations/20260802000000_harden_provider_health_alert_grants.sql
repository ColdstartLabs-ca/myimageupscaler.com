-- Harden EXECUTE grants on the provider health alert claim functions.
--
-- `REVOKE ALL ... FROM PUBLIC` does not remove the role-specific EXECUTE grants
-- Supabase's bootstrap default privileges hand to `anon` and `authenticated`.
-- Verified in production: claim_provider_health_alert (v1) has proacl
-- `anon=X/postgres, authenticated=X/postgres` despite its FROM PUBLIC revoke.
--
-- Left as-is, any caller holding the publishable anon key could claim an alert
-- and suppress genuine outage notifications for the cooldown window, and drive
-- the unbounded retention DELETE. Both functions are server-only:
-- server/services/provider-health.service.ts calls v2 through the service role.
--
-- Matches the hardened pattern in 20260722193411_create_shared_identity_repair_rpc.sql.

REVOKE ALL ON FUNCTION public.claim_provider_health_alert_v2(
    TEXT, INTEGER, INTEGER, NUMERIC, NUMERIC, NUMERIC, INTEGER
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_provider_health_alert_v2(
    TEXT, INTEGER, INTEGER, NUMERIC, NUMERIC, NUMERIC, INTEGER
) FROM anon;
REVOKE ALL ON FUNCTION public.claim_provider_health_alert_v2(
    TEXT, INTEGER, INTEGER, NUMERIC, NUMERIC, NUMERIC, INTEGER
) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_provider_health_alert_v2(
    TEXT, INTEGER, INTEGER, NUMERIC, NUMERIC, NUMERIC, INTEGER
) TO service_role;

-- v1 remains installed and is no longer called by application code. Revoke the
-- inherited grants so it cannot be used to wipe the v2 baseline via its 24h DELETE.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'claim_provider_health_alert'
  ) THEN
    REVOKE ALL ON FUNCTION public.claim_provider_health_alert(
        TEXT, INTEGER, INTEGER, NUMERIC, INTEGER
    ) FROM PUBLIC;
    REVOKE ALL ON FUNCTION public.claim_provider_health_alert(
        TEXT, INTEGER, INTEGER, NUMERIC, INTEGER
    ) FROM anon;
    REVOKE ALL ON FUNCTION public.claim_provider_health_alert(
        TEXT, INTEGER, INTEGER, NUMERIC, INTEGER
    ) FROM authenticated;
    GRANT EXECUTE ON FUNCTION public.claim_provider_health_alert(
        TEXT, INTEGER, INTEGER, NUMERIC, INTEGER
    ) TO service_role;
  END IF;
END $$;
