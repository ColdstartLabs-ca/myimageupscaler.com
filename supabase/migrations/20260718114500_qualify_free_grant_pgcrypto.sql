-- Supabase installs pgcrypto functions in the extensions schema. Keep object
-- resolution explicit and constrained for these SECURITY DEFINER functions.
ALTER FUNCTION public.claim_free_credit_grant(UUID, TEXT, TEXT, INTEGER)
  SET search_path = public, extensions;

ALTER FUNCTION public.repair_free_credit_incident_user(
  UUID, INTEGER, INTEGER, INTEGER, INTEGER, TEXT, TEXT
) SET search_path = public, extensions;
