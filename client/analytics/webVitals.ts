import { SUPPORTED_LOCALES } from '@/i18n/config';
import { isDevelopment, isTest } from '@shared/config/env';
import { loadAnalytics } from '@client/utils/loadAnalytics';

/** Traffic is low enough to sample every page view. Lower it only if volume grows. */
const WEB_VITALS_SAMPLE_RATE = 1;

/** FID is deprecated and not a Core Web Vital; Next still reports it. */
const REPORTED_METRICS: readonly string[] = ['LCP', 'INP', 'CLS', 'FCP', 'TTFB'];

/** TTFB/FCP report before analytics finishes initializing, so keep them until it does. */
const MAX_BUFFERED_VITALS = 10;

type AnalyticsClient = Awaited<ReturnType<typeof loadAnalytics>>;

interface IWebVitalMetric {
  name: string;
  value: number;
  rating: string;
  navigationType?: string;
  entries?: { element?: { tagName?: string } }[];
}

type IWebVitalsProperties = {
  metric: string;
  value: number;
  rating: string;
  path_template: string;
  navigation_type?: string;
  lcp_element?: string;
};

const bufferedVitals: IWebVitalsProperties[] = [];

/**
 * Collapse a pathname to its route template so p75 can be grouped by template:
 * `/es/scale/4x?utm_source=x` -> `/scale/[slug]`, `/es` -> `/`.
 */
export function toPathTemplate(pathname: string): string {
  const segments = (pathname.split(/[?#]/)[0] || '')
    .split('/')
    .filter(Boolean);

  if (segments.length > 0 && (SUPPORTED_LOCALES as readonly string[]).includes(segments[0])) {
    segments.shift();
  }

  if (segments.length > 1) {
    segments[segments.length - 1] = '[slug]';
  }

  return `/${segments.join('/')}`;
}

/**
 * Forward one Core Web Vital to the existing analytics pipeline as a single
 * `web_vitals` event. Called from Next's `useReportWebVitals`, which only runs
 * after paint, and resolves analytics lazily so nothing loads before first paint.
 * Device/country dimensions come from the attribution properties every tracked
 * event already carries.
 */
export function reportWebVital(metric: IWebVitalMetric): void {
  if (isDevelopment() || isTest()) return;
  if (!REPORTED_METRICS.includes(metric?.name)) return;
  if (typeof metric.value !== 'number' || !Number.isFinite(metric.value)) return;
  if (Math.random() >= WEB_VITALS_SAMPLE_RATE) return;

  const lcpElement =
    metric.name === 'LCP'
      ? metric.entries?.[metric.entries.length - 1]?.element?.tagName?.toLowerCase()
      : undefined;

  const properties: IWebVitalsProperties = {
    metric: metric.name,
    value: metric.value,
    rating: metric.rating,
    path_template: toPathTemplate(window.location.pathname),
    navigation_type: metric.navigationType,
    ...(lcpElement ? { lcp_element: lcpElement } : {}),
  };

  void loadAnalytics()
    .then(analytics => {
      if (analytics.isEnabled()) {
        analytics.track('web_vitals', properties);
        return;
      }
      // First-load vitals fire before the providers finish initializing. Buffer
      // them instead of dropping them; flushWebVitals sends them once ready.
      if (analytics.getConsent() !== 'denied' && bufferedVitals.length < MAX_BUFFERED_VITALS) {
        bufferedVitals.push(properties);
      }
    })
    .catch(() => {});
}

/**
 * Send vitals buffered while analytics was still initializing. Call once the
 * analytics client reports itself enabled; a refused consent just discards them.
 */
export function flushWebVitals(analytics: AnalyticsClient): void {
  if (!analytics.isEnabled()) {
    if (analytics.getConsent() === 'denied') bufferedVitals.length = 0;
    return;
  }

  for (const properties of bufferedVitals.splice(0)) {
    analytics.track('web_vitals', properties);
  }
}
