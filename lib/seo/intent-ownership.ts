/**
 * Search-intent ownership for overlapping pSEO URL families.
 *
 * Each cluster has one indexable owner and one or more redirecting members.
 * Keep canonical paths here so middleware, data loading, sitemap generation,
 * and hreflang generation cannot drift into separate membership lists.
 */

import formatScaleDataFile from '@/app/seo/data/format-scale.json';
import formatsDataFile from '@/app/seo/data/formats.json';
import scaleDataFile from '@/app/seo/data/scale.json';

export interface IIntentCluster {
  intent: string;
  ownerPath: string;
  memberPaths: readonly string[];
  /** Primary keywords that this consolidated cluster already owns. */
  primaryKeywordOwners: readonly IIntentKeywordOwner[];
  /** Fixed date and click floor used by the cluster's Phase 0 gate. */
  baselineContract: IIntentBaselineContract;
  /** Paths measured for comparison before their own consolidation gate passes. */
  measurementPaths?: readonly string[];
  /** Candidate paths whose ownership is deferred until their own measurement gate. */
  deferredCandidates?: readonly IDeferredIntentCandidate[];
  /** Paths in the PRD 04 pre-split audit table used for the acceptance baseline. */
  baselinePaths?: readonly string[];
}

export interface IIntentKeywordOwner {
  keyword: string;
  ownerPath: string;
}

export interface IIntentBaselineContract {
  startDate: string;
  endDate: string;
  minimumClicks: number;
}

export interface IDeferredIntentCandidate {
  path: string;
  primaryKeyword: string;
}

/**
 * Only pass indexable pages to this contract. Pages outside a consolidated
 * cluster are intentionally not checked for global keyword uniqueness.
 */
export interface IIndexableIntentPage {
  path: string;
  primaryKeyword: string;
}

/**
 * Clusters are added only after their measured consolidation gate passes.
 * The GIF row preserves the already-shipped consolidation exactly.
 */
export const INTENT_CLUSTERS: readonly IIntentCluster[] = [
  {
    intent: 'gif',
    ownerPath: '/formats/upscale-gif-images',
    memberPaths: [
      '/format-scale/gif-upscale-2x',
      '/format-scale/gif-upscale-4x',
      '/format-scale/gif-upscale-8x',
      '/format-scale/gif-upscale-16x',
    ],
    primaryKeywordOwners: [
      {
        keyword: 'upscale gif images',
        ownerPath: '/formats/upscale-gif-images',
      },
    ],
    baselineContract: {
      startDate: '2026-06-16',
      endDate: '2026-07-13',
      minimumClicks: 847,
    },
    // This competing scale URL remains measurement-only until the exact 28-day Phase 0 gate.
    measurementPaths: ['/scale/upscale-16x'],
    // It targets "upscale 16x", not the GIF owner's current intent member.
    deferredCandidates: [
      {
        path: '/scale/upscale-16x',
        primaryKeyword: 'upscale 16x',
      },
    ],
    // PRD 04 defines the pre-split acceptance baseline with these three URLs.
    baselinePaths: [
      '/format-scale/gif-upscale-16x',
      '/formats/upscale-gif-images',
      '/scale/upscale-16x',
    ],
  },
];

function normalizePath(path: string): string {
  if (path === '/') return path;
  return path.replace(/\/$/, '');
}

function normalizeKeyword(keyword: string): string {
  return keyword.trim().toLowerCase();
}

const ownerPaths = new Set(INTENT_CLUSTERS.map(cluster => normalizePath(cluster.ownerPath)));
const memberToOwner = new Map<string, string>();

for (const cluster of INTENT_CLUSTERS) {
  const ownerPath = normalizePath(cluster.ownerPath);

  if (cluster.memberPaths.some(memberPath => normalizePath(memberPath) === ownerPath)) {
    throw new Error(`Intent cluster owner cannot also be a member: ${ownerPath}`);
  }

  for (const memberPath of cluster.memberPaths) {
    const normalizedMemberPath = normalizePath(memberPath);

    if (ownerPaths.has(normalizedMemberPath)) {
      throw new Error(
        `Intent cluster member cannot be another cluster owner: ${normalizedMemberPath}`
      );
    }

    const existingOwner = memberToOwner.get(normalizedMemberPath);
    if (existingOwner && existingOwner !== ownerPath) {
      throw new Error(`Intent cluster member has multiple owners: ${normalizedMemberPath}`);
    }

    memberToOwner.set(normalizedMemberPath, ownerPath);
  }
}

