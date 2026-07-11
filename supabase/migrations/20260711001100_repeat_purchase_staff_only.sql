ALTER TABLE public.repeat_purchase_rollout
  ALTER COLUMN auto_top_up_percent SET DEFAULT 0,
  ALTER COLUMN repeat_purchase_percent SET DEFAULT 0;

UPDATE public.repeat_purchase_rollout
SET auto_top_up_percent = 0,
    repeat_purchase_percent = 0,
    updated_at = now()
WHERE id = true;
