/**
 * GSC Fix Verification — pure logic
 *
 * Backs `scripts/seo/verify-gsc-fixes.ts`. Re-checks the URL lists exported from Search Console
 * (`docs/PRDs/gsc-recovery-2026-08/data/*.csv`) against a live origin and decides, per set,
 * whether each URL still violates the issue it was reported for.
 *
 * GSC issue reports are historical: a URL listed as "Not found" in February may already return 200.
 * These expectations describe the state the site must be in NOW, not what GSC once saw.
 */

export const GSC_SETS = ['404', 'noindex', '5xx', 'dup', 'cni'] as const;
export type GscSet = (typeof GSC_SETS)[number];

/** Sets whose expectation needs the HTML body (canonical / robots meta). */
export const SETS_REQUIRING_BODY: readonly GscSet[] = ['noindex', 'dup', 'cni'];

/** Sets whose expectation needs sitemap membership. */
export const SETS_REQUIRING_SITEMAP: readonly GscSet[] = ['noindex', 'cni'];

export const SET_CSV_FILES: Record<GscSet, string> = {
  '404': 'gsc-404.csv',
  noindex: 'gsc-noindex.csv',
  '5xx': 'gsc-5xx.csv',
  dup: 'gsc-duplicate-canonical.csv',
  cni: 'gsc-crawled-not-indexed.csv',
};

export const SUPPORTED_LOCALE_PREFIXES = ['en', 'fr', 'de', 'es', 'it', 'ja', 'pt'] as const;

export interface IUrlObservation {
  url: string;
  /** 0 when the request itself failed (DNS, timeout, reset). */
  status: number;
  location?: string;
  canonical?: string;
  /** `<meta name="robots">` content. */
  robots?: string;
  /** `X-Robots-Tag` response header. */
  xRobotsTag?: string;
  /** Undefined when sitemap membership was not collected for this run. */
  inSitemap?: boolean;
  /** Status after following redirects — a 301 to a 404 is not a fix. */
  finalStatus?: number;
  finalUrl?: string;
  /** Number of redirect hops taken; >1 is a chain and should be collapsed. */
  redirectHops?: number;
  responseTimeMs?: number;
  error?: string;
}

export interface IExpectationResult {
  ok: boolean;
  reason: string;
}

/** Parse the `URL,Last crawled` CSV shape GSC exports. */
export function parseGscCsv(content: string): string[] {
  return content
    .split(/\r?\n/)
    .slice(1) // header
    .map(line => line.split(',')[0]?.trim())
    .filter((url): url is string => Boolean(url) && url.startsWith('http'));
}

