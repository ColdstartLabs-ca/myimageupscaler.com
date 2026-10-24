-- Run with psql -v ON_ERROR_STOP=1 against an isolated database after the migration.
BEGIN;
SET LOCAL ROLE service_role;
INSERT INTO public.seo_lock_auto_entries
  (path, title, description, h1, intro_hash, canonical, robots, hreflang, json_ld_types, clicks_28d)
VALUES ('/test-winner', 'Frozen title', 'Description', 'Heading', repeat('a', 64),
  'https://myimageupscaler.com/test-winner', 'index, follow', '{}', '{WebPage}', 21);
INSERT INTO public.seo_lock_auto_entries
SELECT path, 'Replacement', description, h1, intro_hash, canonical, robots, hreflang, json_ld_types, clicks_28d, added_at
FROM public.seo_lock_auto_entries WHERE path = '/test-winner'
ON CONFLICT (path) DO NOTHING;

DO $$ BEGIN
  IF (SELECT title FROM public.seo_lock_auto_entries WHERE path = '/test-winner') <> 'Frozen title' THEN
    RAISE EXCEPTION 'Duplicate insert replaced the frozen title';
  END IF;
  BEGIN
    UPDATE public.seo_lock_auto_entries SET title = 'Forbidden';
    RAISE EXCEPTION 'Service role could update';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    DELETE FROM public.seo_lock_auto_entries;
    RAISE EXCEPTION 'Service role could delete';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
RESET ROLE;

DO $$
DECLARE statement text;
BEGIN
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.seo_lock_auto_entries'::regclass) THEN
    RAISE EXCEPTION 'RLS disabled';
  END IF;
  IF has_table_privilege('anon', 'public.seo_lock_auto_entries', 'SELECT')
    OR has_table_privilege('authenticated', 'public.seo_lock_auto_entries', 'INSERT') THEN
    RAISE EXCEPTION 'Public lock access granted';
  END IF;
  FOREACH statement IN ARRAY ARRAY[
    'UPDATE public.seo_lock_auto_entries SET title = ''Forbidden''',
    'DELETE FROM public.seo_lock_auto_entries',
    'TRUNCATE public.seo_lock_auto_entries'
  ] LOOP
    BEGIN
      EXECUTE statement;
      RAISE EXCEPTION 'Mutation succeeded: %', statement;
    EXCEPTION WHEN raise_exception THEN
      IF SQLERRM NOT LIKE 'SEO auto locks are append-only%' THEN RAISE; END IF;
    END;
  END LOOP;
  IF (SELECT count(*) FROM public.seo_lock_auto_entries WHERE path = '/test-winner') <> 1 THEN
    RAISE EXCEPTION 'Frozen row lost';
  END IF;
END $$;
ROLLBACK;
