import { describe, test, expect, vi } from 'vitest';

const amplitudeTrack = vi.hoisted(() => vi.fn());

vi.mock('@amplitude/analytics-browser', () => ({
  init: vi.fn(),
  track: amplitudeTrack,
  reset: vi.fn(),
  setUserId: vi.fn(),
  identify: vi.fn(),
  getDeviceId: vi.fn(),
  getSessionId: vi.fn(),
  Identify: class {},
}));

import { sanitizeGa4Params } from '@shared/analytics/types';

/**
 * GA4 evidence (Sep 1–Oct 2): sessions with sessionSource=file_picker /
 * drag_drop / upload / purchase_modal had sessionMedium "(not set)" and landed
 * on /dashboard with no query string. A gtag event param literally named
 * `source` is a traffic-source override, not an event dimension: GA4 read
 * `select_content { source: 'file_picker' }` as "this traffic came from
 * file_picker" and opened a new session.
 */
describe('sanitizeGa4Params', () => {
  test('renames reserved traffic-source params so UI origin cannot respawn a session', () => {
    expect(sanitizeGa4Params('image_uploaded', { source: 'file_picker', foo: 1 })).toEqual({
      ui_source: 'file_picker',
      foo: 1,
    });

    expect(
      sanitizeGa4Params('purchase_modal_opened', {
        source: 'purchase_modal',
        medium: 'modal',
        campaign: 'credits',
        term: 'out_of_credits',
        content: 'pro_pack',
      })
    ).toEqual({
      ui_source: 'purchase_modal',
      ui_medium: 'modal',
      ui_campaign: 'credits',
      ui_term: 'out_of_credits',
      ui_content: 'pro_pack',
    });
  });

  test('renames web_vitals value to metric_value because GA4 reads value as money', () => {
    expect(sanitizeGa4Params('web_vitals', { metric: 'LCP', value: 4210, rating: 'poor' })).toEqual({
      metric: 'LCP',
      metric_value: 4210,
      rating: 'poor',
    });
  });

  test('keeps value monetary on purchase events', () => {
    expect(sanitizeGa4Params('purchase_confirmed', { value: 29.99, currency: 'USD' })).toEqual({
      value: 29.99,
      currency: 'USD',
    });
  });

  test('leaves every other param name untouched', () => {
    const properties = {
      path: '/dashboard',
      entry_page: '/',
      first_touch_utm_source: 'google',
      referral_source: 'google',
      ui_source: 'file_picker',
    };

    expect(sanitizeGa4Params('page_view', properties)).toEqual(properties);
  });

  test('leaves the Amplitude payload untouched', async () => {
    const { AmplitudeProvider } = await import('@shared/analytics/providers/amplitude-provider');
    const amplitude = new AmplitudeProvider();
    await amplitude.init({ apiKey: 'test-key' });

    amplitude.track('image_uploaded', { source: 'file_picker', foo: 1 });

    expect(amplitudeTrack).toHaveBeenCalledWith('image_uploaded', {
      source: 'file_picker',
      foo: 1,
    });
  });
});

describe('GA4Provider — gtag boundary', () => {
  test('sends renamed params to gtag and never a bare source', async () => {
    const gtag = vi.fn();
    (window as unknown as Record<string, unknown>).gtag = gtag;

    const { GA4Provider } = await import('@shared/analytics/providers/ga4-provider');
    const provider = new GA4Provider();
    await provider.init({ measurementId: 'G-TEST' });

    provider.track('image_uploaded', { source: 'file_picker', fileSizeBucket: '1mb' });

    expect(gtag).toHaveBeenCalledWith('event', 'select_content', {
      ui_source: 'file_picker',
      fileSizeBucket: '1mb',
    });

    provider.trackPageView('/dashboard', { path: '/dashboard', source: 'drag_drop' });

    expect(gtag).toHaveBeenCalledWith(
      'event',
      'page_view',
      expect.objectContaining({ ui_source: 'drag_drop' })
    );
    const sentParams = gtag.mock.calls.flatMap(([, , params]) => Object.keys(params ?? {}));
    expect(sentParams).not.toContain('source');

    delete (window as unknown as Record<string, unknown>).gtag;
  });
});
