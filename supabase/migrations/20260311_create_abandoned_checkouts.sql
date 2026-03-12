-- Create abandoned_checkouts table for checkout recovery system
-- See PRD: docs/PRDs/checkout-recovery-system.md

CREATE TABLE IF NOT EXISTS public.abandoned_checkouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  email TEXT,
  price_id TEXT NOT NULL,
  purchase_type TEXT NOT NULL CHECK (purchase_type IN ('subscription', 'credit_pack')),
  plan_key TEXT,
  pack_key TEXT,
  pricing_region TEXT DEFAULT 'standard',
  discount_percent INTEGER DEFAULT 0,
  cart_data JSONB DEFAULT '{}'::jsonb,
  recovery_discount_code TEXT,
  recovery_discount_id TEXT, -- Stripe promotion code ID
  emails_sent JSONB DEFAULT '{"email_1hr": false, "email_24hr": false, "email_72hr": false}'::jsonb,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'recovered', 'expired', 'bounced')),
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  recovered_at TIMESTAMPTZ,
  first_email_sent_at TIMESTAMPTZ,
  second_email_sent_at TIMESTAMPTZ,
  third_email_sent_at TIMESTAMPTZ
);

-- Performance indexes
CREATE INDEX IF NOT EXISTS idx_abandoned_checkouts_user_id ON public.abandoned_checkouts(user_id);
CREATE INDEX IF NOT EXISTS idx_abandoned_checkouts_email ON public.abandoned_checkouts(email) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_abandoned_checkouts_created_at ON public.abandoned_checkouts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_abandoned_checkouts_status_created ON public.abandoned_checkouts(status, created_at);
CREATE INDEX IF NOT EXISTS idx_abandoned_checkouts_emails_sent ON public.abandoned_checkouts USING GIN (emails_sent);

-- Enable RLS
ALTER TABLE public.abandoned_checkouts ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Users can view own abandoned checkouts
CREATE POLICY "Users can view own abandoned checkouts"
  ON public.abandoned_checkouts FOR SELECT
  USING (auth.uid() = user_id);

-- Users can update own abandoned checkouts
CREATE POLICY "Users can update own abandoned checkouts"
  ON public.abandoned_checkouts FOR UPDATE
  USING (auth.uid() = user_id);

-- Service role can do everything (for email jobs and webhooks)
CREATE POLICY "Service role has full access to abandoned checkouts"
  ON public.abandoned_checkouts FOR ALL
  USING (auth.role() = 'service_role');

