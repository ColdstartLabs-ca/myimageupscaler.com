import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  'supabase/migrations/20260718021253_free_tier_credit_grants.sql',
  'utf8'
);
const restorePolicyMigration = readFileSync(
  'supabase/migrations/20260718194900_restore_five_credit_grant_policy.sql',
  'utf8'
);

describe('free credit grant migration', () => {
  it('grants only once per user and serializes same-identity accounts', () => {
    expect(migration).toContain(
      'user_id UUID UNIQUE REFERENCES public.profiles(id) ON DELETE SET NULL'
    );
    expect(migration).toContain('pg_advisory_xact_lock');
    expect(migration).toContain('IF FOUND THEN');
    expect(migration).toContain('true,');
  });

  it('backfills legacy IPs into salted network hashes before removing raw IPs', () => {
    expect(migration).toContain(
      "WHEN p.signup_ip IS NOT NULL AND btrim(p.signup_ip) <> '' THEN p.signup_ip"
    );
    expect(migration).toContain("ELSE 'legacy:' || p.id::TEXT");
    expect(migration.indexOf("ELSE 'legacy:' || p.id::TEXT")).toBeLessThan(
      migration.indexOf('DROP COLUMN IF EXISTS signup_ip')
    );
    expect(migration).toContain('network_hash TEXT NOT NULL');
  });

  it('retains deleted-account hashes for only the enforcement window', () => {
    expect(migration).toContain('user_id IS NULL');
    expect(migration).toContain("created_at < NOW() - INTERVAL '90 days'");
    expect(migration).toContain('purge_expired_deleted_free_credit_grants');
  });

  it('reduces a second account and denies a third account within the 90-day window', () => {
    expect(migration).toContain("created_at >= NOW() - INTERVAL '90 days'");
    expect(migration).toContain(
      'WHEN v_matched_account_count = 1 THEN LEAST(p_requested_credits, 3)'
    );
    expect(migration).toContain('ELSE 0');
  });

  it('starts new profiles at zero without changing paid credit pools', () => {
    expect(migration).toContain('VALUES (NEW.id, 0, 0)');
    expect(migration).toContain(
      'subscription_credits_balance = COALESCE(subscription_credits_balance, 0) + v_granted_credits'
    );
    expect(migration).not.toContain('purchased_credits_balance =');
  });
});

describe('five-credit policy restore migration', () => {
  it('restores the exact supported 5/3/0 amounts and identity fallback', () => {
    expect(restorePolicyMigration).toContain('p_requested_credits NOT IN (0, 3, 5)');
    expect(restorePolicyMigration).toContain(
      'WHEN v_matched_account_count = 1 THEN LEAST(p_requested_credits, 3)'
    );
    expect(restorePolicyMigration).not.toContain("'ten_credit_unique_v1'");
  });

  it('preserves idempotent existing decisions and service-role-only execution', () => {
    expect(restorePolicyMigration).toContain('IF FOUND THEN');
    expect(restorePolicyMigration).toContain(
      'REVOKE ALL ON FUNCTION public.claim_free_credit_grant(UUID, TEXT, TEXT, INTEGER) FROM authenticated'
    );
    expect(restorePolicyMigration).toContain(
      'GRANT EXECUTE ON FUNCTION public.claim_free_credit_grant(UUID, TEXT, TEXT, INTEGER) TO service_role'
    );
  });

  it('removes the executed one-off SECURITY DEFINER repair and cancellation functions', () => {
    expect(restorePolicyMigration).toContain(
      'DROP FUNCTION IF EXISTS public.repair_free_credit_incident_user('
    );
    expect(restorePolicyMigration).toContain(
      'DROP FUNCTION IF EXISTS public.cancel_stale_balance_email(UUID, UUID, TEXT, INTEGER, INTEGER)'
    );
  });
});
