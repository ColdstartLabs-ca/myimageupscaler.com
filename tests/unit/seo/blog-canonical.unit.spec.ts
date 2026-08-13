import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BLOG_ROUTE = resolve(process.cwd(), 'app/[locale]/blog/[slug]/page.tsx');

describe('blog canonical contract', () => {
  const source = readFileSync(BLOG_ROUTE, 'utf8');

  it('uses the post URL as its canonical URL', () => {
    expect(source).toContain('const canonicalUrl = `${clientEnv.BASE_URL}/blog/${slug}`');
    expect(source).toContain('canonical: canonicalUrl');
  });

  it('keeps published blog posts indexable', () => {
    expect(source).toContain('index: true');
    expect(source).toContain('follow: true');
    expect(source).not.toContain('index: false');
  });
});