-- Updated_at trigger (reuses existing handle_updated_at function from profiles migration)
DROP TRIGGER IF EXISTS on_abandoned_checkouts_updated ON public.abandoned_checkouts;
CREATE TRIGGER on_abandoned_checkouts_updated
  BEFORE UPDATE ON public.abandoned_checkouts
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Helper function: Mark checkout as recovered
-- Called when a user completes purchase after receiving recovery email
CREATE OR REPLACE FUNCTION public.mark_checkout_recovered(checkout_uuid UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.abandoned_checkouts
  SET status = 'recovered',
      recovered_at = NOW(),
      updated_at = NOW()
  WHERE id = checkout_uuid;
END;
$$;

-- Only service_role can call this (webhooks, admin functions)
REVOKE ALL ON FUNCTION public.mark_checkout_recovered(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_checkout_recovered(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.mark_checkout_recovered(UUID) TO service_role;

-- Helper function: Get pending checkout for a user
-- Returns the most recent pending checkout within the last 7 days
CREATE OR REPLACE FUNCTION public.get_pending_checkout(user_uuid UUID)
RETURNS TABLE (
  id UUID,
  cart_data JSONB,
  recovery_discount_code TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ac.id,
    ac.cart_data,
    ac.recovery_discount_code
  FROM public.abandoned_checkouts ac
  WHERE ac.user_id = user_uuid
    AND ac.status = 'pending'
    AND ac.created_at > NOW() - INTERVAL '7 days'
  ORDER BY ac.created_at DESC
  LIMIT 1;
END;
$$;

-- Allow authenticated users to check their own pending checkout
GRANT EXECUTE ON FUNCTION public.get_pending_checkout(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_pending_checkout(UUID) TO service_role;

-- Helper function: Get checkouts pending email send
-- Used by the email job to find checkouts that need recovery emails
CREATE OR REPLACE FUNCTION public.get_checkouts_pending_email(
  email_type TEXT,
  delay_interval INTERVAL
)
RETURNS TABLE (
  id UUID,
  email TEXT,
  user_id UUID,
  cart_data JSONB,
  recovery_discount_code TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    ac.id,
    ac.email,
    ac.user_id,
    ac.cart_data,
    ac.recovery_discount_code,
    ac.created_at
  FROM public.abandoned_checkouts ac
  WHERE ac.status = 'pending'
    AND ac.email IS NOT NULL
    AND ac.created_at <= NOW() - delay_interval
    AND CASE
      WHEN email_type = 'email_1hr' THEN
        (ac.emails_sent->>'email_1hr')::boolean = false
      WHEN email_type = 'email_24hr' THEN
        (ac.emails_sent->>'email_1hr')::boolean = true
        AND (ac.emails_sent->>'email_24hr')::boolean = false
      WHEN email_type = 'email_72hr' THEN
        (ac.emails_sent->>'email_24hr')::boolean = true
        AND (ac.emails_sent->>'email_72hr')::boolean = false
      ELSE false
    END
  ORDER BY ac.created_at ASC;
END;
$$;

-- Only service_role can call this (email jobs)
REVOKE ALL ON FUNCTION public.get_checkouts_pending_email(TEXT, INTERVAL) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_checkouts_pending_email(TEXT, INTERVAL) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.get_checkouts_pending_email(TEXT, INTERVAL) TO service_role;

-- Helper function: Mark email as sent
CREATE OR REPLACE FUNCTION public.mark_email_sent(
  checkout_uuid UUID,
  email_type TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  timestamp_column TEXT;
BEGIN
  -- Map email type to timestamp column
  timestamp_column := CASE email_type
    WHEN 'email_1hr' THEN 'first_email_sent_at'
    WHEN 'email_24hr' THEN 'second_email_sent_at'
    WHEN 'email_72hr' THEN 'third_email_sent_at'
    ELSE NULL
  END;

  IF timestamp_column IS NULL THEN
    RAISE EXCEPTION 'Invalid email_type: %', email_type;
  END IF;

  -- Update emails_sent JSON and corresponding timestamp
  EXECUTE format('
    UPDATE public.abandoned_checkouts
    SET emails_sent = jsonb_set(emails_sent, ARRAY[%L], to_jsonb(true)),
        %I = NOW(),
        updated_at = NOW()
    WHERE id = $1
  ', email_type, timestamp_column)
  USING checkout_uuid;
END;
$$;

-- Only service_role can call this (email jobs)
REVOKE ALL ON FUNCTION public.mark_email_sent(UUID, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_email_sent(UUID, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.mark_email_sent(UUID, TEXT) TO service_role;

-- Helper function: Mark checkout as bounced (invalid email)
CREATE OR REPLACE FUNCTION public.mark_checkout_bounced(checkout_uuid UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.abandoned_checkouts
  SET status = 'bounced',
      updated_at = NOW()
  WHERE id = checkout_uuid;
END;
$$;

-- Only service_role can call this (email bounce webhooks)
REVOKE ALL ON FUNCTION public.mark_checkout_bounced(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_checkout_bounced(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.mark_checkout_bounced(UUID) TO service_role;

-- Helper function: Expire old checkouts
-- Should be called periodically to mark old pending checkouts as expired
CREATE OR REPLACE FUNCTION public.expire_old_checkouts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  expired_count INTEGER;
BEGIN
  UPDATE public.abandoned_checkouts
  SET status = 'expired',
      updated_at = NOW()
  WHERE status = 'pending'
    AND created_at < NOW() - INTERVAL '7 days';

  GET DIAGNOSTICS expired_count = ROW_COUNT;
  RETURN expired_count;
END;
$$;

-- Only service_role can call this (scheduled jobs)
REVOKE ALL ON FUNCTION public.expire_old_checkouts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.expire_old_checkouts() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.expire_old_checkouts() TO service_role;
