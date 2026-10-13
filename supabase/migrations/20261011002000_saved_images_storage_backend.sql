-- R2 cutover safety (PRD-SQR-02, 2026-10-11 correction): track the storage
-- backend of every saved gallery image.
--
-- An old deployment can still complete a `saved_images` insert after the final R2
-- inventory copy and after the new code deploys. Such a row has no backend, so
-- the column defaults to `supabase` and the legacy row keeps reading its original
-- Supabase Storage object. New R2 writes insert `storage_backend = 'r2'`.
--
-- The operator migration flips a row to `r2` only after full hash proof and an
-- exact native row CAS. This migration never rewrites an existing row, never
-- touches storage, and is safe to apply before the operator backfill.
--
-- The CHECK keeps every value in the known set, so an unexpected backend fails
-- closed in the database as well as in application code.

ALTER TABLE public.saved_images
  ADD COLUMN IF NOT EXISTS storage_backend TEXT NOT NULL DEFAULT 'supabase'
  CHECK (storage_backend IN ('supabase', 'r2'));

COMMENT ON COLUMN public.saved_images.storage_backend IS
  'Object store holding the image bytes: legacy Supabase Storage (supabase) or migrated R2 (r2).';
