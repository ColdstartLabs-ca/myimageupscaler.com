-- PRD-SQR-04 verified-backup gate (registry + claim/recover/finish/release RPCs).
--
-- Free-gallery expiry may only delete an image after an operator backup job has
-- independently verified a copy on both machines. This migration stores that
-- proof as a service-role-only journal and exposes the RPCs the operator job and
-- cleanup worker call. Nothing here touches storage: the caller copies and
-- verifies objects, then records the result. No automatic archive purge.
--
-- The registry has no foreign key to saved_images on purpose: the journal row
-- must survive the row it authorizes deleting, so an absent image can complete
-- the claim without erasing the audit trail. The only FK is to auth.users, so a
-- deleted account still cascades its proofs away.
--
-- Authoritative dependencies (owned by 20261010235000_gallery_expiry_warning.sql):
--   public.gallery_expiry_activity_anchor(uuid)
--   public.gallery_expiry_notices(user_id, activity_anchor, warning_sent_at)

CREATE TABLE IF NOT EXISTS public.gallery_expiry_backups (
  image_id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  storage_path TEXT NOT NULL,
  saved_row JSONB NOT NULL,
  sha256 TEXT NOT NULL,
  size_bytes BIGINT NOT NULL,
  source_etag TEXT NOT NULL,
  archive_key TEXT NOT NULL,
  archive_etag TEXT NOT NULL,
  backup_run_id TEXT NOT NULL,
  manifest_sha256 TEXT NOT NULL,
  local_verified_at TIMESTAMPTZ NOT NULL,
  remote_verified_at TIMESTAMPTZ NOT NULL,
  registered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  state TEXT NOT NULL DEFAULT 'ready' CHECK (state IN ('ready', 'deleting', 'completed')),
  attempt_id UUID,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  CONSTRAINT gallery_expiry_backups_snapshot_matches
    CHECK (
      jsonb_typeof(saved_row) = 'object'
      AND saved_row ->> 'id' IS NOT NULL
      AND saved_row ->> 'user_id' IS NOT NULL
      AND saved_row ->> 'storage_path' IS NOT NULL
      AND saved_row ->> 'storage_backend' IS NOT NULL
      AND saved_row ->> 'id' = image_id::text
      AND saved_row ->> 'user_id' = user_id::text
      AND saved_row ->> 'storage_path' = storage_path
      AND saved_row ->> 'storage_backend' = 'r2'
    ),
  CONSTRAINT gallery_expiry_backups_source_path_safe
    CHECK (
      storage_path <> ''
      AND left(storage_path, 1) <> '/'
      AND position('..' in storage_path) = 0
    ),
  CONSTRAINT gallery_expiry_backups_sha256_format
    CHECK (sha256 ~ '^[0-9a-f]{64}$'),
  CONSTRAINT gallery_expiry_backups_size_positive
    CHECK (size_bytes > 0),
  CONSTRAINT gallery_expiry_backups_archive_key_exact
    CHECK (archive_key = 'archive/gallery/' || image_id::text || '/' || sha256),
  CONSTRAINT gallery_expiry_backups_source_etag_format
    CHECK (
      source_etag ~ '^"[^"]+"$'
      AND char_length(source_etag) <= 130
      AND source_etag !~ '[[:cntrl:]]'
    ),
  CONSTRAINT gallery_expiry_backups_archive_etag_format
    CHECK (
      archive_etag ~ '^"[^"]+"$'
      AND char_length(archive_etag) <= 130
      AND archive_etag !~ '[[:cntrl:]]'
    ),
  CONSTRAINT gallery_expiry_backups_run_id_safe
    CHECK (
      backup_run_id <> ''
      AND backup_run_id !~ '[/\\]'
      AND position('..' in backup_run_id) = 0
    ),
  CONSTRAINT gallery_expiry_backups_manifest_sha256_format
    CHECK (manifest_sha256 ~ '^[0-9a-f]{64}$')
);

ALTER TABLE public.gallery_expiry_backups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages gallery expiry backups"
  ON public.gallery_expiry_backups;
CREATE POLICY "Service role manages gallery expiry backups"
  ON public.gallery_expiry_backups FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

REVOKE ALL ON TABLE public.gallery_expiry_backups FROM PUBLIC;
REVOKE ALL ON TABLE public.gallery_expiry_backups FROM anon;
REVOKE ALL ON TABLE public.gallery_expiry_backups FROM authenticated;
REVOKE ALL ON TABLE public.gallery_expiry_backups FROM service_role;
GRANT SELECT, INSERT, UPDATE ON TABLE public.gallery_expiry_backups TO service_role;

