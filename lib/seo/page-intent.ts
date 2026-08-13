/**
 * Search intent classification for SEO reporting and blog conversion paths.
 *
 * Keep this list deliberately explicit. A blog URL is informational by default;
 * only the roundup that is known to have commercial comparison intent is
 * promoted into the commercial bucket.
 */

export type PageIntent = 'commercial' | 'informational';

export const INFORMATIONAL_CITATION_URLS = [
  '/blog/fixing-pixelated-photos',
  '/blog/poster-size-dimensions-pixels',
  '/blog/topaz-labs-free-trial',
  '/blog/how-to-upscale-youtube-thumbnails',
  '/blog/best-image-upscaler',
  '/blog/best-ai-upscaler',
  '/blog/topaz-video-upscaler',
] as const;

export const COMMERCIAL_ROUNDUP_URLS = [
  '/blog/best-free-ai-image-upscaler-2026-tested-compared',
  '/blog/best-bulk-image-upscalers-2026',
] as const;

const LOCALE_SEGMENTS = new Set(['de', 'en', 'es', 'fr', 'it', 'ja', 'pt']);
const COMMERCIAL_PREFIXES = ['/tools', '/free', '/scale', '/formats', '/pricing'];

function normalizePath(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return '/';

  let pathname = trimmed;
  try {
    pathname = new URL(trimmed, 'https://myimageupscaler.com').pathname;
  } catch {
    pathname = trimmed.split(/[?#]/, 1)[0] || '/';
  }

  const segments = pathname.split('/').filter(Boolean);
  if (segments.length > 0 && LOCALE_SEGMENTS.has(segments[0].toLowerCase())) {
    segments.shift();
  }

  return `/${segments.join('/')}`.replace(/\/$/, '') || '/';
}

/**
 * Classify a site URL for CTR reporting.
 *
 * Unknown paths stay informational so a new content URL cannot inflate the
 * commercial health metric until it receives an explicit classification.
 */
export function getPageIntent(url: string): PageIntent {
  const path = normalizePath(url);

  if (COMMERCIAL_ROUNDUP_URLS.includes(path as (typeof COMMERCIAL_ROUNDUP_URLS)[number])) {
    return 'commercial';
  }

  if (
    path === '/' ||
    COMMERCIAL_PREFIXES.some(prefix => path === prefix || path.startsWith(`${prefix}/`))
  ) {
    return 'commercial';
  }

  return 'informational';
}

export function isExcludedInformationalUrl(url: string): boolean {
  const path = normalizePath(url);
  return INFORMATIONAL_CITATION_URLS.includes(path as (typeof INFORMATIONAL_CITATION_URLS)[number]);
}

export function normalizePagePath(url: string): string {
  return normalizePath(url);
}
