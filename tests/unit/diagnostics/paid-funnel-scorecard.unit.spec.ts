import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHECKOUT_BOUND_DESTINATIONS,
  PAID_FUNNEL_STAGES,
  collectPages,
  formatMinorUnits,
  formatRate,
  getDefaultWindow,
  parseScorecardArgs,
  runScorecard,
  toUnixRange,
} from '@/scripts/diagnostics/paid-funnel-scorecard';
import { AmplitudeDashboardApiError } from '@server/analytics/dashboardApi';
import type { IAmplitudeEventTotalsParams } from '@server/analytics/dashboardApi';
import { CORE_KPI_EVENT_NAMES } from '@server/analytics/coreKpiDefinitions';

const mocks = vi.hoisted(() => ({
  getAmplitudeEventTotals: vi.fn(),
  chargesList: vi.fn(),
  balanceList: vi.fn(),
  from: vi.fn(),
  stripeCtor: vi.fn(),
}));

vi.mock('@server/analytics/dashboardApi', async importOriginal => {
  const actual = await importOriginal<typeof import('@server/analytics/dashboardApi')>();
  return { ...actual, getAmplitudeEventTotals: mocks.getAmplitudeEventTotals };
});

vi.mock('stripe', () => ({ default: mocks.stripeCtor }));

vi.mock('@supabase/supabase-js', () => ({ createClient: () => ({ from: mocks.from }) }));

vi.mock('@shared/config/env', () => ({
  serverEnv: {
    AMPLITUDE_API_KEY: 'key',
    AMPLITUDE_SECRET_KEY: 'secret',
    STRIPE_SECRET_KEY: 'sk_test',
    SUPABASE_URL: 'https://example.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'service',
  },
}));

const emptySupabasePage = () => {
  const builder: Record<string, unknown> = {};
  for (const method of ['select', 'gte', 'lte', 'order']) builder[method] = () => builder;
  builder.range = () => Promise.resolve({ data: [], error: null });
  return builder;
};

const defaultAmplitude = async (params: IAmplitudeEventTotalsParams) => ({
  eventType: params.eventType,
  metric: params.metric,
  start: '20260817',
  end: '20260915',
  xValues: [],
  dailyTotals: [9_999],
  total: params.metric === 'uniques' ? 47 : 50,
});

describe('paid funnel scorecard', () => {
  it('should convert a YYYYMMDD window to inclusive UTC unix bounds', () => {
    const { gte, lte } = toUnixRange({ startDate: '20260817', endDate: '20260915' });

    expect(new Date(gte * 1000).toISOString()).toBe('2026-08-17T00:00:00.000Z');
    expect(new Date(lte * 1000).toISOString()).toBe('2026-09-15T23:59:59.000Z');
  });

  it('should report a rate only when the denominator is non-zero', () => {
    expect(formatRate(47, 233)).toBe('20.2%');
    expect(formatRate(0, 0)).toBe('n/a');
  });

  it('should default to the last 30 fully elapsed days', () => {
    const window = getDefaultWindow(new Date('2026-09-16T12:00:00Z'));

    expect(window).toEqual({ startDate: '20260817', endDate: '20260915' });
  });

  it('should only trace stages that exist in the canonical KPI definitions or are client-only surfaces', () => {
    const canonical = new Set<string>(CORE_KPI_EVENT_NAMES);
    const clientOnlySurfaces = new Set([
      'purchase_modal_opened',
      'checkout_modal_mounted',
      'checkout_abandoned',
    ]);

    for (const { event } of PAID_FUNNEL_STAGES) {
      expect(canonical.has(event) || clientOnlySurfaces.has(event), `${event} is untraceable`).toBe(
        true
      );
    }
  });

  it('should exclude non-checkout destinations from the checkout-bound set', () => {
    // model_gallery and billing clicks count in the CTR numerator but cannot
    // reach a checkout in the same step, so they must not inflate the base.
    expect(CHECKOUT_BOUND_DESTINATIONS).not.toContain('model_gallery');
    expect(CHECKOUT_BOUND_DESTINATIONS).not.toContain('billing');
    expect(CHECKOUT_BOUND_DESTINATIONS).toContain('checkout_direct');
  });

  it('should scale minor units by Stripe rules, not ISO/Intl, and format for display', () => {
    const cases: Array<[number, string, string]> = [
      [42817, 'usd', '$428.17'],
      [500, 'cad', 'CA$5.00'],
      [500, 'jpy', '¥500'],
      [500, 'isk', 'ISK\u00a05.00'],
      [500, 'ugx', 'UGX\u00a05.00'],
      [500, 'mga', 'MGA\u00a0500'],
    ];

    for (const [amount, currency, expected] of cases) {
      expect(formatMinorUnits(amount, currency)).toBe(expected);
    }
  });

  it('should validate the CLI window before any external API request', () => {
    expect(
      parseScorecardArgs(['--start', '20260817', '--end', '20260915', '--recovery-days', '30'])
    ).toEqual({ window: { startDate: '20260817', endDate: '20260915' }, recoveryDays: 30 });
  });

  it('should reject rollover, reversed, and malformed CLI dates', () => {
    expect(() => parseScorecardArgs(['--start', '20260230'])).toThrow(/not a real calendar date/);
    expect(() => parseScorecardArgs(['--start', '20260915', '--end', '20260817'])).toThrow(
      /is after/
    );
    expect(() => parseScorecardArgs(['--start', '2026-08-17'])).toThrow(/must be YYYYMMDD/);
  });

  it('should reject unknown flags, missing values, and invalid recovery days', () => {
    expect(() => parseScorecardArgs(['--wat'])).toThrow(/Unknown argument/);
    expect(() => parseScorecardArgs(['--start'])).toThrow(/requires a value/);
    expect(() => parseScorecardArgs(['--recovery-days', '0'])).toThrow(/positive integer/);
    expect(() => parseScorecardArgs(['--recovery-days', '1.5'])).toThrow(/positive integer/);
    expect(() => parseScorecardArgs(['--recovery-days', '-3'])).toThrow(/positive integer/);
    expect(() => parseScorecardArgs(['--recovery-days', String(Number.MAX_SAFE_INTEGER)])).toThrow(
      /too large/
    );
  });

  it('should throw instead of returning a truncated audit at the row ceiling', async () => {
    const fullPage = Array.from({ length: 1000 }, (_, index) => ({ id: index }));
    const fetchPage = vi.fn(async () => fullPage);

    await expect(collectPages(fetchPage, 'email_lifecycle_queue')).rejects.toThrow(
      /refusing a silently truncated audit/
    );
    expect(fetchPage).toHaveBeenCalledTimes(50);
  });

  it('should stop paging at the first short page', async () => {
    const fetchPage = vi.fn(async (from: number) =>
      from === 0 ? Array.from({ length: 1000 }, (_, index) => ({ id: index })) : [{ id: 9999 }]
    );

    await expect(collectPages(fetchPage, 'email_lifecycle_queue')).resolves.toHaveLength(1001);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });
});

