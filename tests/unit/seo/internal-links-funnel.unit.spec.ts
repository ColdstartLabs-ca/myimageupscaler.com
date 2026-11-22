import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { getBlogContextualToolLinks } from '@lib/seo/blog-tool-links';

const ROOT = join(process.cwd());

function loadSlugs(path: string): string[] {
  const data = JSON.parse(readFileSync(join(ROOT, path), 'utf8')) as {
    pages: Array<{ slug: string }>;
  };
  return data.pages.map(page => page.slug);
}

describe('blog contextual tool links', () => {
  const ruleCases: Array<{ slug: string; hrefs: string[]; anchors: string[] }> = [
    {
      slug: 'how-to-make-a-background-transparent',
      hrefs: ['/tools/remove-bg', '/tools/make-image-transparent'],
      anchors: ['Free background remover', 'Make an image transparent'],
    },
    {
      slug: 'adobe-express-upscale-photos',
      hrefs: ['/alternatives/vs-adobe-express'],
      anchors: ['Adobe Express image upscaler alternative'],
    },
    {
      slug: 'image-upscaler-8x',
      hrefs: ['/tools/ai-image-upscaler'],
      anchors: ['8x AI image upscaler tool'],
    },
    {
      slug: 'how-to-improve-photo-resolution',
      hrefs: ['/'],
      anchors: ['AI image upscaler'],
    },
  ];

  it.each(ruleCases)('maps $slug to the owning destination', ({ slug, hrefs, anchors }) => {
    const links = getBlogContextualToolLinks(slug);
    expect(links.map(link => link.href)).toEqual(hrefs);
    expect(links.map(link => link.anchor)).toEqual(anchors);
  });

  it('returns at most two links per post', () => {
    for (const slug of [
      'upscale-background-transparent-cutout',
      'enlarge-transparent-picture',
      'adobe-upscale-resolution',
      'image-upscaler-8x',
    ]) {
      expect(getBlogContextualToolLinks(slug).length).toBeLessThanOrEqual(2);
    }
  });

  it('applies the first matching rule', () => {
    const links = getBlogContextualToolLinks('transparent-upscale-resolution-guide');
    expect(links.map(link => link.href)).toEqual([
      '/tools/remove-bg',
      '/tools/make-image-transparent',
    ]);

    const exactSlugLinks = getBlogContextualToolLinks('image-upscaler-8x');
    expect(exactSlugLinks).toHaveLength(1);
    expect(exactSlugLinks[0].href).toBe('/tools/ai-image-upscaler');
  });

  it('returns no links for excluded experiment posts', () => {
    for (const slug of [
      'tiktok-profile-picture-ideas',
      'topaz-labs-free-trial',
      'poster-size-dimensions-pixels',
      'best-free-ai-image-upscaler-2026-tested-compared',
    ]) {
      expect(getBlogContextualToolLinks(slug)).toEqual([]);
    }
  });

  it('returns no links for unrelated slugs', () => {
    expect(getBlogContextualToolLinks('how-to-photograph-products')).toEqual([]);
  });

  it('only links to existing routes', () => {
    const toolSlugs = new Set([
      ...loadSlugs('app/seo/data/tools.json'),
      ...loadSlugs('app/seo/data/interactive-tools.json'),
    ]);
    const alternativeSlugs = new Set(loadSlugs('app/seo/data/alternatives.json'));

    const hrefs = ruleCases.flatMap(testCase => testCase.hrefs);
    for (const href of hrefs) {
      if (href.startsWith('/tools/')) {
        expect(toolSlugs.has(href.replace('/tools/', '')), `${href} must exist`).toBe(true);
      } else if (href.startsWith('/alternatives/')) {
        expect(alternativeSlugs.has(href.replace('/alternatives/', '')), `${href} must exist`).toBe(
          true
        );
      } else {
        expect(href, 'homepage fallback').toBe('/');
      }
    }
  });

  it('renders the box on the blog post page', () => {
    const source = readFileSync(join(ROOT, 'app/[locale]/blog/[slug]/page.tsx'), 'utf8');
    expect(source).toContain("from '@lib/seo/blog-tool-links'");
    expect(source).toContain('getBlogContextualToolLinks(slug)');
    expect(source).toContain('Try it');
  });
});
