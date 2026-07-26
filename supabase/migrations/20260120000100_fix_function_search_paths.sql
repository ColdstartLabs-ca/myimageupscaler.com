-- Fix search_path for all SECURITY DEFINER functions
-- This prevents potential security issues where malicious users could
-- create shadowing objects in other schemas

-- Email provider usage functions
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Webhook events functions
CREATE OR REPLACE FUNCTION public.update_webhook_events_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE OR REPLACE FUNCTION is_webhook_event_processed(p_event_id TEXT)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.webhook_events
    WHERE event_id = p_event_id
    AND status IN ('completed', 'processing')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION mark_webhook_event_failed(p_event_id TEXT, p_error_message TEXT DEFAULT NULL)
RETURNS VOID AS $$
BEGIN
  UPDATE public.webhook_events
  SET
    status = 'failed',
    error_message = p_error_message,
    completed_at = now()
  WHERE event_id = p_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION mark_webhook_event_completed(p_event_id TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE public.webhook_events
  SET
    status = 'completed',
    completed_at = now()
  WHERE event_id = p_event_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION claim_webhook_event(
  p_event_id TEXT,
  p_event_type TEXT,
  p_payload JSONB DEFAULT NULL
)
RETURNS TABLE(is_new BOOLEAN, existing_status TEXT) AS $$
DECLARE
  v_existing_status TEXT;
BEGIN
  -- First check if event exists
  SELECT we.status INTO v_existing_status
  FROM public.webhook_events we
  WHERE we.event_id = p_event_id;

  IF v_existing_status IS NOT NULL THEN
    -- Event already exists
    RETURN QUERY SELECT false, v_existing_status;
    RETURN;
  END IF;

  -- Try to insert new event
  BEGIN
    INSERT INTO public.webhook_events (event_id, event_type, status, payload)
    VALUES (p_event_id, p_event_type, 'processing', p_payload);

    RETURN QUERY SELECT true, NULL::TEXT;
  EXCEPTION WHEN unique_violation THEN
    -- Concurrent insert won - get the status of that insert
    SELECT we.status INTO v_existing_status
    FROM public.webhook_events we
    WHERE we.event_id = p_event_id;

    RETURN QUERY SELECT false, v_existing_status;
  END;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- User data function
CREATE OR REPLACE FUNCTION public.get_user_data(target_user_id UUID)
RETURNS JSON AS $$
DECLARE
  result JSON;
BEGIN
  -- Security check: Only allow users to fetch their own data
  IF target_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Access denied: You can only fetch your own user data';
  END IF;

  SELECT json_build_object(
    'profile', (
      SELECT row_to_json(p.*)
      FROM public.profiles p
      WHERE p.id = target_user_id
    ),
    'subscription', (
      SELECT row_to_json(s.*)
      FROM public.subscriptions s
      WHERE s.user_id = target_user_id
        AND s.status IN ('active', 'trialing')
      ORDER BY s.created_at DESC
      LIMIT 1
    )
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Auth trigger function
-- FIXED: Updated to use correct column names after migration 20251205_separate_credit_pools.sql
-- which renamed credits_balance to subscription_credits_balance and added purchased_credits_balance
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, subscription_credits_balance, purchased_credits_balance)
  VALUES (NEW.id, 10, 0);  -- Give new users 10 free subscription credits
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
