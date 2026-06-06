import fs from 'node:fs';
import path from 'node:path';

describe('blog post above-the-fold layout', () => {
  const pagePath = path.resolve(process.cwd(), 'app/[locale]/blog/[slug]/page.tsx');
  let pageSource: string;

  beforeAll(() => {
    pageSource = fs.readFileSync(pagePath, 'utf8');
  });

  it('uses a dedicated hero section before the article grid', () => {
    expect(pageSource).toContain('BlogPostHeroSection');
    expect(pageSource).toMatch(
      /BlogPostHeroSection[\s\S]*grid gap-8 lg:grid-cols-\[minmax\(0,1fr\)_280px\]/
    );
  });

  it('keeps mobile guide navigation in the hero section', () => {
    const heroSource = fs.readFileSync(
      path.resolve(process.cwd(), 'client/components/blog/BlogPostHeroSection.tsx'),
      'utf8'
    );

    expect(heroSource).toContain('BlogGuideNav');
    expect(heroSource).toContain('className="mt-6 lg:hidden"');
  });

  it('starts article prose directly after the hero without a tool banner stack', () => {
    expect(pageSource).not.toContain('CompactToolsBanner');
  });

  it('uses smaller mobile prose so article content starts sooner', () => {
    expect(pageSource).toContain('prose-base');
    expect(pageSource).toContain('lg:prose-lg');
  });
});
