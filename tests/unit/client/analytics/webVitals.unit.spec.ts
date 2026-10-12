import { describe, test, expect, vi, beforeEach } from 'vitest';

const track = vi.fn();
const clientState = { enabled: true, consent: 'granted' as 'granted' | 'denied' | 'pending' };
const analytics = {
  track,
  isEnabled: () => clientState.enabled,
  getConsent: () => clientState.consent,
};
const loadAnalytics = vi.fn(async () => analytics);

// Repo rule: analytics must never fire in development or test.
const env = vi.hoisted(() => ({ development: false, test: false }));

vi.mock('@client/utils/loadAnalytics', () => ({
  loadAnalytics: () => loadAnalytics(),
}));

vi.mock('@shared/config/env', async importOriginal => {
  const actual = await importOriginal<typeof import('@shared/config/env')>();
  return {
    ...actual,
    isDevelopment: () => env.development,
    isTest: () => env.test,
  };
});

interface IMetricEntry {
  element?: { tagName?: string };
}

function makeMetric(overrides: Record<string, unknown> = {}) {
  return {
    name: 'LCP',
    value: 4210,
    rating: 'poor',
    id: 'v4-1-1',
    delta: 4210,
    navigationType: 'navigate',
    entries: [] as IMetricEntry[],
    ...overrides,
  };
}

async function loadReporter() {
  return import('../../../../client/analytics/webVitals');
}

describe('web vitals - path template', () => {
  test('collapses locale-prefixed and pSEO slug paths to their template', async () => {
    const { toPathTemplate } = await loadReporter();

    expect(toPathTemplate('/')).toBe('/');
    expect(toPathTemplate('/es')).toBe('/');
    expect(toPathTemplate('/blog/foo')).toBe('/blog/[slug]');
    expect(toPathTemplate('/es/blog/foo')).toBe('/blog/[slug]');
    expect(toPathTemplate('/scale/upscale-16x')).toBe('/scale/[slug]');
    expect(toPathTemplate('/tools/image-compressor')).toBe('/tools/[slug]');
    expect(toPathTemplate('/use-cases/printing')).toBe('/use-cases/[slug]');
  });

  test('keeps static routes intact and strips query strings, hashes and slashes', async () => {
    const { toPathTemplate } = await loadReporter();

    expect(toPathTemplate('/pricing')).toBe('/pricing');
    expect(toPathTemplate('/blog')).toBe('/blog');
    expect(toPathTemplate('/es/pricing')).toBe('/pricing');
    expect(toPathTemplate('/blog/foo?utm_source=chatgpt&q=secret')).toBe('/blog/[slug]');
    expect(toPathTemplate('/blog/foo#section')).toBe('/blog/[slug]');
    expect(toPathTemplate('/blog/foo/')).toBe('/blog/[slug]');
    expect(toPathTemplate('')).toBe('/');
  });
});

