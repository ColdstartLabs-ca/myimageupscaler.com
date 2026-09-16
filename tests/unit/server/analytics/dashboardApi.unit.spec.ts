import { beforeEach, describe, expect, test, vi } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

describe('Amplitude dashboard API helper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  test('uses basic auth and parses event totals', async () => {
    vi.doMock('@shared/config/env', () => ({
      serverEnv: {
        AMPLITUDE_API_KEY: 'dashboard-api-key',
        AMPLITUDE_SECRET_KEY: 'dashboard-secret-key',
      },
    }));

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          series: [[2, 1]],
          seriesCollapsed: [[{ value: 3 }]],
          xValues: ['2026-04-09', '2026-04-10'],
        },
      }),
    } as Response);

    const { getAmplitudeEventTotals } = await import('@server/analytics/dashboardApi');
    const result = await getAmplitudeEventTotals({
      eventType: 'purchase_confirmed',
      startDate: '20260409',
      endDate: '20260410',
    });

    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toContain('https://amplitude.com/api/2/events/segmentation');
    expect(url).toContain('start=20260409');
    expect(url).toContain('end=20260410');
    expect(url).toContain('m=totals');

    const headers = (init?.headers ?? {}) as Record<string, string>;
    expect(headers.Authorization).toBe(
      `Basic ${Buffer.from('dashboard-api-key:dashboard-secret-key').toString('base64')}`
    );

    expect(result).toEqual({
      eventType: 'purchase_confirmed',
      metric: 'totals',
      start: '20260409',
      end: '20260410',
      xValues: ['2026-04-09', '2026-04-10'],
      dailyTotals: [2, 1],
      total: 3,
    });
  });

  test('falls back to summing daily totals when collapsed totals are missing', async () => {
    vi.doMock('@shared/config/env', () => ({
      serverEnv: {
        AMPLITUDE_API_KEY: 'dashboard-api-key',
        AMPLITUDE_SECRET_KEY: 'dashboard-secret-key',
      },
    }));

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          series: [[4, 5]],
          xValues: ['2026-04-09', '2026-04-10'],
        },
      }),
    } as Response);

    const { getAmplitudeEventTotals } = await import('@server/analytics/dashboardApi');
    const result = await getAmplitudeEventTotals({
      eventType: 'checkout_completed',
      startDate: '20260409',
      endDate: '20260410',
    });

    expect(result.total).toBe(9);
  });

  test('builds event property filters into segmentation query', async () => {
    vi.doMock('@shared/config/env', () => ({
      serverEnv: {
        AMPLITUDE_API_KEY: 'dashboard-api-key',
        AMPLITUDE_SECRET_KEY: 'dashboard-secret-key',
      },
    }));

    const { buildAmplitudeEventSegmentationUrl } = await import('@server/analytics/dashboardApi');
    const url = buildAmplitudeEventSegmentationUrl({
      eventType: 'checkout_opened',
      startDate: '20260409',
      endDate: '20260409',
      filters: [
        {
          subprop_type: 'event',
          subprop_key: 'trigger',
          subprop_op: 'is',
          subprop_value: ['model_gate'],
        },
        {
          subprop_type: 'event',
          subprop_key: 'source',
          subprop_op: 'is',
          subprop_value: ['direct_checkout'],
        },
      ],
    });

    const eventParam = new URL(url).searchParams.get('e');
    expect(eventParam).toBeTruthy();
    expect(JSON.parse(eventParam!)).toEqual({
      event_type: 'checkout_opened',
      filters: [
        {
          subprop_type: 'event',
          subprop_key: 'trigger',
          subprop_op: 'is',
          subprop_value: ['model_gate'],
        },
        {
          subprop_type: 'event',
          subprop_key: 'source',
          subprop_op: 'is',
          subprop_value: ['direct_checkout'],
        },
      ],
    });
  });

  test('marks an unknown-event 400 as unknownEvent, not a hard failure', async () => {
    vi.doMock('@shared/config/env', () => ({
      serverEnv: {
        AMPLITUDE_API_KEY: 'dashboard-api-key',
        AMPLITUDE_SECRET_KEY: 'dashboard-secret-key',
      },
    }));

    mockFetch.mockResolvedValue({
      ok: false,
      status: 400,
      text: async () => '{"error":"Invalid chart definition"}',
    } as Response);

    const { getAmplitudeEventTotals, AmplitudeDashboardApiError } =
      await import('@server/analytics/dashboardApi');

    const error = await getAmplitudeEventTotals({
      eventType: 'plan_selected',
      startDate: '20260409',
      endDate: '20260409',
    }).catch(caught => caught);

    expect(error).toBeInstanceOf(AmplitudeDashboardApiError);
    expect(error.unknownEvent).toBe(true);
    expect(error.status).toBe(400);
  });

  test('fails loudly (not unknownEvent) on a 429 rate limit', async () => {
    vi.doMock('@shared/config/env', () => ({
      serverEnv: {
        AMPLITUDE_API_KEY: 'dashboard-api-key',
        AMPLITUDE_SECRET_KEY: 'dashboard-secret-key',
      },
    }));

    mockFetch.mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => 'Too Many Requests',
    } as Response);

    const { getAmplitudeEventTotals, AmplitudeDashboardApiError } =
      await import('@server/analytics/dashboardApi');

    const error = await getAmplitudeEventTotals({
      eventType: 'purchase_confirmed',
      startDate: '20260409',
      endDate: '20260409',
    }).catch(caught => caught);

    expect(error).toBeInstanceOf(AmplitudeDashboardApiError);
    expect(error.unknownEvent).toBe(false);
    expect(error.status).toBe(429);
  });

  test('refuses to sum overlapping daily uniques when seriesCollapsed is missing', async () => {
    vi.doMock('@shared/config/env', () => ({
      serverEnv: {
        AMPLITUDE_API_KEY: 'dashboard-api-key',
        AMPLITUDE_SECRET_KEY: 'dashboard-secret-key',
      },
    }));

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({
        data: {
          series: [[4, 5]],
          xValues: ['2026-04-09', '2026-04-10'],
        },
      }),
    } as Response);

    const { getAmplitudeEventTotals } = await import('@server/analytics/dashboardApi');

    await expect(
      getAmplitudeEventTotals({
        eventType: 'checkout_opened',
        startDate: '20260409',
        endDate: '20260410',
        metric: 'uniques',
      })
    ).rejects.toThrow(/refusing to sum overlapping daily uniques/);
  });

  test('throws a clear error when the dashboard secret key is missing', async () => {
    vi.doMock('@shared/config/env', () => ({
      serverEnv: {
        AMPLITUDE_API_KEY: 'dashboard-api-key',
        AMPLITUDE_SECRET_KEY: '',
      },
    }));

    const { getAmplitudeEventTotals } = await import('@server/analytics/dashboardApi');

    await expect(
      getAmplitudeEventTotals({
        eventType: 'purchase_confirmed',
        startDate: '20260409',
        endDate: '20260409',
      })
    ).rejects.toThrow(
      'Amplitude Dashboard REST API requires both AMPLITUDE_API_KEY and AMPLITUDE_SECRET_KEY.'
    );

    expect(mockFetch).not.toHaveBeenCalled();
  });
});
