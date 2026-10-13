import { beforeEach, describe, expect, it, vi } from 'vitest';

// vitest.setup.tsx mocks dayjs and dayjs/plugin/utc globally, and that mock's
// format('YYYY-MM-DD') always derives the UTC date. That mask hides the
// local-time day boundary bug, so this file uses the real date library.
vi.unmock('dayjs');
vi.unmock('dayjs/plugin/utc');

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  send: vi.fn(),
  getCronJobHealth: vi.fn(),
  measureR2AccountPayloadBytes: vi.fn(),
}));

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: { rpc: mocks.rpc, from: mocks.from },
}));
vi.mock('@server/services/email.service', () => ({
  getEmailService: () => ({ send: mocks.send }),
}));
vi.mock('@server/services/cronHealth.service', () => ({
  getCronJobHealth: mocks.getCronJobHealth,
}));
vi.mock('@server/services/r2-quota-metrics.service', () => ({
  measureR2AccountPayloadBytes: mocks.measureR2AccountPayloadBytes,
}));
vi.mock('@shared/config/env', () => ({
  serverEnv: { PROVIDER_ALERT_EMAIL: 'alerts@example.com' },
}));

import {
  computeDaysLeft,
  computeGrowthBytesPerDay,
  computeUtilization,
  runDailyQuotaGuard,
  MIU_QUOTA_BUDGETS,
  QUOTA_ALERT_THRESHOLD,
} from '@server/services/quotaGuard.service';

function sampleTable(rows: Array<Record<string, unknown>>, captureGte?: (value: string) => void) {
  const chain: Record<string, unknown> = {};
  chain.select = () => chain;
  chain.gte = (_column: string, value: string) => {
    captureGte?.(value);
    return chain;
  };
  chain.order = () => Promise.resolve({ data: rows, error: null });
  return chain;
}

describe('quota guard math', () => {
  it('computes utilization against the budget', () => {
    expect(computeUtilization(0, 100)).toBe(0);
    expect(computeUtilization(50, 100)).toBe(0.5);
    expect(computeUtilization(80, 100)).toBe(QUOTA_ALERT_THRESHOLD);
    expect(() => computeUtilization(1, 0)).toThrow();
  });

  it('computes byte growth per day across the span', () => {
    expect(
      computeGrowthBytesPerDay([
        { day: '2026-09-01', bytes: 100 },
        { day: '2026-09-11', bytes: 1100 },
      ])
    ).toBe(100);
    expect(computeGrowthBytesPerDay([{ day: '2026-09-01', bytes: 100 }])).toBeNull();
    expect(
      computeGrowthBytesPerDay([
        { day: '2026-09-01', bytes: 100 },
        { day: '2026-09-01', bytes: 200 },
      ])
    ).toBeNull();
  });

  it('computes days left and treats non-positive growth as no runway limit', () => {
    expect(computeDaysLeft(0, 1000, 100)).toBe(10);
    expect(computeDaysLeft(950, 1000, 100)).toBe(1);
    expect(computeDaysLeft(1000, 1000, 100)).toBe(0);
    expect(computeDaysLeft(500, 1000, 0)).toBeNull();
    expect(computeDaysLeft(500, 1000, -5)).toBeNull();
  });
});

