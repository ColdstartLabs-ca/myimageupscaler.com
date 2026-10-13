-- Match the bounded prune's ORDER BY so it does not sort the whole terminal backlog.
CREATE INDEX IF NOT EXISTS idx_email_lifecycle_queue_prune_order
  ON public.email_lifecycle_queue(updated_at, id)
  WHERE status IN ('skipped', 'cancelled', 'failed')
    AND sent_at IS NULL
    AND recipient_value_run_id IS NULL
    AND recipient_value_holdout_released_at IS NULL
    AND COALESCE(recipient_value_decision, '') <> 'hold_experiment';
