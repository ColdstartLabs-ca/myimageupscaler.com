-- Guarded, atomic application and rollback of a persisted recipient-value run.
-- Dry-run classifications live in non-PII run items so the queue can be read
-- and written in bounded pages while apply remains one database transaction.

CREATE OR REPLACE FUNCTION public.apply_email_recipient_value_run(
  p_run_id UUID,
  p_policy_version TEXT,
  p_expected_count INTEGER,
  p_candidate_checksum TEXT,
  p_action TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_run public.email_queue_pruning_runs%ROWTYPE;
  v_current_count INTEGER;
  v_current_checksum TEXT;
  v_item_count INTEGER;
  v_changed_count INTEGER := 0;
  v_cancelled_count INTEGER := 0;
  v_held_count INTEGER := 0;
  v_kept_count INTEGER := 0;
BEGIN
  IF p_action NOT IN ('apply', 'rollback') THEN
    RAISE EXCEPTION 'Invalid recipient-value action';
  END IF;

  IF NOT pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtext('email_queue_pruning')) THEN
    RAISE EXCEPTION 'Another recipient-value pruning run is already applying';
  END IF;

  SELECT *
  INTO v_run
  FROM public.email_queue_pruning_runs
  WHERE id = p_run_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recipient-value pruning run not found';
  END IF;

  IF v_run.policy_version IS DISTINCT FROM p_policy_version
     OR v_run.candidate_count IS DISTINCT FROM p_expected_count THEN
    RAISE EXCEPTION 'Recipient-value run guard does not match persisted dry-run';
  END IF;

  IF p_action = 'rollback' THEN
    IF v_run.mode = 'rolled_back' THEN
      RETURN jsonb_build_object(
        'run_id', p_run_id,
        'action', p_action,
        'mode', v_run.mode,
        'changed_count', 0,
        'cancelled_count', 0
      );
    END IF;

    IF v_run.mode <> 'applied' THEN
      RAISE EXCEPTION 'Only an applied recipient-value run can be rolled back';
    END IF;

    UPDATE public.email_lifecycle_queue AS q
    SET status = 'pending',
        reason = NULL,
        updated_at = pg_catalog.now()
    WHERE q.recipient_value_run_id = p_run_id
      AND q.recipient_value_decision = 'cancel'
      AND q.status = 'cancelled'
      AND q.reason = 'recipient_value_pruned'
      AND NOT EXISTS (
        SELECT 1
        FROM public.email_lifecycle_queue AS newer
        WHERE newer.user_id IS NOT DISTINCT FROM q.user_id
          AND newer.campaign_key = q.campaign_key
          AND newer.id <> q.id
          AND newer.status = 'pending'
      );

    GET DIAGNOSTICS v_changed_count = ROW_COUNT;

    UPDATE public.email_queue_pruning_runs
    SET mode = 'rolled_back',
        rolled_back_at = pg_catalog.now()
    WHERE id = p_run_id;

    RETURN jsonb_build_object(
      'run_id', p_run_id,
      'action', p_action,
      'mode', 'rolled_back',
      'changed_count', v_changed_count,
      'cancelled_count', v_changed_count
    );
  END IF;

  IF v_run.mode = 'applied' THEN
    RETURN jsonb_build_object(
      'run_id', p_run_id,
      'action', p_action,
      'mode', v_run.mode,
      'changed_count', 0,
      'cancelled_count', 0,
      'held_count', 0,
      'kept_count', 0
    );
  END IF;

  IF v_run.mode <> 'dry_run' THEN
    RAISE EXCEPTION 'Recipient-value run is not applicable';
  END IF;

  IF p_candidate_checksum IS DISTINCT FROM v_run.candidate_checksum
     OR p_candidate_checksum IS NULL THEN
    RAISE EXCEPTION 'Recipient-value checksum does not match persisted dry-run';
  END IF;

  SELECT count(*)::INTEGER,
         COALESCE(
           pg_catalog.md5(
             pg_catalog.string_agg(
               q.id::TEXT || ':' || pg_catalog.to_char(
                 q.updated_at AT TIME ZONE 'UTC',
                 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
               ),
               ',' ORDER BY q.id
             )
           ),
           pg_catalog.md5('')
         )
  INTO v_current_count, v_current_checksum
  FROM public.email_lifecycle_queue AS q
  WHERE q.status = 'pending';

  IF v_current_count IS DISTINCT FROM v_run.candidate_count
     OR v_current_checksum IS DISTINCT FROM v_run.candidate_checksum THEN
    RAISE EXCEPTION 'Recipient-value queue snapshot changed; refusing mutation';
  END IF;

  SELECT count(*)::INTEGER
  INTO v_item_count
  FROM public.email_queue_pruning_run_items AS i
  WHERE i.run_id = p_run_id;

  IF v_item_count IS DISTINCT FROM v_current_count THEN
    RAISE EXCEPTION 'Recipient-value run item count does not match snapshot';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.email_lifecycle_queue AS q
    LEFT JOIN public.email_queue_pruning_run_items AS i
      ON i.run_id = p_run_id AND i.queue_id = q.id
    WHERE q.status = 'pending'
      AND (
        i.queue_id IS NULL
        OR q.updated_at IS DISTINCT FROM i.queue_updated_at
      )
  ) THEN
    RAISE EXCEPTION 'Recipient-value queue row changed; refusing mutation';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.email_lifecycle_queue AS q
    JOIN public.email_queue_pruning_run_items AS i
      ON i.run_id = p_run_id AND i.queue_id = q.id
    LEFT JOIN public.email_lifecycle_campaigns AS c ON c.key = q.campaign_key
    WHERE q.status = 'pending'
      AND (
        i.recipient_value_policy_version IS DISTINCT FROM p_policy_version
        OR i.recipient_value_reasons IS NULL
        OR pg_catalog.jsonb_typeof(i.recipient_value_reasons) <> 'array'
        OR i.recipient_value_decision NOT IN (
          'protected', 'keep_high', 'keep_medium', 'hold_experiment', 'cancel'
        )
        OR i.recipient_value_band NOT IN ('protected', 'high', 'medium', 'experiment', 'cancel')
        OR (
          i.recipient_value_decision IN ('protected', 'keep_high')
          AND i.recipient_value_band NOT IN ('protected', 'high')
        )
        OR (i.recipient_value_decision = 'keep_medium' AND i.recipient_value_band <> 'medium')
        OR (i.recipient_value_decision = 'hold_experiment' AND i.recipient_value_band <> 'experiment')
        OR (i.recipient_value_decision = 'cancel' AND i.recipient_value_band <> 'cancel')
        OR (i.recipient_value_decision = 'cancel' AND coalesce(c.email_type, 'transactional') = 'transactional')
      )
  ) THEN
    RAISE EXCEPTION 'Recipient-value run contains an unsafe decision';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.email_lifecycle_queue AS q
    JOIN public.email_queue_pruning_run_items AS i
      ON i.run_id = p_run_id AND i.queue_id = q.id
    WHERE q.status = 'pending'
      AND q.processing_claim_id IS NOT NULL
      AND q.processing_claimed_at >= pg_catalog.now() - INTERVAL '10 minutes'
  ) THEN
    RAISE EXCEPTION 'Recipient-value queue contains a concurrent claim';
  END IF;

  UPDATE public.email_lifecycle_queue AS q
  SET recipient_value_score = i.recipient_value_score,
      recipient_value_band = i.recipient_value_band,
      recipient_value_decision = i.recipient_value_decision,
      recipient_value_reasons = i.recipient_value_reasons,
      recipient_value_policy_version = i.recipient_value_policy_version,
      recipient_value_classified_at = pg_catalog.now(),
      recipient_value_run_id = p_run_id,
      status = CASE
        WHEN i.recipient_value_decision = 'cancel' THEN 'cancelled'
        ELSE q.status
      END,
      reason = CASE
        WHEN i.recipient_value_decision = 'cancel' THEN 'recipient_value_pruned'
        ELSE q.reason
      END,
      updated_at = pg_catalog.now()
  FROM public.email_queue_pruning_run_items AS i
  WHERE i.run_id = p_run_id
    AND q.id = i.queue_id
    AND q.status = 'pending';

  GET DIAGNOSTICS v_changed_count = ROW_COUNT;

  SELECT count(*) FILTER (WHERE i.recipient_value_decision = 'cancel')::INTEGER,
         count(*) FILTER (WHERE i.recipient_value_decision = 'hold_experiment')::INTEGER,
         count(*) FILTER (
           WHERE i.recipient_value_decision IN ('protected', 'keep_high', 'keep_medium')
         )::INTEGER
  INTO v_cancelled_count, v_held_count, v_kept_count
  FROM public.email_queue_pruning_run_items AS i
  WHERE i.run_id = p_run_id;

  UPDATE public.email_queue_pruning_runs
  SET mode = 'applied',
      applied_at = pg_catalog.now()
  WHERE id = p_run_id;

  RETURN jsonb_build_object(
    'run_id', p_run_id,
    'action', p_action,
    'mode', 'applied',
    'changed_count', v_changed_count,
    'cancelled_count', v_cancelled_count,
    'held_count', v_held_count,
    'kept_count', v_kept_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_email_recipient_value_run(
  UUID, TEXT, INTEGER, TEXT, TEXT
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.apply_email_recipient_value_run(
  UUID, TEXT, INTEGER, TEXT, TEXT
) TO service_role;
