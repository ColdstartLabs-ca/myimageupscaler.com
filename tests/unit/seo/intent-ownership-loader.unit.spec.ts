import { describe, expect, test, vi } from 'vitest';

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(),
}));

vi.mock('@server/rateLimit', () => ({
  rateLimit: { limit: vi.fn() },
  publicRateLimit: { limit: vi.fn() },
}));

vi.mock('@shared/config/env', () => ({
  clientEnv: {
    BASE_URL: 'https://myimageupscaler.com',
    PRIMARY_DOMAIN: 'myimageupscaler.com',
  },
  serverEnv: {
    ENV: 'test',
  },
  isDevelopment: () => false,
}));

vi.mock('@/lib/seo/intent-ownership', async () => {
  const actual = await vi.importActual<typeof import('@/lib/seo/intent-ownership')>(
    '@/lib/seo/intent-ownership'
  );
  const futureCluster = {
    intent: 'future-scale',
    ownerPath: '/formats/upscale-images',
    memberPaths: ['/scale/upscale-16x'],
    primaryKeywordOwners: [],
  } as const;
  const ownershipTable = [...actual.INTENT_CLUSTERS, futureCluster];
  const memberPaths = new Set(ownershipTable.flatMap(cluster => cluster.memberPaths));

  return {
    ...actual,
    INTENT_CLUSTERS: ownershipTable,
    isClusterMember: (path: string) =>
      memberPaths.has(path.replace(/\/$/, '')) || actual.isClusterMember(path),
  };
});

describe('intent ownership loader integration', () => {
  test('suppresses a scale member when a future cluster row represents it', async () => {
    const { getAllScaleSlugs, getAllScales, getScaleData, getScaleDataWithLocale } =
      await import('@/lib/seo/data-loader');

    expect(await getAllScaleSlugs()).not.toContain('upscale-16x');
    expect(await getScaleData('upscale-16x')).toBeNull();
    expect((await getAllScales()).some(page => page.slug === 'upscale-16x')).toBe(false);
    expect((await getScaleDataWithLocale('upscale-16x', 'en')).data).toBeNull();
  });
});
