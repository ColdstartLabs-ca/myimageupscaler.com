-- State a schema-only backup lacks. Everything here mirrors a committed migration; nothing
-- is copied from production (the salt is random per database).

-- Triggers on the Supabase-managed auth schema are outside a public-schema backup.
-- supabase/migrations/20250121000300_fix_initial_credits.sql (the only trigger on auth.users);
-- the function itself comes from the backup.
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- claim_free_credit_grant raises without this singleton row.
-- supabase/migrations/20260718021253_free_tier_credit_grants.sql
INSERT INTO private.free_credit_grant_config (singleton, salt)
VALUES (
  true,
  replace(gen_random_uuid()::TEXT, '-', '') || replace(gen_random_uuid()::TEXT, '-', '')
)
ON CONFLICT (singleton) DO NOTHING;
