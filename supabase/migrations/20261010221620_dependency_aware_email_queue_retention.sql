-- PRD-SQR-03 phase 2: dependency-aware email lifecycle queue retention.
--
-- The former retention deleted terminal queue rows by created_at. That removed
-- rows the recipient-value rollback RPC, the 10% holdout release state and the
-- 90-day click/return attribution still need. This function prunes by terminal
-- age (updated_at) and refuses to delete any row with a live dependency.
--
-- Concurrency: a row can turn pending/sent, or gain a pruning-run or
-- attribution dependency, between a naive SELECT and DELETE. This function
-- locks the exact candidate ids with FOR UPDATE SKIP LOCKED in a first
-- statement, then deletes them in a SECOND statement with a fresh snapshot and
-- every dependency predicate re-applied. A child that commits after the lock
-- snapshot is visible to the second statement, so its parent survives the
-- NOT EXISTS guard. A single statement shares one snapshot for the lock and the
-- delete, misses that child, and the foreign-key action erases its dependency.
--
-- A delivered row keeps sent_at even when a later step marks it failed. The
-- sent_at IS NULL guard keeps those rows, because the click/return attribution
-- path still needs the sent lifecycle event.
--
-- Safe to deploy before any run: it never mutates rows on its own and is only
-- executable by service_role.

CREATE INDEX IF NOT EXISTS idx_email_lifecycle_queue_terminal_updated
  ON public.email_lifecycle_queue(status, updated_at)
  WHERE status IN ('skipped', 'cancelled', 'failed');

-- The guarded DELETE and its NOT EXISTS subqueries look up children by
-- queue_id. The event index starts with event_type and the run-item index with
-- run_id, so neither can serve that lookup and each deleted row runs an
-- unindexed foreign-key check. These queue_id-leading indexes keep a full
-- batch inside statement_timeout.
CREATE INDEX IF NOT EXISTS idx_email_lifecycle_events_queue_id
  ON public.email_lifecycle_events(queue_id);

CREATE INDEX IF NOT EXISTS idx_email_queue_pruning_run_items_queue_id
  ON public.email_queue_pruning_run_items(queue_id);

CREATE OR REPLACE FUNCTION public.prune_email_lifecycle_queue(
  p_terminal_cutoff TIMESTAMPTZ,
  p_attribution_cutoff TIMESTAMPTZ,
  p_limit INTEGER,
  p_dry_run BOOLEAN DEFAULT FALSE
)
RETURNS TABLE(candidates INTEGER, deleted INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 1000), 1), 1000);
  v_candidates INTEGER := 0;
  v_deleted INTEGER := 0;
  v_ids UUID[];
BEGIN
  -- Dry run only counts the deletable set. It takes no locks and mutates nothing.
  IF p_dry_run THEN
    SELECT pg_catalog.count(*)::INTEGER
    INTO v_candidates
    FROM (
      SELECT q.id
      FROM public.email_lifecycle_queue AS q
      WHERE q.status IN ('skipped', 'cancelled', 'failed')
        AND q.updated_at < p_terminal_cutoff
        AND q.sent_at IS NULL
        AND q.recipient_value_run_id IS NULL
        AND q.recipient_value_holdout_released_at IS NULL
        AND COALESCE(q.recipient_value_decision, '') <> 'hold_experiment'
        AND NOT EXISTS (
          SELECT 1 FROM public.email_queue_pruning_run_items AS i
          WHERE i.queue_id = q.id
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.email_lifecycle_events AS e
          WHERE e.queue_id = q.id
            AND e.event_type IN ('clicked', 'returned', 'purchased_after_email')
            AND e.occurred_at >= p_attribution_cutoff
        )
      ORDER BY q.updated_at ASC, q.id ASC
      LIMIT v_limit
    ) AS candidate;
    RETURN QUERY SELECT v_candidates, 0;
    RETURN;
  END IF;

  -- Statement 1: lock the exact candidate ids in their own snapshot. The
  -- FOR UPDATE lock conflicts with the FOR KEY SHARE lock an INSERT into
  -- email_queue_pruning_run_items or email_lifecycle_events takes on its parent,
  -- and with the row lock an UPDATE to status 'pending'/'sent' takes. SKIP
  -- LOCKED leaves rows another session holds (for example a sender claim) for
  -- the next run.
  SELECT pg_catalog.array_agg(q.id)
  INTO v_ids
  FROM (
    SELECT q.id
    FROM public.email_lifecycle_queue AS q
    WHERE q.status IN ('skipped', 'cancelled', 'failed')
      AND q.updated_at < p_terminal_cutoff
      AND q.sent_at IS NULL
      AND q.recipient_value_run_id IS NULL
      AND q.recipient_value_holdout_released_at IS NULL
      AND COALESCE(q.recipient_value_decision, '') <> 'hold_experiment'
      AND NOT EXISTS (
        SELECT 1 FROM public.email_queue_pruning_run_items AS i
        WHERE i.queue_id = q.id
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.email_lifecycle_events AS e
        WHERE e.queue_id = q.id
          AND e.event_type IN ('clicked', 'returned', 'purchased_after_email')
          AND e.occurred_at >= p_attribution_cutoff
      )
    ORDER BY q.updated_at ASC, q.id ASC
    LIMIT v_limit
    FOR UPDATE SKIP LOCKED
  ) AS q;

  v_candidates := COALESCE(pg_catalog.cardinality(v_ids), 0);
  IF v_candidates = 0 THEN
    RETURN QUERY SELECT 0, 0;
    RETURN;
  END IF;

  -- Statement 2: delete in a fresh snapshot with every dependency predicate
  -- re-applied. A child row that committed after statement 1 is now visible, so
  -- the NOT EXISTS keeps its parent and the foreign-key action cannot erase the
  -- dependency.
  DELETE FROM public.email_lifecycle_queue AS q
  WHERE q.id = ANY(v_ids)
    AND q.status IN ('skipped', 'cancelled', 'failed')
    AND q.updated_at < p_terminal_cutoff
    AND q.sent_at IS NULL
    AND q.recipient_value_run_id IS NULL
    AND q.recipient_value_holdout_released_at IS NULL
    AND COALESCE(q.recipient_value_decision, '') <> 'hold_experiment'
    AND NOT EXISTS (
      SELECT 1 FROM public.email_queue_pruning_run_items AS i
      WHERE i.queue_id = q.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.email_lifecycle_events AS e
      WHERE e.queue_id = q.id
        AND e.event_type IN ('clicked', 'returned', 'purchased_after_email')
        AND e.occurred_at >= p_attribution_cutoff
    );

  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  RETURN QUERY SELECT v_candidates, v_deleted;
END;
$$;

REVOKE ALL ON FUNCTION public.prune_email_lifecycle_queue(TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, BOOLEAN)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.prune_email_lifecycle_queue(TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, BOOLEAN)
  TO service_role;

COMMENT ON FUNCTION public.prune_email_lifecycle_queue(TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, BOOLEAN) IS
  'PRD-SQR-03: locks candidate ids then deletes terminal lifecycle queue rows past terminal age that no delivery, pruning-run, rollback, holdout or click-attribution dependency needs.';

-- Rollback:
--   DROP FUNCTION IF EXISTS public.prune_email_lifecycle_queue(TIMESTAMPTZ, TIMESTAMPTZ, INTEGER, BOOLEAN);
--   DROP INDEX IF EXISTS public.idx_email_queue_pruning_run_items_queue_id;
--   DROP INDEX IF EXISTS public.idx_email_lifecycle_events_queue_id;
--   DROP INDEX IF EXISTS public.idx_email_lifecycle_queue_terminal_updated;
