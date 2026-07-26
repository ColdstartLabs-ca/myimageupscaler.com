-- Enable RLS on email_provider_usage table
-- This table tracks aggregate email provider usage across all users
-- Access should be via RPC functions only

ALTER TABLE public.email_provider_usage ENABLE ROW LEVEL SECURITY;

-- Service role can do everything (for admin operations)
CREATE POLICY "Service role full access to email_provider_usage"
  ON public.email_provider_usage
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Deny direct access from authenticated users
-- They should only access via RPC functions (get_or_create_email_provider_usage, increment_email_provider_usage)
CREATE POLICY "Deny authenticated direct access to email_provider_usage"
  ON public.email_provider_usage
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- Deny access from anon users
CREATE POLICY "Deny anon access to email_provider_usage"
  ON public.email_provider_usage
  FOR ALL
  TO anon
  USING (false)
  WITH CHECK (false);
