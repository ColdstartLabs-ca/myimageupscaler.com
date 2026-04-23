import { describe, it, expect } from 'vitest';
import interactiveTools from '@/app/seo/data/interactive-tools.json';

const EXIF_SLUGS = [
  'exif-remover',
  'remove-metadata-from-photo',
  'remove-gps-from-photo',
  'strip-exif-data-online',
];

describe('EXIF Remover pSEO entries', () => {
  const pages = interactiveTools.pages;

  it('should have all 4 slugs present', () => {
    for (const slug of EXIF_SLUGS) {
      expect(
        pages.find(p => p.slug === slug),
        `Missing slug: ${slug}`
      ).toBeDefined();
    }
  });

  it('should all reference ExifRemover toolComponent', () => {
    for (const slug of EXIF_SLUGS) {
      const page = pages.find(p => p.slug === slug);
      expect(page?.toolComponent, `Wrong toolComponent for ${slug}`).toBe('ExifRemover');
    }
  });

  it('should have metaTitle under 60 chars', () => {
    for (const slug of EXIF_SLUGS) {
      const page = pages.find(p => p.slug === slug)!;
      expect(
        page.metaTitle.length,
        `metaTitle too long for ${slug}: "${page.metaTitle}" (${page.metaTitle.length} chars)`
      ).toBeLessThanOrEqual(60);
    }
  });

  it('should have metaDescription under 160 chars', () => {
    for (const slug of EXIF_SLUGS) {
      const page = pages.find(p => p.slug === slug)!;
      expect(
        page.metaDescription.length,
        `metaDescription too long for ${slug}: ${page.metaDescription.length} chars`
      ).toBeLessThanOrEqual(160);
    }
  });
});
