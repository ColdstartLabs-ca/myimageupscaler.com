/**
 * Blog redirects vs sitemap
 *
 * Every /blog/* URL that next.config.js permanently redirects must be listed
 * in BLOCKED_BLOG_SLUGS so it never appears in the blog sitemap.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { BLOCKED_BLOG_SLUGS } from '@shared/constants/blocked-blog-slugs';

const nextConfig = readFileSync(resolve(process.cwd(), 'next.config.js'), 'utf8');

function extractRedirectedBlogSlugs(): string[] {
  const regex = /source:\s*'\/blog\/([a-z0-9-]+)'/g;
  return Array.from(nextConfig.matchAll(regex), match => match[1]);
}

describe('blog redirects', () => {
  it('should block every permanently redirected blog slug from the sitemap', () => {
    const redirectedSlugs = extractRedirectedBlogSlugs();

    expect(redirectedSlugs.length).toBeGreaterThan(0);

    for (const slug of redirectedSlugs) {
      expect(BLOCKED_BLOG_SLUGS, `Missing blocked slug: ${slug}`).toContain(slug);
    }
  });
});