-- Single source of truth for "this image may expire". Both claim and finish call
-- it so the eligibility predicate cannot drift. The RPC gate (not a CHECK, which
-- cannot use now()) rejects proofs dated in the future.
CREATE OR REPLACE FUNCTION public.gallery_expiry_backup_is_claimable(p_image_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.gallery_expiry_backups AS b
    JOIN public.saved_images AS si
      ON si.id = b.image_id
     AND si.user_id = b.user_id
     AND si.storage_path = b.storage_path
     AND to_jsonb(si) = b.saved_row
     AND to_jsonb(si)->>'storage_backend' = 'r2'
    JOIN public.profiles AS p ON p.id = b.user_id
    WHERE b.image_id = p_image_id
      AND b.local_verified_at <= now()
      AND b.remote_verified_at <= now()
      AND b.local_verified_at >= now() - INTERVAL '24 hours'
      AND b.remote_verified_at >= now() - INTERVAL '24 hours'
      AND public.gallery_expiry_activity_anchor(b.user_id) <= now() - INTERVAL '30 days'
      AND (p.subscription_tier IS NULL OR p.subscription_tier = 'free')
      AND COALESCE(p.subscription_status, '') NOT IN ('active', 'trialing')
      AND NOT EXISTS (
        SELECT 1 FROM public.subscriptions AS s
        WHERE s.user_id = b.user_id AND s.status IN ('active', 'trialing')
      )
      AND COALESCE(p.purchased_credits_balance, 0) = 0
      AND NOT EXISTS (
        SELECT 1 FROM public.credit_transactions AS ct
        WHERE ct.user_id = b.user_id
          AND ct.amount > 0
          AND ct.type IN ('purchase', 'subscription')
      )
      AND EXISTS (
        SELECT 1 FROM public.gallery_expiry_notices AS n
        WHERE n.user_id = b.user_id
          AND n.activity_anchor = public.gallery_expiry_activity_anchor(b.user_id)
          AND n.warning_sent_at IS NOT NULL
          AND n.warning_sent_at <= now() - INTERVAL '7 days'
      )
  );
$$;

