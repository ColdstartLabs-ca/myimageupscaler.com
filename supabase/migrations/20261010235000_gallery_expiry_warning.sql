-- PRD-SQR-04 Phase 2 (warning eligibility + dedup only).
--
-- Adds the permanent warning ledger and the service_role-only RPCs that pick
-- eligible warning candidates and cancel stale pending warnings. Nothing here
-- deletes rows or storage objects. The delivery trigger copies the first real
-- sent_at from email_lifecycle_queue onto gallery_expiry_notices so queue
-- retention can prune the queue without erasing delivery proof.

CREATE TABLE IF NOT EXISTS public.gallery_expiry_notices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  activity_anchor TIMESTAMPTZ NOT NULL,
  queue_id UUID NULL REFERENCES public.email_lifecycle_queue(id) ON DELETE SET NULL,
  warning_sent_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT gallery_expiry_notices_user_anchor_unique UNIQUE (user_id, activity_anchor)
);

ALTER TABLE public.gallery_expiry_notices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role manages gallery expiry notices"
  ON public.gallery_expiry_notices;
CREATE POLICY "Service role manages gallery expiry notices"
  ON public.gallery_expiry_notices FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS on_gallery_expiry_notices_updated ON public.gallery_expiry_notices;
CREATE TRIGGER on_gallery_expiry_notices_updated
  BEFORE UPDATE ON public.gallery_expiry_notices
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

REVOKE ALL ON TABLE public.gallery_expiry_notices FROM PUBLIC;
REVOKE ALL ON TABLE public.gallery_expiry_notices FROM anon;
REVOKE ALL ON TABLE public.gallery_expiry_notices FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.gallery_expiry_notices TO service_role;

-- Inactivity anchor: the newest real activity signal for a user. GREATEST ignores
-- NULLs, so a null last_sign_in_at falls back to the other signals.
--
-- Production verified shape: auth.sessions.refreshed_at is TIMESTAMP WITHOUT TIME
-- ZONE while created_at/updated_at are TIMESTAMPTZ. Supabase writes refreshed_at
-- as UTC wall-clock, so interpret the naive value as UTC explicitly. A plain
-- implicit cast would read it in the current session TimeZone and shift the anchor.
CREATE OR REPLACE FUNCTION public.gallery_expiry_activity_anchor(p_user_id UUID)
RETURNS TIMESTAMPTZ
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT GREATEST(
    u.created_at,
    u.last_sign_in_at,
    (SELECT max(s.created_at) FROM auth.sessions AS s WHERE s.user_id = p_user_id),
    (SELECT max(s.updated_at) FROM auth.sessions AS s WHERE s.user_id = p_user_id),
    (SELECT max(s.refreshed_at AT TIME ZONE 'UTC') FROM auth.sessions AS s WHERE s.user_id = p_user_id),
    (SELECT max(si.created_at) FROM public.saved_images AS si WHERE si.user_id = p_user_id),
    (SELECT max(r.created_at) FROM public.processing_credit_reservations AS r WHERE r.user_id = p_user_id)
  )
  FROM auth.users AS u
  WHERE u.id = p_user_id;
$$;

