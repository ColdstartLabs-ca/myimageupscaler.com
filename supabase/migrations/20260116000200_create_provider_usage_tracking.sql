-- Provider usage tracking table
-- Tracks AI provider usage for free tier limits and auto-switching

CREATE TABLE IF NOT EXISTS public.provider_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL CHECK (provider IN ('replicate', 'gemini', 'stability_ai', 'openai')),
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  month TEXT NOT NULL DEFAULT TO_CHAR(CURRENT_DATE, 'YYYY-MM'),

  -- Usage counters
  daily_requests INTEGER DEFAULT 0 NOT NULL,
  monthly_credits INTEGER DEFAULT 0 NOT NULL,

  -- Timestamps
  last_daily_reset TIMESTAMPTZ DEFAULT NOW(),
  last_monthly_reset TIMESTAMPTZ DEFAULT NOW(),

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure one record per provider per month
  UNIQUE(provider, month)
);

-- Index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_provider_usage_provider_month ON public.provider_usage(provider, month);
CREATE INDEX IF NOT EXISTS idx_provider_usage_date ON public.provider_usage(date);

-- Function to reset daily counters
CREATE OR REPLACE FUNCTION public.reset_daily_provider_counters()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.provider_usage
  SET
    daily_requests = 0,
    last_daily_reset = NOW(),
    updated_at = NOW()
  WHERE date < CURRENT_DATE;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-reset daily counters (runs periodically via cron)
-- COMMENT ON FUNCTION public.reset_daily_provider_counters IS 'Reset daily provider usage counters';

-- Function to get or create provider usage record
CREATE OR REPLACE FUNCTION public.get_or_create_provider_usage(
  p_provider TEXT,
  p_date DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE (
  id UUID,
  provider TEXT,
  daily_requests INTEGER,
  monthly_credits INTEGER,
  last_daily_reset TIMESTAMPTZ,
  last_monthly_reset TIMESTAMPTZ
) AS $$
DECLARE
  v_month TEXT;
  v_record RECORD;
BEGIN
  v_month := TO_CHAR(p_date, 'YYYY-MM');

  -- Try to get existing record
  SELECT * INTO v_record
  FROM public.provider_usage
  WHERE provider = p_provider AND month = v_month;

  -- If not found, create new record
  IF NOT FOUND THEN
    INSERT INTO public.provider_usage (provider, date, month, daily_requests, monthly_credits)
    VALUES (p_provider, p_date, v_month, 0, 0)
    RETURNING *
    INTO v_record;
  END IF;

  -- Update date if it's a new day (same month)
  UPDATE public.provider_usage
  SET date = p_date
  WHERE provider = p_provider AND month = v_month AND id = v_record.id;

  RETURN QUERY
  SELECT
    pu.id,
    pu.provider,
    pu.daily_requests,
    pu.monthly_credits,
    pu.last_daily_reset,
    pu.last_monthly_reset
  FROM public.provider_usage pu
  WHERE pu.id = v_record.id;
END;
$$ LANGUAGE plpgsql;

-- Function to increment provider usage
CREATE OR REPLACE FUNCTION public.increment_provider_usage(
  p_provider TEXT,
  p_requests INTEGER DEFAULT 1,
  p_credits INTEGER DEFAULT 0
)
RETURNS TABLE (
  success BOOLEAN,
  daily_requests_remaining INTEGER,
  monthly_credits_remaining INTEGER,
  error_message TEXT
) AS $$
DECLARE
  v_daily_limit INTEGER;
  v_monthly_limit INTEGER;
  v_current_daily_requests INTEGER;
  v_current_monthly_credits INTEGER;
  v_new_daily_requests INTEGER;
  v_new_monthly_credits INTEGER;
BEGIN
  -- Get current usage record
  SELECT daily_requests, monthly_credits
  INTO v_current_daily_requests, v_current_monthly_credits
  FROM public.provider_usage
  WHERE provider = p_provider
    AND month = TO_CHAR(CURRENT_DATE, 'YYYY-MM')
  FOR UPDATE;

  -- If no record exists, create one
  IF NOT FOUND THEN
    INSERT INTO public.provider_usage (provider, date, month, daily_requests, monthly_credits)
    VALUES (p_provider, CURRENT_DATE, TO_CHAR(CURRENT_DATE, 'YYYY-MM'), 0, 0)
    RETURNING daily_requests, monthly_credits
    INTO v_current_daily_requests, v_current_monthly_credits;
  END IF;

  -- Get provider limits (from config or default values)
  -- These could be stored in a provider_config table in the future
  CASE p_provider
    WHEN 'gemini' THEN
      v_daily_limit := 500; -- 500 free requests per day
      v_monthly_limit := 15000; -- ~500 requests/day * 30 days
    WHEN 'replicate' THEN
      v_daily_limit := NULL; -- No hard daily limit (pay-as-you-go)
      v_monthly_limit := NULL;
    ELSE
      v_daily_limit := NULL;
      v_monthly_limit := NULL;
  END CASE;

  -- Check limits (only if limits are defined)
  IF v_daily_limit IS NOT NULL THEN
    IF v_current_daily_requests + p_requests > v_daily_limit THEN
      RETURN QUERY SELECT FALSE,
        v_daily_limit - v_current_daily_requests,
        v_monthly_limit - v_current_monthly_credits,
        'Daily request limit exceeded'::TEXT;
    END IF;
  END IF;

  IF v_monthly_limit IS NOT NULL THEN
    IF v_current_monthly_credits + p_credits > v_monthly_limit THEN
      RETURN QUERY SELECT FALSE,
        v_daily_limit - v_current_daily_requests,
        v_monthly_limit - v_current_monthly_credits,
        'Monthly credit limit exceeded'::TEXT;
    END IF;
  END IF;

  -- Increment counters
  v_new_daily_requests := v_current_daily_requests + p_requests;
  v_new_monthly_credits := v_current_monthly_credits + p_credits;

  UPDATE public.provider_usage
  SET
    daily_requests = v_new_daily_requests,
    monthly_credits = v_new_monthly_credits,
    updated_at = NOW()
  WHERE provider = p_provider
    AND month = TO_CHAR(CURRENT_DATE, 'YYYY-MM');

  RETURN QUERY SELECT TRUE,
    v_daily_limit - v_new_daily_requests,
    v_monthly_limit - v_new_monthly_credits,
    NULL::TEXT;
END;
$$ LANGUAGE plpgsql;

-- Grant access (service role for writes, anon for read via RLS)
-- ALTER TABLE public.provider_usage ENABLE ROW LEVEL SECURITY;

-- CREATE POLICY "Service role can manage provider usage"
--   ON public.provider_usage FOR ALL
--   USING (auth.role() = 'service_role');

-- CREATE POLICY "Authenticated can read provider usage"
--   ON public.provider_usage FOR SELECT
--   USING (auth.uid() IS NOT NULL);
