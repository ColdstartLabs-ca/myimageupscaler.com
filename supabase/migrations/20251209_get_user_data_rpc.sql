-- Create RPC function to fetch all user data in one call
-- This reduces network requests from 8-10 to 2 on authenticated page loads
-- SECURITY: Uses auth.uid() check to prevent cross-tenant data leakage
CREATE OR REPLACE FUNCTION get_user_data(target_user_id UUID)
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
      FROM profiles p
      WHERE p.id = target_user_id
    ),
    'subscription', (
      SELECT row_to_json(s.*)
      FROM subscriptions s
      WHERE s.user_id = target_user_id
        AND s.status IN ('active', 'trialing')
      ORDER BY s.created_at DESC
      LIMIT 1
    )
  ) INTO result;

  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION get_user_data(UUID) TO authenticated;

-- Add comment for documentation
COMMENT ON FUNCTION get_user_data(UUID) IS 'Returns user profile and active subscription in a single query to reduce network overhead';
