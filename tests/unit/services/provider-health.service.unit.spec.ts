import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  env: { ENV: 'production', NODE_ENV: 'production', PLAYWRIGHT_TEST: undefined } as {
    ENV: string;
    NODE_ENV: string;
    PLAYWRIGHT_TEST: string | undefined;
  },
}));

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: { rpc: mocks.rpc },
}));

vi.mock('@shared/config/env', () => ({
  serverEnv: mocks.env,
}));

import { providerHealthService } from '@server/services/provider-health.service';

describe('providerHealthService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.ENV = 'production';
    mocks.env.NODE_ENV = 'production';
    mocks.env.PLAYWRIGHT_TEST = undefined;
  });

  it('should expose shared circuit availability', async () => {
    mocks.rpc.mockResolvedValue({
      data: [{ available: false, circuit_status: 'open', retry_at: '2026-07-26T20:00:00Z' }],
      error: null,
    });

    await expect(providerHealthService.getAvailability()).resolves.toEqual({
      available: false,
      status: 'open',
      retryAt: new Date('2026-07-26T20:00:00Z'),
    });
  });

  it('should atomically acquire a half-open probe', async () => {
    mocks.rpc.mockResolvedValue({ data: true, error: null });

    await expect(providerHealthService.acquireProcessingPermit()).resolves.toBe(true);
    expect(mocks.rpc).toHaveBeenCalledWith('acquire_provider_circuit_permit', {
      p_provider: 'image-processing',
    });
  });

  it('should record provider outcomes without throwing on telemetry failure', async () => {
    mocks.rpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(providerHealthService.recordSuccess()).resolves.toBe(true);

    mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'unavailable' } });
    await expect(providerHealthService.recordFailure('provider_unavailable')).resolves.toBe(false);
  });

  it('should atomically claim a PRD rolling-window alert', async () => {
    mocks.rpc.mockResolvedValue({
      data: [
        {
          should_alert: true,
          severity: 'critical',
          attempts: 10,
          failures: 6,
          failure_ratio: '0.6',
          baseline_ratio: '0.02',
          billing_failures: 2,
          circuit_status: 'open',
          retry_at: '2026-07-26T20:00:00Z',
        },
      ],
      error: null,
    });

    await expect(providerHealthService.claimAlert()).resolves.toEqual({
      shouldAlert: true,
      severity: 'critical',
      attempts: 10,
      failures: 6,
      failureRatio: 0.6,
      baselineRatio: 0.02,
      billingFailures: 2,
      circuitStatus: 'open',
      retryAt: new Date('2026-07-26T20:00:00Z'),
    });
    expect(mocks.rpc).toHaveBeenCalledWith('claim_provider_health_alert_v2', {
      p_provider: 'image-processing',
      p_window_minutes: 15,
      p_min_attempts: 20,
      p_warning_ratio: 0.05,
      p_critical_ratio: 0.1,
      p_baseline_multiplier: 3,
      p_alert_cooldown_minutes: 30,
    });
  });

  // The test server shares the production database, and test traffic intentionally
  // drives the provider to failure. Recording those outcomes tripped the live circuit
  // and turned every later request in the run into a 503.
  describe('test-environment isolation', () => {
    const testEnvCases = [
      { label: 'ENV=test', apply: () => (mocks.env.ENV = 'test') },
      { label: 'NODE_ENV=test', apply: () => (mocks.env.NODE_ENV = 'test') },
      { label: 'PLAYWRIGHT_TEST=true', apply: () => (mocks.env.PLAYWRIGHT_TEST = 'true') },
    ];

    for (const { label, apply } of testEnvCases) {
      it(`should never touch the shared circuit when ${label}`, async () => {
        apply();

        await expect(providerHealthService.getAvailability()).resolves.toEqual({
          available: true,
          status: 'closed',
          retryAt: null,
        });
        await expect(providerHealthService.acquireProcessingPermit()).resolves.toBe(true);
        await expect(providerHealthService.recordFailure('internal')).resolves.toBe(true);
        await expect(providerHealthService.recordSuccess()).resolves.toBe(true);

        expect(mocks.rpc).not.toHaveBeenCalled();
      });
    }
  });
});
