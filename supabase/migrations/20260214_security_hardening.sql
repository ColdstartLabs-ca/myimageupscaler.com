-- Security Hardening Migration
-- Date: 2026-02-14
-- Severity: CRITICAL
-- Addresses: SEC-01 through SEC-10 from security audit
--
-- All functions below are called server-side via supabaseAdmin (service_role),
-- so revoking from authenticated/anon does NOT break the app.
-- Exception: has_sufficient_credits is called client-side, so we add an
-- auth check instead of revoking.

-- ============================================
-- SEC-01/02/03: Revoke credit manipulation functions
-- These are only called via supabaseAdmin (service_role) in:
--   server/services/replicate/utils/credit-manager.ts
-- ============================================

REVOKE EXECUTE ON FUNCTION public.increment_credits(uuid, integer) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.decrement_credits(uuid, integer) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.increment_credits_with_log(uuid, integer, text, text, text) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.decrement_credits_with_log(uuid, integer, text, text, text) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.refund_credits(uuid, integer, text) FROM authenticated, anon;

-- ============================================
-- SEC-04: Revoke webhook event functions
-- These are called by the webhook handler which uses service_role.
-- No application code calls these via client supabase.
-- ============================================

REVOKE EXECUTE ON FUNCTION public.claim_webhook_event(text, text, jsonb) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.mark_webhook_event_completed(text) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.mark_webhook_event_failed(text, text) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.is_webhook_event_processed(text) FROM authenticated, anon;

-- ============================================
-- SEC-05: Drop overly permissive profiles SELECT policy
-- The "Anyone can view user roles" policy exposes ALL profile data
-- (stripe_customer_id, credit balances, roles) to unauthenticated users.
-- Client code reads profiles via authenticated session, which is covered
-- by "Users can view own profile or admins can view all".
-- ============================================

DROP POLICY IF EXISTS "Anyone can view user roles" ON profiles;

-- ============================================
-- SEC-06: Protect subscription columns from client mutation
-- Users can currently UPDATE subscription_tier, subscription_status,
-- and stripe_customer_id on their own profile.
-- Only Stripe webhooks (via service_role) should modify these.
-- ============================================

CREATE OR REPLACE FUNCTION public.prevent_subscription_self_mutation()
RETURNS TRIGGER AS $$
BEGIN
  -- Service role can change anything
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- Admins can change anything
  IF EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RETURN NEW;
  END IF;

  -- Block subscription_tier changes
  IF NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier THEN
    RAISE EXCEPTION 'permission denied: cannot modify subscription_tier'
      USING ERRCODE = '42501';
  END IF;

  -- Block subscription_status changes
  IF NEW.subscription_status IS DISTINCT FROM OLD.subscription_status THEN
    RAISE EXCEPTION 'permission denied: cannot modify subscription_status'
      USING ERRCODE = '42501';
  END IF;

  -- Block stripe_customer_id changes
  IF NEW.stripe_customer_id IS DISTINCT FROM OLD.stripe_customer_id THEN
    RAISE EXCEPTION 'permission denied: cannot modify stripe_customer_id'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION public.prevent_subscription_self_mutation() IS
'SECURITY: Prevents non-admin users from escalating privileges by modifying subscription_tier, subscription_status, or stripe_customer_id. Only service_role and admins can change these.';

DROP TRIGGER IF EXISTS prevent_subscription_mutation ON public.profiles;

CREATE TRIGGER prevent_subscription_mutation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_subscription_self_mutation();

-- ============================================
-- SEC-07: Add auth check to has_sufficient_credits
-- This is called from the CLIENT (stripeService.ts), so we cannot
-- revoke from authenticated. Instead, add a self-only check.
-- Also revoke anon access.
-- ============================================

REVOKE EXECUTE ON FUNCTION public.has_sufficient_credits(uuid, integer) FROM anon;

-- Recreate with auth check (users can only check their own credits)
CREATE OR REPLACE FUNCTION public.has_sufficient_credits(target_user_id uuid, required_amount integer)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Service role can check anyone
  IF auth.uid() IS NULL THEN
    RETURN (
      SELECT (subscription_credits_balance + purchased_credits_balance) >= required_amount
      FROM profiles WHERE id = target_user_id
    );
  END IF;

  -- Authenticated users can only check their own credits
  IF target_user_id != auth.uid() THEN
    RAISE EXCEPTION 'permission denied: cannot check other users credits'
      USING ERRCODE = '42501';
  END IF;

  RETURN (
    SELECT (subscription_credits_balance + purchased_credits_balance) >= required_amount
    FROM profiles WHERE id = target_user_id
  );
END;
$$;

-- ============================================
-- SEC-09: Revoke batch functions from anon
-- These are only called via supabaseAdmin in:
--   server/services/batch-limit.service.ts
-- ============================================

REVOKE EXECUTE ON FUNCTION public.cleanup_old_batch_usage() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.check_and_increment_batch_limit(uuid, integer, integer) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_batch_usage(uuid, integer, integer) FROM anon;

-- ============================================
-- SEC-10: Revoke email provider functions from authenticated/anon
-- These are only called via supabaseAdmin in:
--   server/services/provider-credit-tracker.service.ts
-- ============================================

REVOKE EXECUTE ON FUNCTION public.get_or_create_email_provider_usage(text, date) FROM authenticated, anon;
REVOKE EXECUTE ON FUNCTION public.increment_email_provider_usage(text, integer, integer) FROM authenticated, anon;
