import type {
  ISeoEquityConfig,
  ISeoEquityEntity,
  ISeoEquityGscPage,
  ISeoEquitySnapshot,
  ISeoEquitySurface,
} from './seo-equity.schema';

const BLOG_PATH_PREFIX = '/blog/';

interface IBuildSnapshotInput {
  config: ISeoEquityConfig;
  pages: ISeoEquityGscPage[];
  generatedAt: string;
  gscExport?: string;
  window?: { startDate: string; endDate: string; days: number };
}

interface IMaterialChangeOptions {
  minScoreDelta: number;
}

interface IMaterialChangeResult {
  material: boolean;
  reasons: string[];
}

export function normalizeSeoPath(value: string, siteUrl = 'https://myimageupscaler.com'): string {
  const parsed = value.startsWith('http') ? new URL(value) : new URL(value, siteUrl);
  const pathname = parsed.pathname.replace(/\/$/, '') || '/';
  return pathname;
}

function expectedCtrForPosition(position: number): number {
  if (position <= 1) return 0.28;
  if (position <= 3) return 0.15;
  if (position <= 5) return 0.08;
  if (position <= 10) return 0.04;
  if (position <= 20) return 0.015;
  return 0.005;
}

function scorePosition(position: number): number {
  if (position < 4) return 6;
  if (position <= 10) return 22;
  if (position <= 20) return 16;
  if (position <= 50) return 6;
  return 0;
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

function getClusterIndex(config: ISeoEquityConfig): Map<string, { id: string; winner: boolean }> {
  const index = new Map<string, { id: string; winner: boolean }>();
  for (const cluster of config.canonicalClusters) {
    for (const member of cluster.members) {
      index.set(member.url, { id: cluster.id, winner: member.winner });
    }
  }
  return index;
}

function isPinnedForSurface(config: ISeoEquityConfig, surface: ISeoEquitySurface, url: string): boolean {
  return config.pinnedBySurface[surface]?.includes(url) ?? false;
}

function buildEntity(config: ISeoEquityConfig, page: ISeoEquityGscPage): ISeoEquityEntity | null {
  const url = normalizeSeoPath(page.url, config.siteUrl);
  if (!url.startsWith(BLOG_PATH_PREFIX) && !config.allowlist.includes(url)) return null;

  const clusterIndex = getClusterIndex(config);
  const cluster = clusterIndex.get(url);
  const canonicalWinner = cluster?.winner ?? true;
  const isBlocked = config.blocklist.includes(url);
  const isAllowed = config.allowlist.includes(url);
  const isGuardrailed = Boolean(config.recentlyEditedUntil[url]);
  const businessWeight = config.businessValueWeights[url] ?? 1;
  const expectedCtr = expectedCtrForPosition(page.position);
  const ctrGapRatio = page.impressions > 0 ? Math.max(0, expectedCtr - page.ctr) / expectedCtr : 0;

  const scoreBreakdown = {
    impressions: roundScore(Math.min(25, Math.log10(page.impressions + 1) * 7)),
    position: roundScore(scorePosition(page.position)),
    ctrGap: roundScore(ctrGapRatio * 24),
    businessValue: roundScore(Math.min(18, businessWeight * 10)),
    freshness: isGuardrailed ? -8 : 4,
    cannibalization: canonicalWinner ? 8 : -25,
    conversion: 0,
  };
  const score = roundScore(Object.values(scoreBreakdown).reduce((sum, value) => sum + value, 0));
  const guardrails = [
    ...(isBlocked ? ['blocklisted'] : []),
    ...(isGuardrailed ? ['recently-edited'] : []),
    ...(!canonicalWinner ? ['canonical-loser'] : []),
  ];

  const globallyEligible = !isBlocked && (canonicalWinner || isAllowed);
  const experimentEligible = globallyEligible && (!isGuardrailed || isAllowed);
  const eligibleSurfaces: ISeoEquitySurface[] = [];

  if (experimentEligible || isPinnedForSurface(config, 'homepageBlogPicks', url)) {
    eligibleSurfaces.push('homepageBlogPicks');
  }
  if (experimentEligible || isPinnedForSurface(config, 'blogIndexFeatured', url)) {
    eligibleSurfaces.push('blogIndexFeatured');
  }
  if (experimentEligible || isPinnedForSurface(config, 'blogStartHere', url)) {
    eligibleSurfaces.push('blogStartHere');
  }
  if (experimentEligible || isPinnedForSurface(config, 'blogFooterRelated', url)) {
    eligibleSurfaces.push('blogFooterRelated');
  }
  if (experimentEligible || isPinnedForSurface(config, 'pseoRelatedBlogPosts', url)) {
    eligibleSurfaces.push('pseoRelatedBlogPosts');
  }

  return {
    url,
    type: 'blog',
    canonicalCluster: cluster?.id,
    canonicalWinner,
    score,
    scoreBreakdown,
    eligibleSurfaces,
    guardrails,
  };
}

function rankEntities(entities: ISeoEquityEntity[]): ISeoEquityEntity[] {
  return [...entities].sort((a, b) => b.score - a.score || a.url.localeCompare(b.url));
}

function topUrlsBySurface(
  entities: ISeoEquityEntity[],
  surface: ISeoEquitySurface,
  max: number,
  config: ISeoEquityConfig
): string[] {
  const pinned = config.pinnedBySurface[surface] ?? [];
  const ranked = entities
    .filter(entity => entity.eligibleSurfaces.includes(surface))
    .map(entity => entity.url);
  const urls = [...pinned, ...ranked].filter((url, index, list) => list.indexOf(url) === index);
  return urls.slice(0, max);
}

export function buildSeoEquitySnapshot(input: IBuildSnapshotInput): ISeoEquitySnapshot {
  const normalizedPages = input.pages.map(page => ({
    ...page,
    url: normalizeSeoPath(page.url, input.config.siteUrl),
  }));
  const pageMap = new Map<string, ISeoEquityGscPage>();
  for (const page of normalizedPages) {
    const existing = pageMap.get(page.url);
    if (!existing) {
      pageMap.set(page.url, page);
    } else {
      const impressions = existing.impressions + page.impressions;
      const clicks = existing.clicks + page.clicks;
      pageMap.set(page.url, {
        url: page.url,
        clicks,
        impressions,
        ctr: impressions ? clicks / impressions : 0,
        position:
          impressions > 0
            ? (existing.position * existing.impressions + page.position * page.impressions) / impressions
            : page.position,
      });
    }
  }

  const configUrls = new Set<string>([
    ...input.config.allowlist,
    ...Object.keys(input.config.businessValueWeights),
    ...Object.keys(input.config.recentlyEditedUntil),
    ...input.config.canonicalClusters.flatMap(cluster => cluster.members.map(member => member.url)),
  ]);

  for (const url of configUrls) {
    if (!pageMap.has(url)) {
      pageMap.set(url, { url, clicks: 0, impressions: 0, ctr: 0, position: 100 });
    }
  }

  const entities = rankEntities(
    Array.from(pageMap.values())
      .map(page => buildEntity(input.config, page))
      .filter((entity): entity is ISeoEquityEntity => Boolean(entity))
  );

  const homepageBlogPicks = topUrlsBySurface(
    entities,
    'homepageBlogPicks',
    input.config.maxSurfaceSlots.homepageBlogPicks,
    input.config
  );
  const blogIndexFeatured = topUrlsBySurface(
    entities,
    'blogIndexFeatured',
    input.config.maxSurfaceSlots.blogIndexFeatured,
    input.config
  );
  const blogStartHereUrls = topUrlsBySurface(
    entities,
    'blogStartHere',
    input.config.maxSurfaceSlots.blogStartHere,
    input.config
  );
  const footerCandidates = topUrlsBySurface(
    entities,
    'blogFooterRelated',
    input.config.maxSurfaceSlots.blogFooterRelated + 1,
    input.config
  );
  const pseoCandidates = topUrlsBySurface(
    entities,
    'pseoRelatedBlogPosts',
    input.config.maxSurfaceSlots.pseoRelatedBlogPosts,
    input.config
  );

  return {
    generatedAt: input.generatedAt,
    source: {
      gscExport: input.gscExport ?? 'manual-test-input',
      window: input.window ?? { startDate: '1970-01-01', endDate: '1970-01-01', days: 1 },
    },
    settings: input.config.settings,
    entities,
    surfaces: {
      homepageBlogPicks,
      blogIndexFeatured,
      blogStartHere: blogStartHereUrls.map(url => ({
        label: url
          .replace(BLOG_PATH_PREFIX, '')
          .split('-')
          .map(word => word.charAt(0).toUpperCase() + word.slice(1))
          .join(' '),
        href: url,
        description: 'Start with this high-value guide from the SEO equity snapshot.',
      })),
      blogFooterRelated: Object.fromEntries(
        entities
          .filter(entity => entity.url.startsWith(BLOG_PATH_PREFIX))
          .map(entity => [
            entity.url,
            footerCandidates.filter(url => url !== entity.url).slice(0, input.config.maxSurfaceSlots.blogFooterRelated),
          ])
      ),
      pseoRelatedBlogPosts: Object.fromEntries(
        Object.entries(input.config.pseoRelatedTargets).map(([path, configured]) => [
          path,
          [...configured, ...pseoCandidates]
            .filter((url, index, list) => list.indexOf(url) === index)
            .slice(0, input.config.maxSurfaceSlots.pseoRelatedBlogPosts),
        ])
      ),
      hubSpokeLinks: {},
    },
  };
}

function promotedSignature(snapshot: ISeoEquitySnapshot): string {
  return JSON.stringify(snapshot.surfaces);
}

export function hasMaterialSeoEquityChange(
  before: ISeoEquitySnapshot,
  after: ISeoEquitySnapshot,
  options: IMaterialChangeOptions
): IMaterialChangeResult {
  const reasons: string[] = [];
  if (promotedSignature(before) !== promotedSignature(after)) {
    reasons.push('promoted sets changed');
  }

  const beforeScores = new Map(before.entities.map(entity => [entity.url, entity.score]));
  for (const entity of after.entities) {
    const oldScore = beforeScores.get(entity.url);
    if (oldScore === undefined) continue;
    if (Math.abs(entity.score - oldScore) >= options.minScoreDelta) {
      reasons.push(`score delta for ${entity.url}: ${roundScore(entity.score - oldScore)}`);
    }
  }

  return { material: reasons.length > 0, reasons };
}

export function stableStringify(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}