/**
 * Return the owning path for a cluster member or owner.
 * Returns null for paths outside the ownership table.
 */
export function getOwnerPath(path: string): string | null {
  const normalizedPath = normalizePath(path);
  return (
    memberToOwner.get(normalizedPath) ?? (ownerPaths.has(normalizedPath) ? normalizedPath : null)
  );
}

/** Return true only for redirecting member paths, never for an owner path. */
export function isClusterMember(path: string): boolean {
  return memberToOwner.has(normalizePath(path));
}

/** Return true for paths whose localized variants must not be indexed. */
export function isClusterOwner(path: string): boolean {
  return ownerPaths.has(normalizePath(path));
}

function getIndexableIntentPages(
  basePath: string,
  pages: readonly { slug: string; primaryKeyword: string; noindex?: boolean }[]
): IIndexableIntentPage[] {
  return pages
    .filter(page => !page.noindex && !isClusterMember(`${basePath}/${page.slug}`))
    .map(page => ({
      path: `${basePath}/${page.slug}`,
      primaryKeyword: page.primaryKeyword,
    }));
}

/**
 * The synchronous inventory used by the repository guard. These are the
 * JSON-backed taxonomy pages consumed by the matching data-loader functions;
 * cluster members are excluded exactly as the loaders exclude them from the
 * indexable route inventory.
 */
export const INDEXABLE_INTENT_PAGES: readonly IIndexableIntentPage[] = [
  ...getIndexableIntentPages('/formats', formatsDataFile.pages),
  ...getIndexableIntentPages('/format-scale', formatScaleDataFile.pages),
  ...getIndexableIntentPages('/scale', scaleDataFile.pages),
];

/**
 * Reject an indexable page that reuses a primary keyword already owned by a
 * consolidated cluster. This is intentionally cluster-scoped, not a global
 * uniqueness rule for the repository's unrelated SEO pages.
 */
export function validateIntentPrimaryKeywordOwnership(
  clusters: readonly IIntentCluster[],
  pages: readonly IIndexableIntentPage[]
): void {
  const keywordOwners = new Map<string, string>();

  for (const cluster of clusters) {
    const clusterOwnerPath = normalizePath(cluster.ownerPath);

    for (const keywordOwner of cluster.primaryKeywordOwners) {
      const keyword = normalizeKeyword(keywordOwner.keyword);
      const ownerPath = normalizePath(keywordOwner.ownerPath);

      if (!keyword) {
        throw new Error(`Intent cluster keyword cannot be empty: ${cluster.intent}`);
      }

      if (ownerPath !== clusterOwnerPath) {
        throw new Error(
          `Intent cluster keyword owner must be the cluster owner: ${keywordOwner.ownerPath}`
        );
      }

      const ownerPage = pages.find(page => normalizePath(page.path) === ownerPath);

      if (!ownerPage) {
        throw new Error(
          `Intent cluster owner page is missing from the indexable inventory: ${ownerPath}`
        );
      }

      if (normalizeKeyword(ownerPage.primaryKeyword) !== keyword) {
        throw new Error(
          `Intent cluster owner keyword does not match JSON for ${ownerPath}: declared "${keywordOwner.keyword}", actual "${ownerPage.primaryKeyword}"`
        );
      }

      if (keywordOwners.has(keyword)) {
        throw new Error(`Intent primary keyword has multiple owners: ${keywordOwner.keyword}`);
      }

      keywordOwners.set(keyword, ownerPath);
    }
  }

  for (const page of pages) {
    const ownerPath = keywordOwners.get(normalizeKeyword(page.primaryKeyword));

    if (ownerPath && normalizePath(page.path) !== ownerPath) {
      throw new Error(
        `Primary keyword "${page.primaryKeyword}" is already owned by "${ownerPath}": ${page.path}`
      );
    }
  }
}

// Validate the table itself at import time while leaving repository-wide
// duplicate keywords outside consolidated clusters intentionally untouched.
validateIntentPrimaryKeywordOwnership(INTENT_CLUSTERS, INDEXABLE_INTENT_PAGES);
