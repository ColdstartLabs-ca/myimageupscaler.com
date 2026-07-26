-- Fix email_logs RLS policy
-- The previous "Service role can insert logs" policy with WITH CHECK (true)
-- was effectively open to any authenticated role.
-- Service role bypasses RLS anyway, so we remove the INSERT policy entirely.
-- This ensures only service role (supabaseAdmin) can insert logs.

DROP POLICY IF EXISTS "Service role can insert logs" ON public.email_logs;

-- Note: No INSERT policy means only service role (which bypasses RLS) can insert.
-- Users can only SELECT their own logs via the existing "Users can view own email logs" policy.
