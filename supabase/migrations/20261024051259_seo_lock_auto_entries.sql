CREATE TABLE public.seo_lock_auto_entries (
  path text PRIMARY KEY CHECK (path ~ '^/([^/?#]+(/[^/?#]+)*)?$'),
  title text NOT NULL,
  description text NOT NULL,
  h1 text NOT NULL,
  intro_hash text NOT NULL CHECK (intro_hash ~ '^[0-9a-f]{64}$'),
  canonical text NOT NULL,
  robots text NOT NULL,
  hreflang text[] NOT NULL,
  json_ld_types text[] NOT NULL,
  clicks_28d integer NOT NULL CHECK (clicks_28d > 20),
  added_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.seo_lock_auto_entries ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.seo_lock_auto_entries FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.seo_lock_auto_entries TO service_role;

CREATE FUNCTION public.reject_seo_lock_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'SEO auto locks are append-only; override with a signed JSON entry';
END;
$$;

CREATE TRIGGER seo_lock_auto_entries_frozen
BEFORE UPDATE OR DELETE ON public.seo_lock_auto_entries
FOR EACH ROW EXECUTE FUNCTION public.reject_seo_lock_mutation();

CREATE TRIGGER seo_lock_auto_entries_no_truncate
BEFORE TRUNCATE ON public.seo_lock_auto_entries
FOR EACH STATEMENT EXECUTE FUNCTION public.reject_seo_lock_mutation();
