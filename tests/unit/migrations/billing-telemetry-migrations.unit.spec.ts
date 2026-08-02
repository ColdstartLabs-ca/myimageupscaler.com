import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

function migration(name: string): string {
  return readFileSync(join(process.cwd(), `supabase/migrations/${name}`), 'utf8');
}

describe('revenue telemetry migrations', () => {
  it('locks billing analytics dedupe claims to the service role', () => {
    const sql = migration('20260801000000_billing_analytics_lifecycle.sql');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.billing_analytics_events');
    expect(sql).toContain('ALTER TABLE public.billing_analytics_events ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('TO service_role');
    expect(sql).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_billing_analytics_events_source_action'
    );
  });

  it('locks payment recovery correlation state to the service role', () => {
    const sql = migration('20260801000003_billing_payment_recovery.sql');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.billing_payment_failures');
    expect(sql).toContain('ALTER TABLE public.billing_payment_failures ENABLE ROW LEVEL SECURITY');
    expect(sql).toContain('TO service_role');
  });

  it('keeps the health alert RPC security definer with a pinned search path', () => {
    const sql = migration('20260801000002_processing_health_alert_policy.sql');
    expect(sql).toContain('SECURITY DEFINER');
    expect(sql).toContain('SET search_path = public');
  });

  // REVOKE ... FROM PUBLIC does not remove the role-specific EXECUTE grants that
  // Supabase's default privileges hand to anon/authenticated. A SECURITY DEFINER
  // RPC needs all three revokes or it stays callable with the publishable key.
  it('revokes the health alert RPCs from anon and authenticated', () => {
    const sql = migration('20260802000000_harden_provider_health_alert_grants.sql');

    for (const fn of ['claim_provider_health_alert_v2', 'claim_provider_health_alert']) {
      for (const role of ['PUBLIC', 'anon', 'authenticated']) {
        expect(sql).toMatch(
          new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\)\\s*FROM ${role};`)
        );
      }
      expect(sql).toMatch(
        new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\)\\s*TO service_role;`)
      );
    }
  });
});
