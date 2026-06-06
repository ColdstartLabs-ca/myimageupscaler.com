import fs from 'node:fs';
import path from 'node:path';
import { splitBlogHeroTitle } from '@client/components/blog/blog-ui';

describe('splitBlogHeroTitle', () => {
  it('splits on colon into white lead and gradient highlight', () => {
    expect(splitBlogHeroTitle('Convert Picture to Outline: Guide for 2026 Projects')).toEqual({
      lead: 'Convert Picture to Outline:',
      highlight: 'Guide for 2026 Projects',
    });
  });

  it('splits long titles without punctuation into lead and highlight', () => {
    expect(splitBlogHeroTitle('How to Upscale Images Without Losing Quality')).toEqual({
      lead: 'How to Upscale Images',
      highlight: 'Without Losing Quality',
    });
  });
});

describe('blog post hero section', () => {
  it('uses a landing-style two-column hero band separate from the article grid', () => {
    const pageSource = fs.readFileSync(
      path.resolve(process.cwd(), 'app/[locale]/blog/[slug]/page.tsx'),
      'utf8'
    );
    const heroSource = fs.readFileSync(
      path.resolve(process.cwd(), 'client/components/blog/BlogPostHeroSection.tsx'),
      'utf8'
    );

    expect(pageSource).toContain('BlogPostHeroSection');
    expect(pageSource).not.toContain("from '@client/components/blog/BlogPostHero'");
    expect(heroSource).toContain('lg:grid-cols-2');
    expect(heroSource).toContain('gradient-text-primary');
    expect(heroSource).toContain('text-white');
    expect(heroSource).toContain('block gradient-text-primary');
    expect(heroSource).toContain('blogPrimaryButtonClass');
    expect(heroSource).toContain('Reviewed by');
    expect(heroSource).toContain('specialist.role');
  });
});