/** Extract `<link rel="canonical" href="...">` regardless of attribute order. */
export function extractCanonical(html: string): string | undefined {
  const linkTags = html.match(/<link\b[^>]*>/gi) ?? [];
  for (const tag of linkTags) {
    if (!/rel\s*=\s*["']?canonical["']?/i.test(tag)) continue;
    const href = tag.match(/href\s*=\s*["']([^"']+)["']/i);
    if (href) return href[1];
  }
  return undefined;
}

/** Extract `<meta name="robots" content="...">`. */
export function extractRobotsMeta(html: string): string | undefined {
  const metaTags = html.match(/<meta\b[^>]*>/gi) ?? [];
  for (const tag of metaTags) {
    if (!/name\s*=\s*["']?robots["']?/i.test(tag)) continue;
    const content = tag.match(/content\s*=\s*["']([^"']*)["']/i);
    if (content) return content[1];
  }
  return undefined;
}

export function isNoindex(observation: IUrlObservation): boolean {
  const signals = `${observation.robots ?? ''} ${observation.xRobotsTag ?? ''}`.toLowerCase();
  return signals.includes('noindex');
}

/** Strip the locale prefix: `/de/scale/2k-upscaler` → `/scale/2k-upscaler`. */
export function stripLocalePrefix(pathname: string): string {
  const pattern = new RegExp(`^/(${SUPPORTED_LOCALE_PREFIXES.join('|')})(?=/|$)`);
  return pathname.replace(pattern, '') || '/';
}

export function hasLocalePrefix(url: string): boolean {
  try {
    return stripLocalePrefix(new URL(url).pathname) !== new URL(url).pathname;
  } catch {
    return false;
  }
}

/** Compare URLs ignoring trailing slash and default ports. */
export function isSameUrl(a: string, b: string): boolean {
  const normalize = (value: string): string => {
    try {
      const url = new URL(value);
      return `${url.origin}${url.pathname.replace(/\/$/, '')}`;
    } catch {
      return value.replace(/\/$/, '');
    }
  };
  return normalize(a) === normalize(b);
}

/**
 * Group by URL family so 300 rows read as a handful of causes.
 * `/de/tools/resize/x` → `/tools/resize`, `/article/y` → `/article`.
 */
export function urlFamily(url: string): string {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    pathname = url;
  }
  const segments = stripLocalePrefix(pathname).split('/').filter(Boolean);
  if (segments.length === 0) return '/';
  if (segments[0] === 'tools' && ['resize', 'convert', 'compress'].includes(segments[1] ?? '')) {
    return `/tools/${segments[1]}`;
  }
  if (segments[0] === 'tools') return '/tools/[slug]';
  return `/${segments[0]}`;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

/**
 * Decide whether an observation still violates its set's issue.
 *
 * `expectStatus` is the negative control: force an exact status expectation so the harness can be
 * proven to read live responses rather than always passing.
 */
export function evaluateExpectation(
  set: GscSet,
  observation: IUrlObservation,
  expectStatus?: number
): IExpectationResult {
  if (observation.error) {
    return { ok: false, reason: `request failed: ${observation.error}` };
  }

  if (expectStatus !== undefined) {
    return observation.status === expectStatus
      ? { ok: true, reason: `status ${observation.status} matches --expect` }
      : { ok: false, reason: `expected ${expectStatus}, got ${observation.status}` };
  }

  switch (set) {
    case '404': {
      if (observation.status === 200) return { ok: true, reason: '200' };
      if (observation.status === 301) {
        const destination = observation.finalUrl ?? observation.location ?? 'unknown';
        if (observation.finalStatus === undefined) {
          return {
            ok: false,
            reason: `${observation.status} → ${destination} (destination not checked)`,
          };
        }
        if (observation.finalStatus !== 200) {
          return {
            ok: false,
            reason: `${observation.status} → ${destination} which returns ${observation.finalStatus}`,
          };
        }
        if ((observation.redirectHops ?? 1) > 1) {
          return {
            ok: false,
            reason: `redirect chain of ${observation.redirectHops} hops → ${destination}`,
          };
        }
        return { ok: true, reason: `${observation.status} → ${destination}` };
      }
      return { ok: false, reason: `still ${observation.status}` };
    }

    case '5xx': {
      if (observation.status >= 500)
        return { ok: false, reason: `server error ${observation.status}` };
      return { ok: true, reason: `${observation.status}` };
    }

    case 'noindex':
    case 'cni': {
      // The violation is submitting a URL in a sitemap while telling Google not to index it.
      if (observation.inSitemap === undefined) {
        return { ok: false, reason: 'sitemap membership not collected — cannot evaluate' };
      }
      if (observation.inSitemap && isNoindex(observation)) {
        return { ok: false, reason: 'noindex but submitted in a sitemap' };
      }
      return {
        ok: true,
        reason: observation.inSitemap ? 'in sitemap, indexable' : 'not submitted in a sitemap',
      };
    }

    case 'dup': {
      if (observation.status >= 400) return { ok: false, reason: `status ${observation.status}` };
      if (REDIRECT_STATUSES.has(observation.status)) {
        return { ok: true, reason: `${observation.status} → ${observation.location ?? 'unknown'}` };
      }
      if (!observation.canonical) return { ok: false, reason: 'no canonical tag' };
      // A locale URL Google already folded into English must stop claiming itself as canonical.
      if (hasLocalePrefix(observation.url) && isSameUrl(observation.canonical, observation.url)) {
        return { ok: false, reason: 'self-canonical locale page Google folded into English' };
      }
      return { ok: true, reason: `canonical → ${observation.canonical}` };
    }
  }
}

export interface ISetSummary {
  family: string;
  total: number;
  violations: number;
  examples: Array<{ url: string; reason: string }>;
}

export function summarizeByFamily(
  results: Array<{ observation: IUrlObservation; expectation: IExpectationResult }>,
  maxExamples = 3
): ISetSummary[] {
  const byFamily = new Map<string, ISetSummary>();

  for (const { observation, expectation } of results) {
    const family = urlFamily(observation.url);
    const summary = byFamily.get(family) ?? { family, total: 0, violations: 0, examples: [] };
    summary.total += 1;
    if (!expectation.ok) {
      summary.violations += 1;
      if (summary.examples.length < maxExamples) {
        summary.examples.push({ url: observation.url, reason: expectation.reason });
      }
    }
    byFamily.set(family, summary);
  }

  return [...byFamily.values()].sort((a, b) => b.violations - a.violations || b.total - a.total);
}

/** Collect `<loc>` values from a sitemap or sitemap index document. */
export function extractSitemapLocs(xml: string): string[] {
  return [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map(match => match[1]);
}

/** Point a GSC-exported URL at a different origin (localhost, preview deploys). */
export function rebaseUrl(url: string, baseUrl: string): string {
  try {
    const source = new URL(url);
    const target = new URL(baseUrl);
    source.protocol = target.protocol;
    source.host = target.host;
    return source.toString();
  } catch {
    return url;
  }
}
