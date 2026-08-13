/**
 * Cannibalization redirects are static Next.js redirects, not middleware rules.
 */

import { describe, expect, it } from 'vitest';
import { LEGACY_REDIRECTS } from '@/lib/seo/legacy-redirects';

const CANNIBALIZATION_REDIRECTS = [
  [
    '/blog/photo-enhancement-upscaling-vs-quality',
    '/blog/ai-image-upscaling-vs-sharpening-explained',
  ],
  [
    '/blog/best-free-ai-image-upscaler-tools-2026',
    '/blog/best-free-ai-image-upscaler-2026-tested-compared',
  ],
  ['/blog/restore-old-photos-online', '/use-cases/old-photo-restoration'],
  ['/blog/free-upscaler-no-sign-up', '/blog/free-ai-upscaler-no-watermark'],
  ['/blog/upscale-image-online-free', '/blog/free-ai-upscaler-no-watermark'],
  ['/blog/ai-vs-traditional-image-upscaling', '/blog/ai-image-upscaling-vs-sharpening-explained'],
  ['/blog/how-ai-image-upscaling-works-explained', '/blog/how-ai-image-upscaling-works-guide'],
] as const;

describe('Cannibalization Redirects', () => {
  it.each(CANNIBALIZATION_REDIRECTS)('should preserve %s → %s', (source, destination) => {
    const entry = LEGACY_REDIRECTS.find(redirect => redirect.source === source);

    expect(entry?.destination).toBe(destination);
    expect(entry?.permanent).toBe(true);
  });
});
