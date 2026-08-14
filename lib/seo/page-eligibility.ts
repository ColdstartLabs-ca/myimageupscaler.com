/**
 * Sitemap submission policy for pSEO pages.
 *
 * The committed snapshot is deliberately read at build/request time rather than
 * calling GSC from a route. That keeps sitemap output deterministic and keeps
 * the policy within the Workers CPU budget.
 */

import performanceSnapshot from '@/content/pseo-performance.json';
import type { Locale } from '@/i18n/config';
import { LEGACY_REDIRECTS } from './legacy-redirects';
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

/**
 * Every destination of a legacy 301 is a consolidation owner: the impressions
 * it is being handed still sit on the retired source URL, so the performance
 * snapshot reports zero for the owner. Pruning it would de-list exactly the
 * pages the redirect table funnels signals into. Owners are pinned by
 * construction, and the set is derived rather than hand-maintained so it can
 * never drift from the redirect table.
 */
export const REDIRECT_OWNER_KEYS: ReadonlySet<string> = new Set(
  LEGACY_REDIRECTS.flatMap(redirect => {
    const destination = redirect.destination.replace(/^\/:locale/, '');
    if (!destination.startsWith('/') || destination.includes(':')) return [];

    const identity = getPathIdentity(destination);
    return identity ? [`${identity.category}/${identity.slug}`] : [];
  })
);

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

/**
 * The snapshot can carry more than one row per identity (1,111 rows for 1,030
 * identities), because a page can be reached through more than one sitemap
 * path. Last-write-wins silently hid real traffic behind a zero-impression
 * duplicate for all 81 affected identities and pruned pages that were in fact
 * earning impressions. Merge instead, taking the strongest observation: a page
 * counts as earning if any row for it reports traffic. Max rather than sum, so
 * a duplicate that is the same measurement twice cannot inflate a report.
 */
function mergePerformance(a: IPagePerformance, b: IPagePerformance): IPagePerformance {
  const newerLastUpdated =
    !a.lastUpdated || (b.lastUpdated && b.lastUpdated > a.lastUpdated) ? b.lastUpdated : a.lastUpdated;

  return {
    ...a,
    impressions: Math.max(a.impressions, b.impressions),
    clicks: Math.max(a.clicks, b.clicks),
    lastUpdated: newerLastUpdated,
  };
}

const performanceByKey = new Map<string, IPagePerformance>();
for (const page of snapshot.pages) {
  const pageKey = key(page.category, page.slug, page.locale || 'en');
  const existing = performanceByKey.get(pageKey);
  performanceByKey.set(pageKey, existing ? mergePerformance(existing, page) : page);
}

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

  if (category === 'blog' || PINNED_SLUGS.has(pageKey) || REDIRECT_OWNER_KEYS.has(pageKey)) {
    return true;
  }

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
  if (PINNED_SLUGS.has(pageKey) || REDIRECT_OWNER_KEYS.has(pageKey)) return 'pinned';

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
export function shouldSubmitPath(
  pathname: string,
  lastUpdated?: string,
  locale?: Locale | string
): boolean {
  const identity = getPathIdentity(pathname);
  if (!identity) return true;

  // Locale-specific sitemaps carry unprefixed paths, so the path alone always
  // looks English. Callers that know which locale's sitemap they are building
  // must say so, or every locale gets filtered against the English record.
  return shouldSubmit(identity.category, identity.slug, locale || identity.locale, lastUpdated);
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
    shouldSubmitPath(getPath(entry), getLastUpdated(entry), locale)
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
