-- Add anti-freeloader columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS signup_country TEXT,
  ADD COLUMN IF NOT EXISTS signup_ip TEXT,
  ADD COLUMN IF NOT EXISTS region_tier TEXT CHECK (region_tier IN ('standard', 'restricted')),
  ADD COLUMN IF NOT EXISTS is_flagged_freeloader BOOLEAN NOT NULL DEFAULT false;

-- Browser fingerprints table
CREATE TABLE IF NOT EXISTS public.browser_fingerprints (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fingerprint_hash TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(fingerprint_hash, user_id)
);

CREATE INDEX IF NOT EXISTS idx_fingerprints_hash ON public.browser_fingerprints(fingerprint_hash);

ALTER TABLE public.browser_fingerprints ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own fingerprints"
  ON public.browser_fingerprints FOR SELECT
  USING (auth.uid() = user_id);

GRANT INSERT, SELECT ON public.browser_fingerprints TO service_role;

-- RPC: register fingerprint and flag if threshold reached
CREATE OR REPLACE FUNCTION public.register_fingerprint(
  p_user_id UUID,
  p_hash TEXT
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  INSERT INTO public.browser_fingerprints(fingerprint_hash, user_id)
  VALUES (p_hash, p_user_id)
  ON CONFLICT (fingerprint_hash, user_id) DO NOTHING;

  -- Count distinct FREE plan users sharing this fingerprint
  SELECT COUNT(DISTINCT bf.user_id) INTO v_count
  FROM public.browser_fingerprints bf
  JOIN public.profiles p ON p.id = bf.user_id
  WHERE bf.fingerprint_hash = p_hash
    AND p.subscription_tier = 'free';

  -- Flag all free accounts sharing this fingerprint if threshold reached
  IF v_count >= 5 THEN
    UPDATE public.profiles
    SET is_flagged_freeloader = true
    WHERE id IN (
      SELECT DISTINCT bf.user_id
      FROM public.browser_fingerprints bf
      WHERE bf.fingerprint_hash = p_hash
    )
    AND subscription_tier = 'free';
  END IF;
END;
$$;

-- Only service_role can call this — prevents client manipulation
REVOKE ALL ON FUNCTION public.register_fingerprint(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.register_fingerprint(UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.register_fingerprint(UUID, TEXT) TO service_role;
