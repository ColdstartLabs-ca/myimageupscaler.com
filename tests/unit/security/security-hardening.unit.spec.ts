import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Security Hardening Tests
 *
 * Validates that the migrations and code changes from the 2026-02-14
 * security audit are structurally correct.
 */

const MIGRATION_DIR = join(process.cwd(), 'supabase/migrations');

function readMigration(filename: string): string {
  return readFileSync(join(MIGRATION_DIR, filename), 'utf-8');
}

describe('Security Hardening (2026-02-14 audit)', () => {
  const hardeningSql = readMigration('20260214_security_hardening.sql');

  describe('SEC-01/02/03: Credit manipulation functions revoked', () => {
    const dangerousFunctions = [
      'increment_credits',
      'decrement_credits',
      'increment_credits_with_log',
      'decrement_credits_with_log',
      'refund_credits',
    ];

    for (const fn of dangerousFunctions) {
      it(`should revoke ${fn} from authenticated and anon`, () => {
        const revokePattern = new RegExp(
          `REVOKE EXECUTE ON FUNCTION public\\.${fn}\\(.*\\) FROM (authenticated, anon|anon, authenticated)`
        );
        expect(hardeningSql).toMatch(revokePattern);
      });
    }
  });

  describe('SEC-04: Webhook event functions revoked', () => {
    const webhookFunctions = [
      'claim_webhook_event',
      'mark_webhook_event_completed',
      'mark_webhook_event_failed',
      'is_webhook_event_processed',
    ];

    for (const fn of webhookFunctions) {
      it(`should revoke ${fn} from authenticated and anon`, () => {
        const revokePattern = new RegExp(
          `REVOKE EXECUTE ON FUNCTION public\\.${fn}\\(.*\\) FROM (authenticated, anon|anon, authenticated)`
        );
        expect(hardeningSql).toMatch(revokePattern);
      });
    }
  });

  describe('SEC-05: Profiles public SELECT leak fixed', () => {
    it('should drop "Anyone can view user roles" policy', () => {
      expect(hardeningSql).toContain('DROP POLICY IF EXISTS "Anyone can view user roles" ON profiles');
    });
  });

  describe('SEC-06: Subscription column mutation protection', () => {
    it('should create prevent_subscription_self_mutation trigger function', () => {
      expect(hardeningSql).toContain(
        'CREATE OR REPLACE FUNCTION public.prevent_subscription_self_mutation()'
      );
      expect(hardeningSql).toContain('RETURNS TRIGGER');
    });

    it('should protect subscription_tier from client mutation', () => {
      expect(hardeningSql).toContain(
        "RAISE EXCEPTION 'permission denied: cannot modify subscription_tier'"
      );
    });

    it('should protect subscription_status from client mutation', () => {
      expect(hardeningSql).toContain(
        "RAISE EXCEPTION 'permission denied: cannot modify subscription_status'"
      );
    });

    it('should protect stripe_customer_id from client mutation', () => {
      expect(hardeningSql).toContain(
        "RAISE EXCEPTION 'permission denied: cannot modify stripe_customer_id'"
      );
    });

    it('should attach trigger to profiles table', () => {
      expect(hardeningSql).toContain('CREATE TRIGGER prevent_subscription_mutation');
      expect(hardeningSql).toContain('BEFORE UPDATE ON public.profiles');
    });

    it('should allow service_role to modify subscription fields', () => {
      expect(hardeningSql).toContain('auth.uid() IS NULL');
    });
  });

  describe('SEC-07: has_sufficient_credits auth check', () => {
    it('should revoke anon access to has_sufficient_credits', () => {
      expect(hardeningSql).toContain(
        'REVOKE EXECUTE ON FUNCTION public.has_sufficient_credits(uuid, integer) FROM anon'
      );
    });

    it('should add self-only auth check', () => {
      expect(hardeningSql).toContain('target_user_id != auth.uid()');
      expect(hardeningSql).toContain("cannot check other users credits");
    });

    it('should still allow service_role to check any user', () => {
      // Service role check must come before the self-only check
      const serviceRoleIdx = hardeningSql.indexOf(
        'IF auth.uid() IS NULL THEN',
        hardeningSql.indexOf('has_sufficient_credits')
      );
      const selfCheckIdx = hardeningSql.indexOf(
        'target_user_id != auth.uid()',
        hardeningSql.indexOf('has_sufficient_credits')
      );
      expect(serviceRoleIdx).toBeGreaterThan(-1);
      expect(selfCheckIdx).toBeGreaterThan(serviceRoleIdx);
    });
  });

  describe('SEC-09: Batch functions revoked from anon', () => {
    it('should revoke cleanup_old_batch_usage from anon and authenticated', () => {
      expect(hardeningSql).toMatch(
        /REVOKE EXECUTE ON FUNCTION public\.cleanup_old_batch_usage\(\) FROM (anon, authenticated|authenticated, anon)/
      );
    });

    it('should revoke check_and_increment_batch_limit from anon', () => {
      expect(hardeningSql).toContain(
        'REVOKE EXECUTE ON FUNCTION public.check_and_increment_batch_limit(uuid, integer, integer) FROM anon'
      );
    });
  });

  describe('SEC-10: Email provider functions revoked', () => {
    it('should revoke get_or_create_email_provider_usage', () => {
      expect(hardeningSql).toMatch(
        /REVOKE EXECUTE ON FUNCTION public\.get_or_create_email_provider_usage\(text, date\) FROM (authenticated, anon|anon, authenticated)/
      );
    });

    it('should revoke increment_email_provider_usage', () => {
      expect(hardeningSql).toMatch(
        /REVOKE EXECUTE ON FUNCTION public\.increment_email_provider_usage\(text, integer, integer\) FROM (authenticated, anon|anon, authenticated)/
      );
    });
  });

  describe('Code-side: Test user backdoor environment guard', () => {
    it('should require ENV === test AND NODE_ENV !== production', () => {
      const getAuthUserCode = readFileSync(
        join(process.cwd(), 'server/middleware/getAuthenticatedUser.ts'),
        'utf-8'
      );
      // Must check both conditions to prevent production bypass
      expect(getAuthUserCode).toContain("serverEnv.ENV === 'test'");
      expect(getAuthUserCode).toContain("serverEnv.NODE_ENV !== 'production'");
    });
  });

  describe('Code-side: X-User-Id header stripping on public routes', () => {
    it('should strip X-User-Id from public route requests in middleware', () => {
      const middlewareCode = readFileSync(join(process.cwd(), 'middleware.ts'), 'utf-8');
      expect(middlewareCode).toContain("strippedHeaders.delete('X-User-Id')");
    });
  });
});
