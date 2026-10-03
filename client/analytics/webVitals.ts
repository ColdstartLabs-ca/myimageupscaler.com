import { SUPPORTED_LOCALES } from '@/i18n/config';
import { isDevelopment, isTest } from '@shared/config/env';
import { loadAnalytics } from '@client/utils/loadAnalytics';

/** Traffic is low enough to sample every page view. Lower it only if volume grows. */
const WEB_VITALS_SAMPLE_RATE = 1;

/** FID is deprecated and not a Core Web Vital; Next still reports it. */
const REPORTED_METRICS: readonly string[] = ['LCP', 'INP', 'CLS', 'FCP', 'TTFB'];

interface IWebVitalMetric {
  name: string;
  value: number;
  rating: string;
  navigationType?: string;
  entries?: { element?: { tagName?: string } }[];
}

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

  const properties = {
    metric: metric.name,
    value: metric.value,
    rating: metric.rating,
    path_template: toPathTemplate(window.location.pathname),
    navigation_type: metric.navigationType,
    ...(lcpElement ? { lcp_element: lcpElement } : {}),
  };

  void loadAnalytics()
    .then(analytics => analytics.track('web_vitals', properties))
    .catch(() => {});
}