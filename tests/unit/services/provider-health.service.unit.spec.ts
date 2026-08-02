import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
}));

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: { rpc: mocks.rpc },
}));

import { providerHealthService } from '@server/services/provider-health.service';

describe('providerHealthService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
});
