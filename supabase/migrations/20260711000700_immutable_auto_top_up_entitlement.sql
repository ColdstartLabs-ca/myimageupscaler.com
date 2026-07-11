ALTER TABLE public.auto_top_up_attempts
  ADD COLUMN pack_key text CHECK (pack_key IN ('small', 'medium')),
  ADD COLUMN credits integer CHECK (credits > 0);

UPDATE public.auto_top_up_attempts a
SET pack_key = s.pack_key,
    credits = CASE s.pack_key WHEN 'small' THEN 50 WHEN 'medium' THEN 200 END
FROM public.auto_top_up_settings s
WHERE s.user_id = a.user_id AND a.pack_key IS NULL;

-- Historical terminal attempts do not need fulfillment; all new attempts do.
ALTER TABLE public.auto_top_up_attempts
  ADD CONSTRAINT auto_top_up_pending_entitlement
  CHECK (status IN ('failed', 'cancelled', 'succeeded') OR (pack_key IS NOT NULL AND credits IS NOT NULL));
