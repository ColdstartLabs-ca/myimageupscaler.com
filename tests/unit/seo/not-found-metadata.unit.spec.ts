import { describe, expect, it } from 'vitest';
import { metadata as globalMetadata } from '@/app/not-found';
import { metadata as localeMetadata } from '@/app/[locale]/not-found';

describe('404 metadata', () => {
  it('should give global and locale 404 pages an explicit noindex title', () => {
    for (const metadata of [globalMetadata, localeMetadata]) {
      expect(metadata.title).toBe('Page Not Found | MyImageUpscaler');
      expect(metadata.robots).toMatchObject({ index: false, follow: true });
    }
  });
});
