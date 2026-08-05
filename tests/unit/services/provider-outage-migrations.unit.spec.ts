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
const billingAlertMigration = readFileSync(
  'supabase/migrations/20260726133000_immediate_provider_billing_alert.sql',
  'utf8'
);
const halfOpenRecoveryMigration = readFileSync(
  'supabase/migrations/20260805182000_provider_circuit_half_open_recovery.sql',
  'utf8'
);
const circuitGrantsMigration = readFileSync(
  'supabase/migrations/20260805210000_harden_provider_circuit_grants.sql',
  'utf8'
);
const upscaleRoute = readFileSync('app/api/upscale/route.ts', 'utf8');

function functionBody(migration: string, declaration: string): string {
  const start = migration.indexOf(declaration);
  if (start === -1) {
    throw new Error(`Missing declaration: ${declaration}`);
  }
  const end = migration.indexOf('$$;', start);
  if (end === -1) {
    throw new Error(`Unterminated function body: ${declaration}`);
  }
  return migration.slice(start, end);
}

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

  it('should alert on the first provider billing failure without weakening rate alerts', () => {
    expect(billingAlertMigration).toContain('v_billing_failures > 0');
    expect(billingAlertMigration).toContain('v_attempts >= p_min_attempts');
    expect(billingAlertMigration).toContain('v_ratio >= p_failure_ratio');
    expect(billingAlertMigration).toContain('p_alert_cooldown_minutes');
    expect(billingAlertMigration).toContain(
      'GRANT EXECUTE ON FUNCTION public.claim_provider_health_alert'
    );
  });
});

