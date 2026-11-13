import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (relativePath: string): string =>
  readFileSync(join(process.cwd(), relativePath), 'utf-8');

const POST_PAGE = 'app/[locale]/blog/[slug]/page.tsx';
const TAGS_COMPONENT = 'client/components/blog/BlogPostTags.tsx';
const BLOG_INDEX = 'app/[locale]/blog/page.tsx';

const blogQueryLinkPattern = /<Link\b[^>]*\/blog\?q=[^>]*>/g;

describe('Blog link hygiene', () => {
  it.each([POST_PAGE, TAGS_COMPONENT])('every /blog?q= Link in %s disables prefetch', file => {
    const matches = read(file).match(blogQueryLinkPattern) ?? [];
    expect(matches.length).toBeGreaterThan(0);
    for (const match of matches) {
      expect(match).toContain('prefetch={false}');
    }
  });

  it('the post breadcrumb link to the uncached /blog index disables prefetch', () => {
    const matches = read(POST_PAGE).match(/<Link\b[^>]*href="\/blog"[^>]*>/g) ?? [];
    expect(matches.length).toBeGreaterThan(0);
    for (const match of matches) {
      expect(match).toContain('prefetch={false}');
    }
  });

  it('blog pagination links do not prefetch the uncached paginated index', () => {
    const matches = read(BLOG_INDEX).match(/<Link\b[^>]*\?page=[^>]*>/g) ?? [];
    expect(matches.length).toBe(3);
    for (const match of matches) {
      expect(match).toContain('prefetch={false}');
    }
  });

  it('blog pagination links do not use the /${locale}/blog?page= redirecting prefix', () => {
    const source = read(BLOG_INDEX);
    expect(source).not.toContain('/${locale}/blog?page=');
    expect(source).toContain("getLocalizedPath('/blog', locale)");
  });
});
