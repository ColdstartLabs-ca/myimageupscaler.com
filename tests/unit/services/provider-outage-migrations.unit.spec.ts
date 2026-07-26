import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const quotaMigration = readFileSync(
  'supabase/migrations/20260726131000_provider_outage_quota_release.sql',
  'utf8'
);
const healthMigration = readFileSync(
  'supabase/migrations/20260726132000_provider_health_circuit.sql',
  'utf8'
);

describe('provider outage database contracts', () => {
  it('should release quota atomically without allowing a negative count', () => {
    expect(quotaMigration).toContain('CREATE OR REPLACE FUNCTION public.release_batch_limit_slot');
    expect(quotaMigration).toMatch(/count\s*=\s*GREATEST\(count - 1, 0\)/);
    expect(quotaMigration).toContain(
      'GRANT EXECUTE ON FUNCTION public.release_batch_limit_slot(UUID, INTEGER) TO service_role'
    );
    expect(quotaMigration).toContain(
      'REVOKE EXECUTE ON FUNCTION public.release_batch_limit_slot(UUID, INTEGER) FROM anon, authenticated'
    );
  });

  it('should use shared circuit state and an idempotent rolling-window alert claim', () => {
    expect(healthMigration).toContain('CREATE TABLE IF NOT EXISTS public.provider_health_state');
    expect(healthMigration).toContain(
      'CREATE OR REPLACE FUNCTION public.acquire_provider_circuit_permit'
    );
    expect(healthMigration).toContain('p_failure_threshold INTEGER DEFAULT 5');
    expect(healthMigration).toContain('p_window_minutes INTEGER DEFAULT 10');
    expect(healthMigration).toContain('p_min_attempts INTEGER DEFAULT 5');
    expect(healthMigration).toContain('p_failure_ratio NUMERIC DEFAULT 0.5');
    expect(healthMigration).toMatch(/last_alerted_at\s*=\s*NOW\(\)/);
  });
});
