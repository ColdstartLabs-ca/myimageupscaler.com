-- Add Cloudflare Email Service to email provider usage limit handling.

ALTER TABLE public.email_provider_usage
  DROP CONSTRAINT IF EXISTS email_provider_usage_provider_check;

ALTER TABLE public.email_provider_usage
  ADD CONSTRAINT email_provider_usage_provider_check
  CHECK (provider IN ('cloudflare', 'brevo', 'resend'));

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
  SELECT daily_requests, monthly_credits
  INTO v_current_daily_requests, v_current_monthly_credits
  FROM public.email_provider_usage
  WHERE provider = p_provider
    AND month = TO_CHAR(CURRENT_DATE, 'YYYY-MM')
  FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.email_provider_usage (provider, date, month, daily_requests, monthly_credits)
    VALUES (p_provider, CURRENT_DATE, TO_CHAR(CURRENT_DATE, 'YYYY-MM'), 0, 0)
    RETURNING daily_requests, monthly_credits
    INTO v_current_daily_requests, v_current_monthly_credits;
  END IF;

  CASE p_provider
    WHEN 'cloudflare' THEN
      v_daily_limit := NULL;  -- Daily limits vary by account; let Cloudflare 429s trigger fallback.
      v_monthly_limit := 3000;
    WHEN 'brevo' THEN
      v_daily_limit := 300;
      v_monthly_limit := 9000;
    WHEN 'resend' THEN
      v_daily_limit := 100;
      v_monthly_limit := 3000;
    ELSE
      v_daily_limit := NULL;
      v_monthly_limit := NULL;
  END CASE;

  IF v_daily_limit IS NOT NULL THEN
    IF v_current_daily_requests + p_requests > v_daily_limit THEN
      RETURN QUERY SELECT FALSE,
        v_daily_limit - v_current_daily_requests,
        CASE
          WHEN v_monthly_limit IS NULL THEN NULL
          ELSE v_monthly_limit - v_current_monthly_credits
        END,
        'Daily email limit exceeded'::TEXT;
      RETURN;
    END IF;
  END IF;

  IF v_monthly_limit IS NOT NULL THEN
    IF v_current_monthly_credits + p_credits > v_monthly_limit THEN
      RETURN QUERY SELECT FALSE,
        CASE
          WHEN v_daily_limit IS NULL THEN NULL
          ELSE v_daily_limit - v_current_daily_requests
        END,
        v_monthly_limit - v_current_monthly_credits,
        'Monthly email limit exceeded'::TEXT;
      RETURN;
    END IF;
  END IF;

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
    CASE
      WHEN v_daily_limit IS NULL THEN NULL
      ELSE v_daily_limit - v_new_daily_requests
    END,
    CASE
      WHEN v_monthly_limit IS NULL THEN NULL
      ELSE v_monthly_limit - v_new_monthly_credits
    END,
    NULL::TEXT;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
