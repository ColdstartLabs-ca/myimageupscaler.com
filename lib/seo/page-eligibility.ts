/**
 * Sitemap submission policy for pSEO pages.
 *
 * The committed snapshot is deliberately read at build/request time rather than
 * calling GSC from a route. That keeps sitemap output deterministic and keeps
 * the policy within the Workers CPU budget.
 */

import performanceSnapshot from '@/content/pseo-performance.json';
import type { Locale } from '@/i18n/config';
import { PSEO_CATEGORIES, type PSEOCategory } from './url-utils';

export const GRACE_PERIOD_DAYS = 90;

/**
 * Strategic pages may remain submitted even before GSC reports impressions.
 * Keep this list short and review additions with the monthly snapshot refresh.
 */
export const PINNED_SLUGS = new Set([
  'tools/ai-image-upscaler',
  'tools/ai-photo-enhancer',
  'tools/image-resizer',
  'formats/upscale-jpg-images',
  'scale/upscale-4x',
]);

export interface IPagePerformance {
  category: string;
  slug: string;
  locale?: string;
  url?: string;
  impressions: number;
  clicks: number;
  lastUpdated?: string;
}

export interface IPagePerformanceSnapshot {
  generatedAt: string;
  period: {
    startDate: string;
    endDate: string;
    days: number;
  };
  siteUrl: string;
  submittedUrls: number;
  indexedUrls: number;
  indexationRate: number;
  pages: IPagePerformance[];
}

const snapshot = performanceSnapshot as IPagePerformanceSnapshot;

function key(category: string, slug: string, locale: string): string {
  return `${category}/${slug}/${locale}`;
}

const performanceByKey = new Map(
  snapshot.pages.map(page => [key(page.category, page.slug, page.locale || 'en'), page])
);

function getPerformanceRecord(
  category: string,
  slug: string,
  locale: string
): IPagePerformance | undefined {
  return (
    performanceByKey.get(key(category, slug, locale)) ??
    (locale === 'en' ? undefined : performanceByKey.get(key(category, slug, 'en')))
  );
}

function isWithinGracePeriod(lastUpdated: string | undefined, now: Date): boolean {
  if (!lastUpdated) return false;

  const updatedAt = new Date(lastUpdated);
  if (Number.isNaN(updatedAt.getTime())) return false;

  const ageInDays = (now.getTime() - updatedAt.getTime()) / (24 * 60 * 60 * 1000);
  return ageInDays >= 0 && ageInDays < GRACE_PERIOD_DAYS;
}

/**
 * Decide whether a pSEO page should be present in a sitemap.
 *
 * `lastUpdated` is optional for callers that only have the identity. Sitemap
 * callers should provide it so a new page with no GSC row receives its grace
 * period. The fourth argument also accepts a Date for convenient deterministic
 * tests; the fifth argument is the explicit clock in that form.
 */
export function shouldSubmit(
  category: string,
  slug: string,
  locale: Locale | string = 'en',
  lastUpdatedOrNow?: string | Date,
  now: Date = new Date()
): boolean {
  const normalizedLocale = locale || 'en';
  const pageKey = `${category}/${slug}`;

  if (category === 'blog' || PINNED_SLUGS.has(pageKey)) return true;

  const effectiveLastUpdated =
    typeof lastUpdatedOrNow === 'string'
      ? lastUpdatedOrNow
      : getPerformanceRecord(category, slug, normalizedLocale)?.lastUpdated;
  const effectiveNow = lastUpdatedOrNow instanceof Date ? lastUpdatedOrNow : now;
  const performance = getPerformanceRecord(category, slug, normalizedLocale);

  // A page absent from the snapshot has not been measured yet. Keep it
  // discoverable until the next sync records an explicit zero-impression row;
  // the publication gate handles new rows before they can accumulate.
  if (!performance) return true;

  if (performance && (performance.impressions > 0 || performance.clicks > 0)) return true;

  return isWithinGracePeriod(effectiveLastUpdated, effectiveNow);
}

export function getPagePerformance(
  category: string,
  slug: string,
  locale: Locale | string = 'en'
): IPagePerformance | undefined {
  return getPerformanceRecord(category, slug, locale || 'en');
}

export function getEligibilityReason(
  category: string,
  slug: string,
  locale: Locale | string = 'en',
  lastUpdated?: string,
  now: Date = new Date()
): 'blog' | 'pinned' | 'impressions' | 'grace-period' | 'untracked' | 'pruned' {
  const pageKey = `${category}/${slug}`;
  if (category === 'blog') return 'blog';
  if (PINNED_SLUGS.has(pageKey)) return 'pinned';

  const performance = getPagePerformance(category, slug, locale);
  if (!performance) {
    return isWithinGracePeriod(lastUpdated, now) ? 'grace-period' : 'untracked';
  }

  if (performance && (performance.impressions > 0 || performance.clicks > 0)) {
    return 'impressions';
  }

  if (isWithinGracePeriod(lastUpdated || performance?.lastUpdated, now)) {
    return 'grace-period';
  }

  return 'pruned';
}

export function isPSEOCategory(value: string): value is PSEOCategory {
  return (PSEO_CATEGORIES as readonly string[]).includes(value);
}

function getPathIdentity(
  pathname: string
): { category: PSEOCategory; slug: string; locale: string } | null {
  const segments = pathname.split('/').filter(Boolean);
  const possibleLocale = segments[0];
  const locale = ['en', 'es', 'pt', 'de', 'fr', 'it', 'ja'].includes(possibleLocale)
    ? segments.shift() || 'en'
    : 'en';
  const category = segments[0];

  if (!category || !isPSEOCategory(category) || segments.length < 2) return null;

  return { category, slug: segments[segments.length - 1], locale };
}

/**
 * Path-level adapter used by shared sitemap entry generators.
 * Category hubs and non-pSEO URLs are not page candidates and remain emitted.
 */
export function shouldSubmitPath(pathname: string, lastUpdated?: string): boolean {
  const identity = getPathIdentity(pathname);
  if (!identity) return true;
  return shouldSubmit(identity.category, identity.slug, identity.locale, lastUpdated);
}

export function filterEligiblePages<T extends { slug: string; lastUpdated?: string }>(
  pages: readonly T[],
  category: string,
  locale: Locale | string = 'en'
): { pages: T[]; skipped: number } {
  const eligiblePages = pages.filter(page =>
    shouldSubmit(category, page.slug, locale, page.lastUpdated)
  );

  return { pages: eligiblePages, skipped: pages.length - eligiblePages.length };
}

/**
 * Filter a direct sitemap route's entries through the same path policy used
 * by the shared sitemap generators. The path callback covers custom tool
 * routes such as /tools/resize/{slug} while preserving the page identity.
 */
export function filterEligibleSitemapEntries<T>(
  entries: readonly T[],
  category: string,
  locale: Locale | string,
  getPath: (entry: T) => string,
  getLastUpdated: (entry: T) => string | undefined
): T[] {
  const eligibleEntries = entries.filter(entry =>
    shouldSubmitPath(getPath(entry), getLastUpdated(entry))
  );
  logSitemapEligibility(category, locale, entries.length, entries.length - eligibleEntries.length);
  return eligibleEntries;
}

export function logSitemapEligibility(
  category: string,
  locale: Locale | string,
  considered: number,
  skipped: number
): void {
  console.info(
    `[sitemap:${category}:${locale}] considered=${considered} submitted=${considered - skipped} skipped=${skipped}`
  );
}
