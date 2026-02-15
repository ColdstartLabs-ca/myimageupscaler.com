import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Role Immutability Security Tests
 *
 * Validates that the migration 20260214_fix_profile_role_immutability.sql
 * contains the required protections against self-admin escalation.
 *
 * The actual DB-level enforcement is tested via integration tests against
 * a live Supabase instance. These unit tests verify the migration SQL
 * contains the expected structural safeguards.
 */

const MIGRATION_DIR = join(process.cwd(), 'supabase/migrations');

function readMigration(filename: string): string {
  return readFileSync(join(MIGRATION_DIR, filename), 'utf-8');
}

describe('Profile Role Immutability (CVE: self-admin escalation)', () => {
  const migrationSql = readMigration('20260214_fix_profile_role_immutability.sql');

  describe('Trigger-based protection', () => {
    it('should create prevent_role_self_mutation trigger function', () => {
      expect(migrationSql).toContain('CREATE OR REPLACE FUNCTION public.prevent_role_self_mutation()');
      expect(migrationSql).toContain('RETURNS TRIGGER');
    });

    it('should use SECURITY DEFINER with explicit search_path', () => {
      // SECURITY DEFINER is required so the function can query profiles
      // without being blocked by RLS on the profiles table itself
      expect(migrationSql).toContain('SECURITY DEFINER SET search_path = public');
    });

    it('should allow updates when role has not changed', () => {
      expect(migrationSql).toContain('NEW.role IS NOT DISTINCT FROM OLD.role');
    });

    it('should allow service_role (server) to change roles', () => {
      // service_role connections have auth.uid() = NULL
      expect(migrationSql).toContain('auth.uid() IS NULL');
    });

    it('should allow existing admins to change roles', () => {
      expect(migrationSql).toMatch(/SELECT 1 FROM profiles WHERE id = auth\.uid\(\) AND role = 'admin'/);
    });

    it('should raise insufficient_privilege error for non-admin role mutation', () => {
      expect(migrationSql).toContain("RAISE EXCEPTION 'permission denied: cannot modify role'");
      expect(migrationSql).toContain("ERRCODE = '42501'");
    });

    it('should attach trigger to profiles table', () => {
      expect(migrationSql).toContain('CREATE TRIGGER prevent_role_mutation');
      expect(migrationSql).toContain('BEFORE UPDATE ON public.profiles');
      expect(migrationSql).toContain('EXECUTE FUNCTION public.prevent_role_self_mutation()');
    });
  });

  describe('RLS WITH CHECK defense-in-depth', () => {
    it('should replace the old unrestricted UPDATE policy', () => {
      expect(migrationSql).toContain(
        'DROP POLICY IF EXISTS "Users can update own profile or admins can update all" ON public.profiles'
      );
    });

    it('should create new policy with WITH CHECK clause', () => {
      expect(migrationSql).toContain('WITH CHECK');
    });

    it('should check role immutability via subquery in WITH CHECK', () => {
      // The WITH CHECK should compare the new role value against the current one
      expect(migrationSql).toMatch(/role IS NOT DISTINCT FROM.*SELECT p\.role FROM.*profiles p WHERE p\.id = auth\.uid/s);
    });

    it('should allow admins to bypass the role check in WITH CHECK', () => {
      expect(migrationSql).toContain('public.is_admin(auth.uid())');
    });
  });

  describe('Original vulnerable policy should not exist standalone', () => {
    const originalMigration = readMigration('20250203_fix_admin_policy_recursion.sql');

    it('original policy had no WITH CHECK (confirming the vulnerability)', () => {
      // The original migration creates the policy with USING only, no WITH CHECK
      // This test documents the vulnerability that we're fixing
      const marker = 'CREATE POLICY "Users can update own profile or admins can update all"';
      const startIdx = originalMigration.indexOf(marker);
      expect(startIdx).toBeGreaterThan(-1);

      const policyBlock = originalMigration.slice(startIdx);
      const policyEnd = policyBlock.indexOf(';');
      const policyDef = policyBlock.slice(0, policyEnd);

      expect(policyDef).toContain('USING');
      expect(policyDef).not.toContain('WITH CHECK');
    });
  });
});
