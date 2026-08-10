import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getAmplitudeEventTotals: vi.fn(),
  send: vi.fn(),
}));

vi.mock('@server/analytics/dashboardApi', () => ({
  getAmplitudeEventTotals: mocks.getAmplitudeEventTotals,
}));
vi.mock('@server/services/email.service', () => ({
  getEmailService: () => ({ send: mocks.send }),
}));
vi.mock('@shared/config/env', () => ({
  serverEnv: {
    AMPLITUDE_API_KEY: 'amplitude-key',
    AMPLITUDE_SECRET_KEY: 'amplitude-secret',
    PROVIDER_ALERT_EMAIL: 'ops@example.com',
  },
}));

import { getUpscaleHealthReport } from '@server/services/upscale-completion-health.service';

describe('getUpscaleHealthReport event filters', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getAmplitudeEventTotals.mockImplementation(({ eventType }: { eventType: string }) =>
      Promise.resolve({
        eventType,
        metric: 'totals',
        start: '20260809',
        end: '20260809',
        xValues: ['2026-08-09'],
        dailyTotals: [10],
        total: 10,
      })
    );
  });

  it('queries canonical server telemetry and only successful completions', async () => {
    await getUpscaleHealthReport({ startDate: '20260809', endDate: '20260809' });

    expect(mocks.getAmplitudeEventTotals).toHaveBeenCalledTimes(3);

    const callsByEvent = new Map(
      mocks.getAmplitudeEventTotals.mock.calls.map(([params]) => [params.eventType, params])
    );
    const serverFilter = expect.objectContaining({
      subprop_key: 'telemetrySource',
      subprop_op: 'is',
      subprop_value: ['server'],
    });

    expect(callsByEvent.get('image_upscale_started').filters).toEqual([serverFilter]);
    expect(callsByEvent.get('processing_failed').filters).toEqual([serverFilter]);
    expect(callsByEvent.get('upscale_completed').filters).toEqual([
      serverFilter,
      expect.objectContaining({
        subprop_key: 'success',
        subprop_op: 'is',
        subprop_value: ['true'],
      }),
    ]);
  });
});