REVOKE ALL ON FUNCTION public.gallery_expiry_backup_is_claimable(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gallery_expiry_backup_is_claimable(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.gallery_expiry_backup_is_claimable(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.gallery_expiry_backup_is_claimable(UUID) TO service_role;

-- Claim up to 10 ready, fully eligible images for expiry. Rows are locked with
-- SKIP LOCKED so parallel workers never claim the same image. The claim flips the
-- row to deleting and stamps an attempt id before the caller does any storage
-- work; a crashed attempt is later re-leased by recover_gallery_expiry_images.
CREATE OR REPLACE FUNCTION public.claim_gallery_expiry_images(p_limit INTEGER)
RETURNS SETOF public.gallery_expiry_backups
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH bounded AS (
    SELECT GREATEST(1, LEAST(COALESCE(p_limit, 1), 10)) AS n
  ),
  picked AS (
    SELECT b.image_id
    FROM public.gallery_expiry_backups AS b, bounded
    WHERE b.state = 'ready'
      AND public.gallery_expiry_backup_is_claimable(b.image_id)
    ORDER BY b.registered_at ASC, b.image_id ASC
    LIMIT (SELECT n FROM bounded)
    FOR UPDATE OF b SKIP LOCKED
  )
  UPDATE public.gallery_expiry_backups AS b
  SET state = 'deleting',
      attempt_id = gen_random_uuid(),
      started_at = now()
  FROM picked
  WHERE b.image_id = picked.image_id
  RETURNING b.*;
$$;

REVOKE ALL ON FUNCTION public.claim_gallery_expiry_images(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_gallery_expiry_images(INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.claim_gallery_expiry_images(INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_gallery_expiry_images(INTEGER) TO service_role;

-- Re-lease crashed claims (deleting for at least 5 minutes). Recovery applies no
-- eligibility or proof-age filter: a user may have become active or paid while a
-- worker died, and the caller must still restore that image. finish re-checks and
-- will return restore_required for such a row.
CREATE OR REPLACE FUNCTION public.recover_gallery_expiry_images(p_limit INTEGER)
RETURNS SETOF public.gallery_expiry_backups
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH bounded AS (
    SELECT GREATEST(1, LEAST(COALESCE(p_limit, 1), 10)) AS n
  ),
  picked AS (
    SELECT b.image_id
    FROM public.gallery_expiry_backups AS b, bounded
    WHERE b.state = 'deleting'
      AND b.started_at <= now() - INTERVAL '5 minutes'
    ORDER BY b.started_at ASC, b.image_id ASC
    LIMIT (SELECT n FROM bounded)
    FOR UPDATE OF b SKIP LOCKED
  )
  UPDATE public.gallery_expiry_backups AS b
  SET started_at = now(),
      attempt_id = gen_random_uuid()
  FROM picked
  WHERE b.image_id = picked.image_id
  RETURNING b.*;
$$;

REVOKE ALL ON FUNCTION public.recover_gallery_expiry_images(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.recover_gallery_expiry_images(INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.recover_gallery_expiry_images(INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.recover_gallery_expiry_images(INTEGER) TO service_role;

-- Finalize one claimed image. SHARE ROW EXCLUSIVE on every table the eligibility
-- predicate reads blocks concurrent writers, so the re-check and the row delete
-- are atomic. lock_timeout keeps a hot writer from stalling the worker forever.
-- The delete is always by exact image id, owner and path: never by user id.
CREATE OR REPLACE FUNCTION public.finish_gallery_expiry_image(
  p_image_id UUID,
  p_attempt_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_row public.gallery_expiry_backups%ROWTYPE;
  v_deleted INTEGER;
BEGIN
  -- Fail closed on anything but READ COMMITTED. The eligibility re-check and the
  -- DELETE below must observe the latest committed plan/activity rows. Under
  -- REPEATABLE READ or SERIALIZABLE the snapshot freezes at the first statement,
  -- so a user who paid or became active after the claim could be deleted using
  -- stale data. Detect and refuse here, before any lock is taken.
  IF current_setting('transaction_isolation') <> 'read committed' THEN
    RAISE EXCEPTION
      'finish_gallery_expiry_image requires READ COMMITTED isolation, got %', current_setting('transaction_isolation')
      USING ERRCODE = 'feature_not_supported';
  END IF;

  SET LOCAL lock_timeout = '2s';

  LOCK TABLE auth.users, auth.sessions, public.profiles, public.subscriptions,
    public.credit_transactions, public.saved_images,
    public.processing_credit_reservations IN SHARE ROW EXCLUSIVE MODE;

  SELECT * INTO v_row
  FROM public.gallery_expiry_backups AS b
  WHERE b.image_id = p_image_id AND b.attempt_id = p_attempt_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 'restore_required';
  END IF;

  IF v_row.state = 'completed' THEN
    RETURN 'completed';
  END IF;

  IF v_row.state <> 'deleting' THEN
    RETURN 'restore_required';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.saved_images AS si WHERE si.id = p_image_id) THEN
    UPDATE public.gallery_expiry_backups AS b
    SET state = 'completed', completed_at = now()
    WHERE b.image_id = p_image_id AND b.attempt_id = p_attempt_id;
    RETURN 'completed';
  END IF;

  IF NOT public.gallery_expiry_backup_is_claimable(p_image_id) THEN
    RETURN 'restore_required';
  END IF;

  DELETE FROM public.saved_images AS si
  WHERE si.id = p_image_id
    AND si.user_id = v_row.user_id
    AND si.storage_path = v_row.storage_path;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF v_deleted <> 1 THEN
    RETURN 'restore_required';
  END IF;

  UPDATE public.gallery_expiry_backups AS b
  SET state = 'completed', completed_at = now()
  WHERE b.image_id = p_image_id AND b.attempt_id = p_attempt_id;

  RETURN 'completed';
END;
$$;

REVOKE ALL ON FUNCTION public.finish_gallery_expiry_image(UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finish_gallery_expiry_image(UUID, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.finish_gallery_expiry_image(UUID, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finish_gallery_expiry_image(UUID, UUID) TO service_role;

-- Release a claim after the caller restored the image from its immutable archive.
-- Only the matching deleting attempt may release; the verification timestamps are
-- not refreshed, so the proof keeps its original age. The new source ETag is the
-- restored object's identity.
CREATE OR REPLACE FUNCTION public.release_gallery_expiry_image(
  p_image_id UUID,
  p_attempt_id UUID,
  p_source_etag TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_updated INTEGER;
BEGIN
  UPDATE public.gallery_expiry_backups AS b
  SET state = 'ready',
      source_etag = p_source_etag,
      attempt_id = NULL,
      started_at = NULL
  WHERE b.image_id = p_image_id
    AND b.attempt_id = p_attempt_id
    AND b.state = 'deleting';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated = 1;
END;
$$;

REVOKE ALL ON FUNCTION public.release_gallery_expiry_image(UUID, UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.release_gallery_expiry_image(UUID, UUID, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.release_gallery_expiry_image(UUID, UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.release_gallery_expiry_image(UUID, UUID, TEXT) TO service_role;