describe('half-open circuit probe recovery', () => {
  it('should track probe start in a dedicated column, not updated_at', () => {
    expect(halfOpenRecoveryMigration).toMatch(
      /ALTER TABLE public\.provider_health_state\s+ADD COLUMN IF NOT EXISTS half_open_since TIMESTAMP WITH TIME ZONE;/
    );
    expect(halfOpenRecoveryMigration).toContain(
      'COMMENT ON COLUMN public.provider_health_state.half_open_since'
    );
  });

  it('should time-bound the probe above the route provider timeout', () => {
    const routeTimeoutMs = Number(
      /const PROCESSING_TIMEOUT_MS = (\d+);/.exec(upscaleRoute)?.[1] ?? NaN
    );
    const probeTimeoutSeconds = Number(
      /INTERVAL '(\d+) seconds'/.exec(halfOpenRecoveryMigration)?.[1] ?? NaN
    );

    expect(routeTimeoutMs).toBe(120000);
    expect(probeTimeoutSeconds).toBe(180);
    expect(probeTimeoutSeconds * 1000).toBeGreaterThan(routeTimeoutMs);
  });

  it('should hand the permit to a new prober when the probe is stale or was never stamped', () => {
    const acquire = functionBody(
      halfOpenRecoveryMigration,
      'CREATE OR REPLACE FUNCTION public.acquire_provider_circuit_permit'
    );

    // Only a fresh, stamped probe blocks. A legacy row with NULL half_open_since is stale.
    expect(acquire).toMatch(
      /IF v_state\.status = 'half_open'\s+AND v_state\.half_open_since IS NOT NULL\s+AND v_state\.half_open_since > NOW\(\) - INTERVAL '180 seconds'\s+THEN\s+RETURN FALSE;/
    );
    expect(acquire).not.toMatch(/IF v_state\.status = 'half_open' THEN\s+RETURN FALSE;/);

    expect(acquire).toMatch(
      /IF v_state\.status = 'open' AND v_state\.opened_until > NOW\(\) THEN\s+RETURN FALSE;/
    );

    // Expired cooldown OR abandoned probe both re-arm a single new probe.
    expect(acquire).toMatch(
      /IF v_state\.status IN \('open', 'half_open'\) THEN[\s\S]*?SET status = 'half_open', half_open_since = NOW\(\), updated_at = NOW\(\)/
    );
    expect(acquire).toContain('FOR UPDATE;');
    expect(acquire).toContain('RETURN TRUE;');
  });

  it('should report a stale half_open as available while a fresh probe still blocks', () => {
    const availability = functionBody(
      halfOpenRecoveryMigration,
      'CREATE OR REPLACE FUNCTION public.get_provider_circuit_availability'
    );

    expect(availability).toMatch(
      /WHEN state\.status = 'half_open'\s+AND state\.half_open_since IS NOT NULL\s+AND state\.half_open_since > NOW\(\) - INTERVAL '180 seconds' THEN FALSE/
    );
    expect(availability).not.toMatch(/WHEN state\.status = 'half_open' THEN FALSE/);
    expect(availability).toContain(
      "WHEN state.status = 'open' AND state.opened_until > NOW() THEN FALSE"
    );

    // circuit_status behaviour is unchanged.
    expect(availability).toContain(
      "WHEN state.status = 'open' AND state.opened_until <= NOW() THEN 'half_open'"
    );

    // retry_at exposes the probe deadline instead of NULL so the client gets a real hint.
    expect(availability).toMatch(
      /THEN state\.half_open_since \+ INTERVAL '180 seconds'\s+ELSE NULL/
    );

    // The no-state-row fallback survives the replacement.
    expect(availability).toContain('UNION ALL');
    expect(availability).toContain("SELECT TRUE, 'closed', NULL::TIMESTAMP WITH TIME ZONE");
    expect(availability).toContain('LANGUAGE sql');
    expect(availability).toContain('STABLE');
  });

  it('should clear the probe stamp on both success and failure outcomes', () => {
    const record = functionBody(
      halfOpenRecoveryMigration,
      'CREATE OR REPLACE FUNCTION public.record_provider_health_outcome'
    );

    expect(record.match(/half_open_since = NULL/g)).toHaveLength(2);
    expect(record).toMatch(
      /status = 'closed',\s+consecutive_failures = 0,\s+opened_until = NULL,\s+half_open_since = NULL,/
    );
    expect(record).toMatch(/half_open_since = NULL,\s+last_failure_at = NOW\(\)/);

    // Thresholds and cooldown behaviour must be untouched.
    expect(record).toContain('p_failure_threshold INTEGER DEFAULT 5');
    expect(record).toContain('p_cooldown_seconds INTEGER DEFAULT 300');
    expect(record).toContain(
      "WHEN v_state.status = 'half_open' OR v_failure_count >= p_failure_threshold"
    );
    expect(record).toContain('NOW() + make_interval(secs => p_cooldown_seconds)');
  });

  it('should keep the one-argument signatures and service-role-only grants', () => {
    expect(halfOpenRecoveryMigration).toContain(
      'CREATE OR REPLACE FUNCTION public.acquire_provider_circuit_permit(p_provider TEXT)'
    );
    expect(halfOpenRecoveryMigration).toContain(
      'CREATE OR REPLACE FUNCTION public.get_provider_circuit_availability(p_provider TEXT)'
    );

    // A defaulted extra parameter would create an ambiguous overload for existing 1-arg calls.
    expect(halfOpenRecoveryMigration).not.toMatch(
      /acquire_provider_circuit_permit\(\s*p_provider TEXT\s*,/
    );
    expect(halfOpenRecoveryMigration).not.toMatch(
      /get_provider_circuit_availability\(\s*p_provider TEXT\s*,/
    );

    for (const signature of [
      'public.get_provider_circuit_availability(TEXT)',
      'public.acquire_provider_circuit_permit(TEXT)',
      'public.record_provider_health_outcome(TEXT, BOOLEAN, TEXT, INTEGER, INTEGER)',
    ]) {
      expect(halfOpenRecoveryMigration).toContain(`REVOKE ALL ON FUNCTION ${signature}`);
      expect(halfOpenRecoveryMigration).toContain(`GRANT EXECUTE ON FUNCTION ${signature}`);
    }

    // The alert-claim hardening migration owns those grants; this one must not touch them.
    expect(halfOpenRecoveryMigration).not.toMatch(
      /(REVOKE|GRANT)[^;]*(claim_provider_health_alert|release_provider_health_alert_claim)/
    );
  });
});

describe('provider circuit function grants', () => {
  const SERVER_ONLY_SIGNATURES = [
    'public.acquire_provider_circuit_permit(TEXT)',
    'public.get_provider_circuit_availability(TEXT)',
  ];

  it('should strip the inherited anon and authenticated execute grants', () => {
    // REVOKE ... FROM PUBLIC does not remove Supabase's bootstrap role grants, so each role
    // must be revoked explicitly. Verified in production: all three had anon=X/authenticated=X.
    for (const signature of SERVER_ONLY_SIGNATURES) {
      expect(circuitGrantsMigration).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM PUBLIC`);
      expect(circuitGrantsMigration).toContain(`REVOKE ALL ON FUNCTION ${signature} FROM anon`);
      expect(circuitGrantsMigration).toContain(
        `REVOKE ALL ON FUNCTION ${signature} FROM authenticated`
      );
      expect(circuitGrantsMigration).toContain(
        `GRANT EXECUTE ON FUNCTION ${signature} TO service_role`
      );
    }
  });

  it('should revoke the outcome recorder that could otherwise be used to trip the circuit', () => {
    const recorder =
      /record_provider_health_outcome\(\s*TEXT, BOOLEAN, TEXT, INTEGER, INTEGER\s*\)/;

    for (const role of ['PUBLIC', 'anon', 'authenticated']) {
      expect(circuitGrantsMigration).toMatch(
        new RegExp(`REVOKE ALL ON FUNCTION public\\.${recorder.source}\\s*FROM ${role};`)
      );
    }

    expect(circuitGrantsMigration).toMatch(
      new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${recorder.source}\\s*TO service_role;`)
    );
  });

  it('should leave the alert-claim grants to their own migration', () => {
    expect(circuitGrantsMigration).not.toMatch(
      /(REVOKE|GRANT)[^;]*(claim_provider_health_alert|release_provider_health_alert_claim)/
    );
  });
});
