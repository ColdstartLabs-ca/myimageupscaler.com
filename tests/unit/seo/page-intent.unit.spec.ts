import { describe, expect, it } from 'vitest';
import {
  COMMERCIAL_ROUNDUP_URLS,
  getPageIntent,
  INFORMATIONAL_CITATION_URLS,
  isExcludedInformationalUrl,
} from '@lib/seo/page-intent';

describe('getPageIntent', () => {
  it('classifies the roundup and tool surfaces as commercial', () => {
    expect(getPageIntent(COMMERCIAL_ROUNDUP_URLS[0])).toBe('commercial');
    expect(getPageIntent('/tools/ai-image-upscaler')).toBe('commercial');
    expect(getPageIntent('/free/ai-image-upscaler')).toBe('commercial');
    expect(getPageIntent('/scale/upscale-to-4k')).toBe('commercial');
  });

  it('classifies the shipped bulk roundup as commercial after locale normalization', () => {
    for (const url of [
      '/blog/best-bulk-image-upscalers-2026',
      '/en/blog/best-bulk-image-upscalers-2026/',
      'https://myimageupscaler.com/pt/blog/best-bulk-image-upscalers-2026/?utm_source=test',
    ]) {
      expect(getPageIntent(url), url).toBe('commercial');
    }
  });

  it('keeps blog citation assets informational', () => {
    for (const url of INFORMATIONAL_CITATION_URLS) {
      expect(getPageIntent(url), url).toBe('informational');
      expect(isExcludedInformationalUrl(url), url).toBe(true);
    }
  });

  it('normalizes absolute URLs, locale prefixes, queries, and trailing slashes', () => {
    expect(getPageIntent('https://myimageupscaler.com/en/tools/ai-image-upscaler/?src=blog')).toBe(
      'commercial'
    );
    expect(getPageIntent('/en/blog/fixing-pixelated-photos/?utm_source=ai-overview')).toBe(
      'informational'
    );
    expect(
      isExcludedInformationalUrl('https://myimageupscaler.com/blog/fixing-pixelated-photos/')
    ).toBe(true);
  });

  it('defaults an unclassified page to informational', () => {
    expect(getPageIntent('/blog/a-new-guide')).toBe('informational');
  });
});
