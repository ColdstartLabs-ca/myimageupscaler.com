-- The reviewed Jul 18+ shared-identity grant backfill is complete. Remove the
-- temporary SECURITY DEFINER repair entry point while preserving audit rows.

DROP FUNCTION IF EXISTS public.repair_shared_identity_grant(
  UUID, INTEGER, INTEGER, INTEGER, INTEGER, BOOLEAN, TEXT
);
