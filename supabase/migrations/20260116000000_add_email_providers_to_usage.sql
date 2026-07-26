-- Create separate email_provider_usage table
-- Keeps email provider tracking separate from AI provider tracking

CREATE TABLE IF NOT EXISTS public.email_provider_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provider TEXT NOT NULL CHECK (provider IN ('brevo', 'resend')),
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

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_email_provider_usage_provider_month ON public.email_provider_usage(provider, month);
CREATE INDEX IF NOT EXISTS idx_email_provider_usage_date ON public.email_provider_usage(date);

-- Function to get or create email provider usage record
CREATE OR REPLACE FUNCTION public.get_or_create_email_provider_usage(
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
  FROM public.email_provider_usage
  WHERE email_provider_usage.provider = p_provider AND month = v_month;

  -- If not found, create new record
  IF NOT FOUND THEN
    INSERT INTO public.email_provider_usage (provider, date, month, daily_requests, monthly_credits)
    VALUES (p_provider, p_date, v_month, 0, 0)
    RETURNING *
    INTO v_record;
  END IF;

  -- Update date if it's a new day (same month)
  UPDATE public.email_provider_usage
  SET date = p_date
  WHERE email_provider_usage.provider = p_provider AND month = v_month AND email_provider_usage.id = v_record.id;

  RETURN QUERY
  SELECT
    epu.id,
    epu.provider,
    epu.daily_requests,
    epu.monthly_credits,
    epu.last_daily_reset,
    epu.last_monthly_reset
  FROM public.email_provider_usage epu
  WHERE epu.id = v_record.id;
END;
$$ LANGUAGE plpgsql;

-- Function to increment email provider usage
CREATE OR REPLACE FUNCTION public.increment_email_provider_usage(
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
  FROM public.email_provider_usage
  WHERE provider = p_provider
    AND month = TO_CHAR(CURRENT_DATE, 'YYYY-MM')
  FOR UPDATE;

  -- If no record exists, create one
  IF NOT FOUND THEN
    INSERT INTO public.email_provider_usage (provider, date, month, daily_requests, monthly_credits)
    VALUES (p_provider, CURRENT_DATE, TO_CHAR(CURRENT_DATE, 'YYYY-MM'), 0, 0)
    RETURNING daily_requests, monthly_credits
    INTO v_current_daily_requests, v_current_monthly_credits;
  END IF;

  -- Get provider limits
  CASE p_provider
    WHEN 'brevo' THEN
      v_daily_limit := 300;   -- 300 free emails/day
      v_monthly_limit := 9000; -- ~300/day * 30 days
    WHEN 'resend' THEN
      v_daily_limit := 100;   -- 100 free emails/day
      v_monthly_limit := 3000; -- 3,000 free emails/month
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
        'Daily email limit exceeded'::TEXT;
      RETURN;
    END IF;
  END IF;

  IF v_monthly_limit IS NOT NULL THEN
    IF v_current_monthly_credits + p_credits > v_monthly_limit THEN
      RETURN QUERY SELECT FALSE,
        v_daily_limit - v_current_daily_requests,
        v_monthly_limit - v_current_monthly_credits,
        'Monthly email limit exceeded'::TEXT;
      RETURN;
    END IF;
  END IF;

  -- Increment counters
  v_new_daily_requests := v_current_daily_requests + p_requests;
  v_new_monthly_credits := v_current_monthly_credits + p_credits;

  UPDATE public.email_provider_usage
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
