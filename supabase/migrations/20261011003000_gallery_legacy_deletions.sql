-- Legacy user/account deletions retain an exact native source reference until the
-- operator proves atomic source deletion. The same path identifies any R2 saved/
-- mirror; the gated cleanup must handle both stores after checking current references.
CREATE TABLE public.gallery_legacy_deletions (
  image_id UUID PRIMARY KEY,
  user_id UUID NOT NULL,
  storage_path TEXT NOT NULL,
  image_snapshot JSONB NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.gallery_legacy_deletions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.gallery_legacy_deletions FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.gallery_legacy_deletions TO service_role;
CREATE POLICY service_read ON public.gallery_legacy_deletions
  FOR SELECT TO service_role USING (true);
COMMENT ON TABLE public.gallery_legacy_deletions IS
  'Pending Supabase source and possible R2 mirror cleanup. Survives gallery/account deletion; no storage deletion is performed here.';

CREATE FUNCTION public.capture_legacy_gallery_deletion()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
SET TimeZone = 'UTC'
AS $$
BEGIN
  INSERT INTO public.gallery_legacy_deletions(image_id, user_id, storage_path, image_snapshot)
  VALUES (OLD.id, OLD.user_id, OLD.storage_path, to_jsonb(OLD));
  RETURN OLD;
END;
$$;
REVOKE ALL ON FUNCTION public.capture_legacy_gallery_deletion() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER capture_legacy_gallery_deletion
  AFTER DELETE ON public.saved_images
  FOR EACH ROW WHEN (OLD.storage_backend = 'supabase')
  EXECUTE FUNCTION public.capture_legacy_gallery_deletion();

CREATE FUNCTION public.delete_legacy_gallery_image(p_user_id UUID, p_image_id UUID, p_storage_path TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
SET TimeZone = 'UTC'
SET lock_timeout = '2s'
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.saved_images
  WHERE id = p_image_id AND user_id = p_user_id
    AND storage_path = p_storage_path AND storage_backend = 'supabase';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted = 1;
END;
$$;
REVOKE ALL ON FUNCTION public.delete_legacy_gallery_image(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_legacy_gallery_image(UUID, UUID, TEXT) TO service_role;