describe('runDailyQuotaGuard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.send.mockResolvedValue({ success: true });
    mocks.from.mockReturnValue(sampleTable([]));
    mocks.getCronJobHealth.mockResolvedValue([]);
    mocks.measureR2AccountPayloadBytes.mockResolvedValue(null);
  });

  it('alerts when a measured resource reaches the threshold and reports r2 as unmeasured', async () => {
    mocks.rpc.mockImplementation((name: string) => {
      if (name === 'measure_current_database_bytes') {
        return Promise.resolve({ data: 400_000_000, error: null });
      }
      if (name === 'measure_supabase_storage_bytes') {
        return Promise.resolve({ data: 10_000_000, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const result = await runDailyQuotaGuard(new Date('2026-10-10T02:00:00.000Z'));

    expect(result.day).toBe('2026-10-10');
    expect(result.alertCount).toBe(1);
    expect(result.alerted).toBe(true);
    expect(result.r2Measured).toBe(false);

    const database = result.resources.find(resource => resource.resource === 'database');
    expect(database?.measured).toBe(true);
    expect(database?.alert).toBe(true);
    expect(database?.budgetBytes).toBe(MIU_QUOTA_BUDGETS.databaseBytes);

    const r2 = result.resources.find(resource => resource.resource === 'r2');
    expect(r2?.measured).toBe(false);
    expect(r2?.alert).toBe(false);

    expect(mocks.rpc).toHaveBeenCalledWith('record_quota_guard_sample', expect.any(Object));
    expect(mocks.send).toHaveBeenCalledOnce();
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({ to: 'alerts@example.com', template: 'quota-guard-alert' })
    );
  });

  it('does not alert below the threshold', async () => {
    mocks.rpc.mockImplementation((name: string) => {
      if (name === 'measure_current_database_bytes') {
        return Promise.resolve({ data: 100_000_000, error: null });
      }
      if (name === 'measure_supabase_storage_bytes') {
        return Promise.resolve({ data: 1_000_000, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const result = await runDailyQuotaGuard(new Date('2026-10-10T02:00:00.000Z'));

    expect(result.alertCount).toBe(0);
    expect(result.alerted).toBe(false);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('alerts and includes stale cron jobs even when no byte resource is over budget', async () => {
    mocks.getCronJobHealth.mockResolvedValue([
      { jobKey: 'database-retention', lastSuccessAt: null, counts: {}, stale: true },
      { jobKey: 'upscale-input-cleanup', lastSuccessAt: null, counts: {}, stale: false },
    ]);
    mocks.rpc.mockImplementation((name: string) => {
      if (name === 'measure_current_database_bytes') {
        return Promise.resolve({ data: 100_000_000, error: null });
      }
      if (name === 'measure_supabase_storage_bytes') {
        return Promise.resolve({ data: 1_000_000, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    const result = await runDailyQuotaGuard(new Date('2026-10-10T02:00:00.000Z'));

    expect(result.staleCronJobs).toEqual(['database-retention']);
    expect(result.alertCount).toBe(1);
    expect(result.alerted).toBe(true);
    expect(mocks.send).toHaveBeenCalledOnce();
    expect(mocks.send).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ staleCronJobs: ['database-retention'] }),
      })
    );
  });

  it('fails closed when a measurement RPC fails', async () => {
    mocks.rpc.mockImplementation((name: string) => {
      if (name === 'measure_current_database_bytes') {
        return Promise.resolve({ data: null, error: { message: 'no such function' } });
      }
      return Promise.resolve({ data: null, error: null });
    });

    await expect(runDailyQuotaGuard(new Date('2026-10-10T02:00:00.000Z'))).rejects.toThrow(
      /measure_current_database_bytes/
    );
    expect(mocks.send).not.toHaveBeenCalled();
  });
});

describe('runDailyQuotaGuard R2 measurement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.send.mockResolvedValue({ success: true });
    mocks.from.mockReturnValue(sampleTable([]));
    mocks.getCronJobHealth.mockResolvedValue([]);
    mocks.measureR2AccountPayloadBytes.mockResolvedValue(null);
    mocks.rpc.mockImplementation((name: string) => {
      if (name === 'measure_current_database_bytes') {
        return Promise.resolve({ data: 100_000_000, error: null });
      }
      if (name === 'measure_supabase_storage_bytes') {
        return Promise.resolve({ data: 1_000_000, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
  });

  it('alerts when measured R2 payload reaches 80% of budget', async () => {
    mocks.measureR2AccountPayloadBytes.mockResolvedValue(9_000_000_000);

    const result = await runDailyQuotaGuard(new Date('2026-10-10T02:00:00.000Z'));

    expect(result.r2Measured).toBe(true);
    const r2 = result.resources.find(resource => resource.resource === 'r2');
    expect(r2?.measured).toBe(true);
    expect(r2?.currentBytes).toBe(9_000_000_000);
    expect(r2?.alert).toBe(true);
    expect(result.alertCount).toBe(1);
    expect(mocks.send).toHaveBeenCalledOnce();
  });

  it('accepts a real measured zero as measured and does not alert', async () => {
    mocks.measureR2AccountPayloadBytes.mockResolvedValue(0);

    const result = await runDailyQuotaGuard(new Date('2026-10-10T02:00:00.000Z'));

    expect(result.r2Measured).toBe(true);
    const r2 = result.resources.find(resource => resource.resource === 'r2');
    expect(r2?.measured).toBe(true);
    expect(r2?.currentBytes).toBe(0);
    expect(r2?.alert).toBe(false);
    expect(result.alertCount).toBe(0);
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it('persists measured R2 bytes and computes growth from stored samples', async () => {
    mocks.measureR2AccountPayloadBytes.mockResolvedValue(5_000_000_000);
    mocks.from.mockReturnValue(
      sampleTable([
        { sample_day: '2026-09-01', database_bytes: 1, storage_bytes: 1, r2_bytes: 1_000 },
        { sample_day: '2026-09-11', database_bytes: 1, storage_bytes: 1, r2_bytes: 2_000 },
      ])
    );

    const result = await runDailyQuotaGuard(new Date('2026-10-10T02:00:00.000Z'));

    expect(result.r2Measured).toBe(true);
    const r2 = result.resources.find(resource => resource.resource === 'r2');
    expect(r2?.growthBytesPerDay).toBe(100);
    const persist = mocks.rpc.mock.calls.find(([name]) => name === 'record_quota_guard_sample');
    expect(persist?.[1]).toMatchObject({ p_r2_bytes: 5_000_000_000 });
  });
});

describe('runDailyQuotaGuard UTC day boundary (real dayjs)', () => {
  let sinceWindow: string | undefined;

  beforeEach(() => {
    vi.clearAllMocks();
    sinceWindow = undefined;
    mocks.send.mockResolvedValue({ success: true });
    mocks.from.mockImplementation(() => sampleTable([], value => (sinceWindow = value)));
    mocks.getCronJobHealth.mockResolvedValue([]);
    mocks.rpc.mockImplementation((name: string) => {
      if (name === 'measure_current_database_bytes') {
        return Promise.resolve({ data: 1_000, error: null });
      }
      if (name === 'measure_supabase_storage_bytes') {
        return Promise.resolve({ data: 1_000, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });
  });

  // 2026-10-10T05:00:00Z is 2026-10-09 22:00 in America/Los_Angeles (UTC-7 in
  // October), so the local calendar date is one day behind the UTC date. Run
  // this suite with TZ=America/Los_Angeles to exercise the boundary.
  it('persists the UTC sample day when the local date is the previous day', async () => {
    const now = new Date('2026-10-10T05:00:00.000Z');

    const result = await runDailyQuotaGuard(now);

    expect(result.day).toBe('2026-10-10');
    const persist = mocks.rpc.mock.calls.find(([name]) => name === 'record_quota_guard_sample');
    expect(persist?.[1]).toMatchObject({ p_sample_day: '2026-10-10' });
  });

  it('queries the 30-day window from the UTC date', async () => {
    // 2026-09-20T06:00:00Z is 2026-09-19 23:00 locally.
    await runDailyQuotaGuard(new Date('2026-09-20T06:00:00.000Z'));

    // 30 UTC days before 2026-09-20 is 2026-08-21.
    expect(sinceWindow).toBe('2026-08-21');
  });
});