describe('paid funnel scorecard entry point (mocked)', () => {
  let logs: string[];

  beforeEach(() => {
    vi.clearAllMocks();
    logs = [];
    vi.spyOn(console, 'log').mockImplementation((...args: unknown[]) => {
      logs.push(args.map(String).join(' '));
    });
    mocks.stripeCtor.mockImplementation(function () {
      return {
        charges: { list: mocks.chargesList },
        balanceTransactions: { list: mocks.balanceList },
      };
    });
    mocks.chargesList.mockImplementation(async function* () {});
    mocks.balanceList.mockImplementation(async function* () {});
    mocks.from.mockImplementation(() => emptySupabasePage());
    mocks.getAmplitudeEventTotals.mockImplementation(defaultAmplitude);
  });

  afterEach(() => vi.restoreAllMocks());

  it('should use whole-interval totals, one OR-filtered checkout query, UNKNOWN, and per-currency charges', async () => {
    mocks.getAmplitudeEventTotals.mockImplementation(
      async (params: IAmplitudeEventTotalsParams) => {
        if (params.eventType === 'checkout_error') throw new AmplitudeDashboardApiError(400, true);
        return defaultAmplitude(params);
      }
    );
    mocks.chargesList.mockImplementation(async function* () {
      yield { status: 'succeeded', currency: 'usd', amount: 500, amount_refunded: 0 };
      yield { status: 'succeeded', currency: 'cad', amount: 700, amount_refunded: 0 };
    });

    await runScorecard(['--start', '20260817', '--end', '20260915']);

    const output = logs.join('\n');
    expect(output).toMatch(/^\s*50\s+47\s+purchase_confirmed/m);
    expect(output).not.toContain('9999');
    expect(output).not.toMatch(/NEVER/);
    expect(output).toContain('UNKNOWN');
    expect(output).toMatch(/UNKNOWN\s+UNKNOWN\s+checkout_error\s+checkout_friction/);
    expect(output).toContain('USD: 1 succeeded');
    expect(output).toContain('CAD: 1 succeeded');

    const filteredQueries = mocks.getAmplitudeEventTotals.mock.calls.filter(
      ([params]) => params.filters?.length
    );
    expect(filteredQueries).toHaveLength(1);
    expect(filteredQueries[0][0].eventType).toBe('monetization_surface_clicked');
    expect(filteredQueries[0][0].filters[0].subprop_value).toEqual([
      ...CHECKOUT_BOUND_DESTINATIONS,
    ]);
  });

  it('should reject sanitized on Amplitude auth and transport failures', async () => {
    mocks.getAmplitudeEventTotals.mockRejectedValue(new AmplitudeDashboardApiError(401, false));
    await expect(runScorecard(['--start', '20260817', '--end', '20260915'])).rejects.toThrow(
      /Amplitude totals query failed.*HTTP 401/
    );

    mocks.getAmplitudeEventTotals.mockRejectedValue(new TypeError('fetch failed at secret-host'));
    let caught: unknown;
    try {
      await runScorecard(['--start', '20260817', '--end', '20260915']);
    } catch (error) {
      caught = error;
    }
    expect(String((caught as Error).message)).toMatch(/Amplitude totals query failed/);
    expect(String((caught as Error).message)).not.toContain('secret-host');
  });

  it('should reject an overflowing recovery window before any external request', async () => {
    await expect(
      runScorecard(['--recovery-days', String(Number.MAX_SAFE_INTEGER)])
    ).rejects.toThrow(/too large/);
    expect(mocks.getAmplitudeEventTotals).not.toHaveBeenCalled();
    expect(mocks.stripeCtor).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