describe('web vitals - reporting', () => {
  beforeEach(() => {
    vi.resetModules();
    track.mockClear();
    loadAnalytics.mockClear();
    clientState.enabled = true;
    clientState.consent = 'granted';
    env.development = false;
    env.test = false;
  });

  test('tracks one web_vitals event per metric with template, device-free shape', async () => {
    const { reportWebVital } = await loadReporter();

    reportWebVital(makeMetric());
    await vi.waitFor(() => expect(track).toHaveBeenCalledTimes(1));

    expect(track).toHaveBeenCalledWith('web_vitals', {
      metric: 'LCP',
      value: 4210,
      rating: 'poor',
      path_template: '/',
      navigation_type: 'navigate',
    });
  });

  test('reports CLS, FCP, INP and TTFB with rounded integer values', async () => {
    const { reportWebVital } = await loadReporter();

    for (const name of ['CLS', 'FCP', 'INP', 'TTFB']) {
      reportWebVital(makeMetric({ name, value: 0.0421 }));
    }
    await vi.waitFor(() => expect(track).toHaveBeenCalledTimes(4));

    expect(track.mock.calls.map(([event, props]) => [event, props])).toEqual([
      ['web_vitals', expect.objectContaining({ metric: 'CLS', value: 0.0421 })],
      ['web_vitals', expect.objectContaining({ metric: 'FCP', value: 0.0421 })],
      ['web_vitals', expect.objectContaining({ metric: 'INP', value: 0.0421 })],
      ['web_vitals', expect.objectContaining({ metric: 'TTFB', value: 0.0421 })],
    ]);
  });

  test('adds the LCP element tag when the browser exposes one', async () => {
    const { reportWebVital } = await loadReporter();

    reportWebVital(makeMetric({ entries: [{ element: { tagName: 'IMG' } }] }));
    await vi.waitFor(() => expect(track).toHaveBeenCalledTimes(1));

    expect(track).toHaveBeenCalledWith(
      'web_vitals',
      expect.objectContaining({ metric: 'LCP', lcp_element: 'img' })
    );
  });

  test('skips the deprecated FID metric', async () => {
    const { reportWebVital } = await loadReporter();

    reportWebVital(makeMetric({ name: 'FID', value: 12 }));
    reportWebVital(makeMetric({ name: 'TTFB', value: 300 }));
    await vi.waitFor(() => expect(track).toHaveBeenCalledTimes(1));

    expect(track.mock.calls[0]?.[1]).toEqual(expect.objectContaining({ metric: 'TTFB' }));
  });

  test('ignores malformed metrics instead of throwing', async () => {
    const { reportWebVital } = await loadReporter();

    expect(() => reportWebVital({ name: 'LCP' })).not.toThrow();
    expect(() => reportWebVital(makeMetric({ value: Number.NaN }))).not.toThrow();
    await Promise.resolve();

    expect(track).not.toHaveBeenCalled();
  });

  test('never loads analytics in development or test environments', async () => {
    const { reportWebVital } = await loadReporter();

    env.development = true;
    reportWebVital(makeMetric());
    env.development = false;
    env.test = true;
    reportWebVital(makeMetric());
    await Promise.resolve();

    expect(loadAnalytics).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
  });

  test('uses the page path at report time, so route changes keep their own template', async () => {
    window.history.replaceState({}, '', '/es/scale/4x?utm_source=google');
    const { reportWebVital } = await loadReporter();

    reportWebVital(makeMetric());
    await vi.waitFor(() => expect(track).toHaveBeenCalledTimes(1));

    expect(track).toHaveBeenCalledWith(
      'web_vitals',
      expect.objectContaining({ path_template: '/scale/[slug]' })
    );
  });
});

describe('web vitals - buffering before analytics init', () => {
  beforeEach(() => {
    vi.resetModules();
    track.mockClear();
    loadAnalytics.mockClear();
    clientState.enabled = false;
    clientState.consent = 'pending';
    env.development = false;
    env.test = false;
  });

  test('buffers vitals reported while not yet enabled and sends them once on flush', async () => {
    const { reportWebVital, flushWebVitals } = await loadReporter();

    reportWebVital(makeMetric({ name: 'TTFB', value: 120 }));
    reportWebVital(makeMetric({ name: 'FCP', value: 900 }));
    await vi.waitFor(() => expect(loadAnalytics).toHaveBeenCalledTimes(2));
    expect(track).not.toHaveBeenCalled();

    clientState.enabled = true;
    flushWebVitals(analytics);
    flushWebVitals(analytics);

    expect(track.mock.calls).toEqual([
      ['web_vitals', expect.objectContaining({ metric: 'TTFB', value: 120 })],
      ['web_vitals', expect.objectContaining({ metric: 'FCP', value: 900 })],
    ]);
  });

  test('drops buffered vitals without sending when consent is denied', async () => {
    const { reportWebVital, flushWebVitals } = await loadReporter();

    reportWebVital(makeMetric({ name: 'TTFB', value: 120 }));
    await vi.waitFor(() => expect(loadAnalytics).toHaveBeenCalled());

    clientState.consent = 'denied';
    flushWebVitals(analytics);

    expect(track).not.toHaveBeenCalled();
  });

  test('caps the buffer so a long-lived session cannot grow it without bound', async () => {
    const { reportWebVital, flushWebVitals } = await loadReporter();

    for (let i = 0; i < 14; i++) {
      reportWebVital(makeMetric({ name: 'TTFB', value: i }));
    }
    await vi.waitFor(() => expect(loadAnalytics).toHaveBeenCalledTimes(14));

    clientState.enabled = true;
    flushWebVitals(analytics);

    expect(track).toHaveBeenCalledTimes(10);
  });

  test('never buffers in development or test environments', async () => {
    const { reportWebVital, flushWebVitals } = await loadReporter();

    env.test = true;
    reportWebVital(makeMetric());
    env.test = false;

    flushWebVitals(analytics);
    expect(loadAnalytics).not.toHaveBeenCalled();
    expect(track).not.toHaveBeenCalled();
  });
});
