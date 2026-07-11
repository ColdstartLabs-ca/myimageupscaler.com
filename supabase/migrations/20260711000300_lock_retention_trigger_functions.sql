REVOKE ALL ON FUNCTION public.capture_subscription_retention_state()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.block_stale_retention_email()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.capture_subscription_retention_chargeback()
  FROM PUBLIC, anon, authenticated;