REVOKE ALL ON FUNCTION public.gallery_expiry_activity_anchor(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.gallery_expiry_activity_anchor(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.gallery_expiry_activity_anchor(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.gallery_expiry_activity_anchor(UUID) TO service_role;

-- Eligible warning candidates: free users with no active/trialing plan, no positive
-- purchase or subscription transaction, and at least 23 days of inactivity. A user is
-- dropped after a real delivery and, critically, while its notice already has a live
-- linked queue row (pending or sent). Without that second skip, up to 50 undelivered
-- pending rows (deferred by frequency caps) would consume every scan forever and hide
-- newer eligible users. Recovery still works: a notice with no linked row (crash
-- between notice and queue insert), a lost link (queue row exists but notice.queue_id
-- is null), and a failed-unsent row all stay candidates so the service can relink or
-- re-enqueue them.
CREATE OR REPLACE FUNCTION public.get_gallery_expiry_warning_candidates(p_limit INTEGER)
RETURNS TABLE (user_id UUID, activity_anchor TIMESTAMPTZ)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  WITH bounded AS (
    SELECT GREATEST(1, LEAST(COALESCE(p_limit, 1), 50)) AS n
  )
  SELECT p.id AS user_id,
         public.gallery_expiry_activity_anchor(p.id) AS activity_anchor
  FROM public.profiles AS p, bounded
  WHERE (p.subscription_tier IS NULL OR p.subscription_tier = 'free')
    AND COALESCE(p.subscription_status, '') NOT IN ('active', 'trialing')
    AND NOT EXISTS (
      SELECT 1 FROM public.subscriptions AS s
      WHERE s.user_id = p.id AND s.status IN ('active', 'trialing')
    )
    AND COALESCE(p.purchased_credits_balance, 0) = 0
    AND NOT EXISTS (
      SELECT 1 FROM public.credit_transactions AS ct
      WHERE ct.user_id = p.id
        AND ct.amount > 0
        AND ct.type IN ('purchase', 'subscription')
    )
    AND public.gallery_expiry_activity_anchor(p.id) <= now() - INTERVAL '23 days'
    AND NOT EXISTS (
      SELECT 1 FROM public.gallery_expiry_notices AS n
      WHERE n.user_id = p.id
        AND n.activity_anchor = public.gallery_expiry_activity_anchor(p.id)
        AND (
          n.warning_sent_at IS NOT NULL
          OR EXISTS (
            SELECT 1 FROM public.email_lifecycle_queue AS q
            WHERE q.id = n.queue_id
              AND q.campaign_key = 'gallery_expiry_warning'
              AND (q.status = 'pending' OR q.sent_at IS NOT NULL)
          )
        )
    )
  ORDER BY activity_anchor ASC, p.id ASC
  LIMIT (SELECT n FROM bounded);
$$;

REVOKE ALL ON FUNCTION public.get_gallery_expiry_warning_candidates(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_gallery_expiry_warning_candidates(INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.get_gallery_expiry_warning_candidates(INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_gallery_expiry_warning_candidates(INTEGER) TO service_role;

-- Cancel stale pending gallery_expiry_warning rows in one bounded global pass.
-- The caller supplies no anchor: this function recomputes the fresh anchor and the
-- full paid predicate (non-free tier, active/trialing status or subscription, positive
-- balance, or a positive purchase/subscription transaction) for each pending row. It
-- cancels a row when the anchor changed or the user paid, clears any processing claim,
-- and never touches sent rows or other campaigns.
--
-- Two starvation and safety properties are enforced here:
--   1. The stale predicate is applied BEFORE the LIMIT 50. Selecting the oldest 50
--      pending rows first and filtering afterwards let 50 still-valid warnings hide
--      every later stale or paid row permanently.
--   2. Candidates are locked FOR UPDATE SKIP LOCKED and re-checked as pending/unsent
--      in the final UPDATE, so a row delivered by a concurrent sender is never
--      cancelled. Malformed external metadata is parsed through pg_input_is_valid:
--      a bad anchor cancels its own row instead of aborting the scan.
DROP FUNCTION IF EXISTS public.cancel_stale_gallery_expiry_warnings(UUID, TIMESTAMPTZ);
CREATE OR REPLACE FUNCTION public.cancel_stale_gallery_expiry_warnings()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_cancelled INTEGER := 0;
BEGIN
  WITH stale AS MATERIALIZED (
    SELECT q.id,
           (
             COALESCE(p.subscription_tier, 'free') <> 'free'
             OR COALESCE(p.subscription_status, '') IN ('active', 'trialing')
             OR COALESCE(p.purchased_credits_balance, 0) > 0
             OR EXISTS (
               SELECT 1 FROM public.subscriptions AS s
               WHERE s.user_id = q.user_id AND s.status IN ('active', 'trialing')
             )
             OR EXISTS (
               SELECT 1 FROM public.credit_transactions AS ct
               WHERE ct.user_id = q.user_id
                 AND ct.amount > 0
                 AND ct.type IN ('purchase', 'subscription')
             )
           ) AS is_paid
    FROM public.email_lifecycle_queue AS q
    LEFT JOIN public.profiles AS p ON p.id = q.user_id
    WHERE q.campaign_key = 'gallery_expiry_warning'
      AND q.status = 'pending'
      AND q.sent_at IS NULL
      AND (
        COALESCE(p.subscription_tier, 'free') <> 'free'
        OR COALESCE(p.subscription_status, '') IN ('active', 'trialing')
        OR COALESCE(p.purchased_credits_balance, 0) > 0
        OR EXISTS (
          SELECT 1 FROM public.subscriptions AS s
          WHERE s.user_id = q.user_id AND s.status IN ('active', 'trialing')
        )
        OR EXISTS (
          SELECT 1 FROM public.credit_transactions AS ct
          WHERE ct.user_id = q.user_id
            AND ct.amount > 0
            AND ct.type IN ('purchase', 'subscription')
        )
        OR (
          CASE
            WHEN pg_catalog.pg_input_is_valid(q.metadata ->> 'activity_anchor', 'timestamptz')
            THEN (q.metadata ->> 'activity_anchor')::timestamptz
          END
          IS DISTINCT FROM public.gallery_expiry_activity_anchor(q.user_id)
        )
      )
    ORDER BY q.created_at ASC, q.id ASC
    FOR UPDATE OF q SKIP LOCKED
    LIMIT 50
  )
  UPDATE public.email_lifecycle_queue AS q
  SET status = 'cancelled',
      reason = CASE
        WHEN s.is_paid THEN 'gallery_expiry_user_paid'
        ELSE 'gallery_expiry_anchor_changed'
      END,
      updated_at = now(),
      processing_claim_id = NULL,
      processing_claimed_at = NULL
  FROM stale AS s
  WHERE q.id = s.id
    AND q.status = 'pending'
    AND q.sent_at IS NULL;
  GET DIAGNOSTICS v_cancelled = ROW_COUNT;
  RETURN v_cancelled;
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_stale_gallery_expiry_warnings() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_stale_gallery_expiry_warnings() FROM anon;
REVOKE ALL ON FUNCTION public.cancel_stale_gallery_expiry_warnings() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_stale_gallery_expiry_warnings() TO service_role;

-- Persist the first real sent_at for this campaign. Campaign, user, notice id and
-- anchor must all be present and valid before the delivery proof is written.
-- Only malformed metadata cast errors are swallowed; every other database fault
-- propagates so a real failure cannot silently lose delivery proof.
CREATE OR REPLACE FUNCTION public.capture_gallery_expiry_warning_delivery()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF NEW.campaign_key <> 'gallery_expiry_warning'
    OR NEW.sent_at IS NULL
    OR NEW.user_id IS NULL
    OR NEW.metadata IS NULL
    OR NOT (NEW.metadata ? 'notice_id')
    OR NOT (NEW.metadata ? 'activity_anchor') THEN
    RETURN NEW;
  END IF;

  BEGIN
    UPDATE public.gallery_expiry_notices AS n
    SET warning_sent_at = NEW.sent_at,
        queue_id = COALESCE(n.queue_id, NEW.id),
        updated_at = now()
    WHERE n.id = (NEW.metadata ->> 'notice_id')::uuid
      AND n.user_id = NEW.user_id
      AND n.activity_anchor = (NEW.metadata ->> 'activity_anchor')::timestamptz
      AND n.warning_sent_at IS NULL;
  EXCEPTION
    WHEN invalid_text_representation
      OR invalid_datetime_format
      OR datetime_field_overflow THEN
      RETURN NEW;
  END;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_gallery_expiry_warning_delivery() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.capture_gallery_expiry_warning_delivery() FROM anon;
REVOKE ALL ON FUNCTION public.capture_gallery_expiry_warning_delivery() FROM authenticated;

DROP TRIGGER IF EXISTS on_email_lifecycle_queue_gallery_expiry_sent
  ON public.email_lifecycle_queue;
CREATE TRIGGER on_email_lifecycle_queue_gallery_expiry_sent
  AFTER INSERT OR UPDATE ON public.email_lifecycle_queue
  FOR EACH ROW
  EXECUTE FUNCTION public.capture_gallery_expiry_warning_delivery();

-- At most one queue row per notice can be pending or carry delivery proof. The
-- existing pending-per-user guard does not cover the race where the first row is
-- sent between a lookup and an insert; this notice-level index does.
CREATE UNIQUE INDEX IF NOT EXISTS idx_email_lifecycle_queue_gallery_expiry_notice
  ON public.email_lifecycle_queue ((metadata ->> 'notice_id'))
  WHERE campaign_key = 'gallery_expiry_warning'
    AND (status = 'pending' OR sent_at IS NOT NULL);

-- Account retention notice. Marketing preference and frequency caps still apply at
-- provider dispatch; this campaign only seeds the template and priority.
INSERT INTO public.email_lifecycle_campaigns
  (key, name, category, template_name, email_type, preference_key, cooldown_days, priority, sort_priority)
VALUES
  ('gallery_expiry_warning', 'Free gallery expiry warning', 'account_retention',
   'gallery-expiry-warning', 'transactional', NULL, 0, 'transactional', 100)
ON CONFLICT (key) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  template_name = EXCLUDED.template_name,
  email_type = EXCLUDED.email_type,
  preference_key = EXCLUDED.preference_key,
  cooldown_days = EXCLUDED.cooldown_days,
  priority = EXCLUDED.priority,
  sort_priority = EXCLUDED.sort_priority,
  updated_at = NOW();
