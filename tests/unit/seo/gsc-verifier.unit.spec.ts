import { describe, expect, it } from 'vitest';
import {
  findNoindexedSitemapOverlap,
  findSitemapOverlap,
  parseVerifierArgs,
} from '@/scripts/seo/verify-gsc';

describe('GSC sitemap overlap verifier', () => {
  it('returns no overlap for a clean sitemap and noindexed set', () => {
    expect(
      findNoindexedSitemapOverlap(
        ['https://myimageupscaler.com/tools/ai-image-upscaler'],
        [{ url: 'https://myimageupscaler.com/guides/old-guide', robots: 'noindex,follow' }],
        'https://myimageupscaler.com'
      )
    ).toEqual([]);
  });

  it('reports a sitemap URL whose page is noindexed', () => {
    expect(
      findNoindexedSitemapOverlap(
        ['https://myimageupscaler.com/guides/old-guide/'],
        [{ url: 'https://myimageupscaler.com/guides/old-guide', robots: 'index, noindex, follow' }],
        'https://myimageupscaler.com'
      )
    ).toEqual(['https://myimageupscaler.com/guides/old-guide']);
  });

  it('fails when any requested CNI URL remains in the sitemap', () => {
    expect(
      findSitemapOverlap(
        ['https://myimageupscaler.com/guides/old-guide/'],
        ['https://myimageupscaler.com/guides/old-guide'],
        'https://myimageupscaler.com'
      )
    ).toEqual(['https://myimageupscaler.com/guides/old-guide']);
  });

  it('requires the supported set and base URL contract', () => {
    expect(
      parseVerifierArgs(['node', 'verify-gsc', '--set=cni', '--base-url=https://example.com'])
    ).toMatchObject({
      set: 'cni',
      baseUrl: 'https://example.com',
    });
    expect(() =>
      parseVerifierArgs(['node', 'verify-gsc', '--set=other', '--base-url=https://example.com'])
    ).toThrow('Unsupported --set=other');
    expect(() => parseVerifierArgs(['node', 'verify-gsc', '--set=cni'])).toThrow(
      '--base-url is required'
    );
  });
});
