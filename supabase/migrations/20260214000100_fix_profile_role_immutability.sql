-- Fix: Prevent non-admin users from mutating their own `role` column
-- Date: 2026-02-14
-- Severity: CRITICAL
-- Issue: The profiles UPDATE RLS policy allows authenticated users to update
--        their entire row including `role`. A user can call:
--          UPDATE profiles SET role = 'admin' WHERE id = auth.uid()
--        via the Supabase client (which ships with the anon key + user JWT),
--        then use admin endpoints to mint credits.
--
-- Fix: Add a BEFORE UPDATE trigger that rejects role changes from non-admin,
--       non-service-role callers. This is defense-in-depth on top of RLS.

-- ============================================
-- Step 1: Create trigger function
-- ============================================

CREATE OR REPLACE FUNCTION public.prevent_role_self_mutation()
RETURNS TRIGGER AS $$
BEGIN
  -- If role hasn't changed, allow the update
  IF NEW.role IS NOT DISTINCT FROM OLD.role THEN
    RETURN NEW;
  END IF;

  -- Service role (admin API / server operations) can change roles
  -- auth.uid() returns NULL for service_role connections
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- If the caller is already an admin, allow
  IF EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin'
  ) THEN
    RETURN NEW;
  END IF;

  -- Block: non-admin user trying to change their own role
  RAISE EXCEPTION 'permission denied: cannot modify role'
    USING ERRCODE = '42501'; -- insufficient_privilege
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION public.prevent_role_self_mutation() IS
'SECURITY: Prevents non-admin users from escalating privileges by updating their own role column. Only admins and service_role can change roles.';

-- ============================================
-- Step 2: Attach trigger to profiles table
-- ============================================

DROP TRIGGER IF EXISTS prevent_role_mutation ON public.profiles;

CREATE TRIGGER prevent_role_mutation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_role_self_mutation();

-- ============================================
-- Step 3: Tighten the RLS UPDATE policy (belt + suspenders)
-- The trigger is the primary guard; this WITH CHECK is defense-in-depth.
-- ============================================

-- Drop stale duplicate policy (no WITH CHECK, redundant with the one below)
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

DROP POLICY IF EXISTS "Users can update own profile or admins can update all" ON public.profiles;

CREATE POLICY "Users can update own profile or admins can update all"
ON public.profiles FOR UPDATE
TO authenticated
USING (
    auth.uid() = id
    OR public.is_admin(auth.uid())
)
WITH CHECK (
    -- Admins can write any value
    public.is_admin(auth.uid())
    OR (
        -- Non-admins: own row only, and role must stay unchanged
        auth.uid() = id
        AND role IS NOT DISTINCT FROM (
            SELECT p.role FROM public.profiles p WHERE p.id = auth.uid()
        )
    )
);
