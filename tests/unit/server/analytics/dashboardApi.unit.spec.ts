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
