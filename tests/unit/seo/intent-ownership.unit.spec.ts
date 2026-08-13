import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { NextRequest } from 'next/server';
import {
  INDEXABLE_INTENT_PAGES,
  INTENT_CLUSTERS,
  getOwnerPath,
  type IIndexableIntentPage,
  isClusterMember,
  isClusterOwner,
  validateIntentPrimaryKeywordOwnership,
} from '@/lib/seo/intent-ownership';

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

vi.mock('@server/rateLimit', () => ({
  rateLimit: { limit: vi.fn() },
  publicRateLimit: { limit: vi.fn() },
}));

vi.mock('@shared/config/env', () => ({
  clientEnv: {
    SUPABASE_URL: 'https://test.supabase.co',
    SUPABASE_ANON_KEY: 'test-anon-key',
  },
  serverEnv: {
    ENV: 'test',
    AMPLITUDE_API_KEY: 'test_amplitude_api_key',
  },
  isDevelopment: () => false,
}));

vi.mock('@shared/utils/supabase/middleware', () => ({
  updateSession: vi.fn(),
}));

async function getDataLoaderIntentPages(): Promise<IIndexableIntentPage[]> {
  const { getAllFormats, getAllFormatScale, getAllScales } = await import('@/lib/seo/data-loader');
  const [formats, formatScale, scales] = await Promise.all([
    getAllFormats(),
    getAllFormatScale(),
    getAllScales(),
  ]);

  const toIntentPages = (
    basePath: string,
    pages: readonly { slug: string; primaryKeyword: string; noindex?: boolean }[]
  ): IIndexableIntentPage[] =>
    pages
      .filter(page => !page.noindex)
      .map(page => ({
        path: `${basePath}/${page.slug}`,
        primaryKeyword: page.primaryKeyword,
      }));

  return [
    ...toIntentPages('/formats', formats),
    ...toIntentPages('/format-scale', formatScale),
    ...toIntentPages('/scale', scales),
  ];
}

describe('intent ownership', () => {
  const EXPECTED_GIF_OWNER_PATH = '/formats/upscale-gif-images';
  const EXPECTED_GIF_MEMBER_PATHS = [
    '/format-scale/gif-upscale-2x',
    '/format-scale/gif-upscale-4x',
    '/format-scale/gif-upscale-8x',
    '/format-scale/gif-upscale-16x',
  ] as const;
  const gifOwnerPage = INDEXABLE_INTENT_PAGES.find(page => page.path === EXPECTED_GIF_OWNER_PATH);

  if (!gifOwnerPage) {
    throw new Error('GIF owner fixture is missing from the indexable page inventory');
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test.each(
    EXPECTED_GIF_MEMBER_PATHS.map(memberPath => [EXPECTED_GIF_OWNER_PATH, memberPath] as const)
  )('should 301 every GIF cluster member to its owner', async (ownerPath, memberPath) => {
    const { middleware } = await import('../../../middleware');
    const response = await middleware(new NextRequest(`http://localhost${memberPath}`));

    expect(response.status).toBe(301);
    expect(response.headers.get('location')).toBe(`http://localhost${ownerPath}`);
    expect(isClusterMember(memberPath)).toBe(true);
    expect(getOwnerPath(memberPath)).toBe(ownerPath);
  });

  test('should never make an owner a member of another cluster', () => {
    const owners = new Set(INTENT_CLUSTERS.map(cluster => cluster.ownerPath));
    const members = INTENT_CLUSTERS.flatMap(cluster => cluster.memberPaths);

    expect(members).not.toEqual(expect.arrayContaining([...owners]));
    expect(new Set(members).size).toBe(members.length);

    for (const ownerPath of owners) {
      expect(isClusterOwner(ownerPath)).toBe(true);
      expect(isClusterMember(ownerPath)).toBe(false);
      expect(getOwnerPath(ownerPath)).toBe(ownerPath);
    }
  });

  test('keeps the generic 16x scale URL measurement-only until the exact Phase 0 gate', () => {
    const [gifCluster] = INTENT_CLUSTERS;

    expect(gifCluster.baselineContract).toEqual({
      startDate: '2026-06-16',
      endDate: '2026-07-13',
      minimumClicks: 847,
    });
    expect(gifCluster.deferredCandidates).toEqual([
      {
        path: '/scale/upscale-16x',
        primaryKeyword: 'upscale 16x',
      },
    ]);
    expect(gifCluster.measurementPaths).toContain('/scale/upscale-16x');
    expect(gifCluster.memberPaths).not.toContain('/scale/upscale-16x');
  });

  test('should validate the real JSON-backed data-loader inventory', async () => {
    const dataLoaderPages = await getDataLoaderIntentPages();

    expect(dataLoaderPages).toEqual(INDEXABLE_INTENT_PAGES);
    expect(() =>
      validateIntentPrimaryKeywordOwnership(INTENT_CLUSTERS, dataLoaderPages)
    ).not.toThrow();
  });

  test('should reject a declared owner keyword that disagrees with JSON', () => {
    const [gifCluster] = INTENT_CLUSTERS;
    const mismatchedCluster = {
      ...gifCluster,
      primaryKeywordOwners: gifCluster.primaryKeywordOwners.map(keywordOwner => ({
        ...keywordOwner,
        keyword: 'gif upscaler',
      })),
    };

    expect(() =>
      validateIntentPrimaryKeywordOwnership([mismatchedCluster], INDEXABLE_INTENT_PAGES)
    ).toThrow('does not match JSON');
  });

  test('should reject an owned keyword in the JSON-backed inventory at module load', async () => {
    vi.resetModules();
    vi.doMock('@/app/seo/data/format-scale.json', async () => {
      const actual = await vi.importActual<typeof import('@/app/seo/data/format-scale.json')>(
        '@/app/seo/data/format-scale.json'
      );
      const pages = actual.default.pages.map((page, index) =>
        index === 0 ? { ...page, primaryKeyword: gifOwnerPage.primaryKeyword } : page
      );

      return {
        ...actual,
        default: {
          ...actual.default,
          pages,
        },
      };
    });

    try {
      await expect(import('@/lib/seo/intent-ownership')).rejects.toThrow('already owned');
    } finally {
      vi.doUnmock('@/app/seo/data/format-scale.json');
      vi.resetModules();
    }
  });

  test('should normalize trailing slashes without redirecting unknown paths', () => {
    const memberPath = INTENT_CLUSTERS[0].memberPaths[0];

    expect(isClusterMember(`${memberPath}/`)).toBe(true);
    expect(getOwnerPath(`${memberPath}/`)).toBe(INTENT_CLUSTERS[0].ownerPath);
    expect(getOwnerPath('/format-scale/not-a-cluster')).toBeNull();
  });
});
