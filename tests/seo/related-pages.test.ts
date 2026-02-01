/**
 * Related Pages Tests
 *
 * Tests for related pages functionality in programmatic SEO
 */

import { describe, it, expect } from 'vitest';
import { getRelatedPages } from '@lib/seo/related-pages';
import type { IRelatedPage } from '@lib/seo/related-pages';

describe('Related Pages', () => {
  it('should return related pages for platforms category', async () => {
    const related = await getRelatedPages('platforms', 'instagram', 'en');

    expect(related).toBeDefined();
    expect(Array.isArray(related)).toBe(true);
    expect(related.length).toBeGreaterThan(0);

    for (const page of related) {
      expect(page).toHaveProperty('slug');
      expect(page).toHaveProperty('title');
      expect(page).toHaveProperty('category');
      expect(page).toHaveProperty('url');
    }
  });

  it('should return related pages for formats category', async () => {
    const related = await getRelatedPages('formats', 'jpg', 'en');

    expect(related).toBeDefined();
    expect(Array.isArray(related)).toBe(true);
  });

  it('should return related pages for format-scale category', async () => {
    const related = await getRelatedPages('format-scale', 'jpg-2x', 'en');

    expect(related).toBeDefined();
    expect(Array.isArray(related)).toBe(true);
  });

  it('should exclude the current page from results', async () => {
    const currentSlug = 'instagram';
    const related = await getRelatedPages('platforms', currentSlug, 'en');

    for (const page of related) {
      expect(page.slug).not.toBe(currentSlug);
    }
  });
});
