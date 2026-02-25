/**
 * Tests for guide page blog linking feature
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'fs';
import { join } from 'path';

const ROOT = join(__dirname, '../../..');

function readJSON<T>(relPath: string): T {
  return JSON.parse(readFileSync(join(ROOT, relPath), 'utf-8')) as T;
}

function readFile(relPath: string): string {
  return readFileSync(join(ROOT, relPath), 'utf-8');
}

const BLOG_DIR = join(ROOT, 'content/blog');
const validBlogSlugs = new Set(
  readdirSync(BLOG_DIR)
    .filter(f => f.endsWith('.mdx'))
    .map(f => f.replace('.mdx', ''))
);

describe('IGuidePage type has relatedBlogPosts field', () => {
  it('pseo-types.ts declares relatedBlogPosts on IGuidePage', () => {
    const source = readFile('lib/seo/pseo-types.ts');
    // Find IGuidePage interface block
    const guidePageMatch = source.match(/interface IGuidePage[\s\S]+?(?=\nexport interface|\nexport type|\n\/\*\*)/);
    expect(guidePageMatch).toBeTruthy();
    expect(guidePageMatch![0]).toContain('relatedBlogPosts');
    expect(guidePageMatch![0]).toContain('relatedBlogPosts?: string[]');
  });
});

describe('GuidePageTemplate renders RelatedBlogPostsSection', () => {
  it('imports RelatedBlogPostsSection', () => {
    const source = readFile(
      'app/(pseo)/_components/pseo/templates/GuidePageTemplate.tsx'
    );
    expect(source).toContain('RelatedBlogPostsSection');
    expect(source).toContain("from '../sections/RelatedBlogPostsSection'");
  });

  it('renders RelatedBlogPostsSection when relatedBlogPosts is present', () => {
    const source = readFile(
      'app/(pseo)/_components/pseo/templates/GuidePageTemplate.tsx'
    );
    expect(source).toContain('data.relatedBlogPosts');
    expect(source).toContain('<RelatedBlogPostsSection');
    expect(source).toContain('blogPostSlugs={data.relatedBlogPosts}');
  });
});

describe('guides.json has relatedBlogPosts populated', () => {
  const guidesData = readJSON<{ pages: Array<{ slug: string; relatedBlogPosts?: string[] }> }>(
    'app/seo/data/guides.json'
  );

  it('how-to-upscale-images guide has relatedBlogPosts', () => {
    const guide = guidesData.pages.find(p => p.slug === 'how-to-upscale-images');
    expect(guide).toBeDefined();
    expect(guide!.relatedBlogPosts).toBeDefined();
    expect(guide!.relatedBlogPosts!.length).toBeGreaterThan(0);
  });

  it('all blog slugs in guides.json resolve to real posts', () => {
    const allSlugs: string[] = [];
    for (const page of guidesData.pages) {
      if (page.relatedBlogPosts) {
        allSlugs.push(...page.relatedBlogPosts);
      }
    }

    for (const slug of allSlugs) {
      expect(
        validBlogSlugs.has(slug),
        `Blog slug "${slug}" in guides.json does not match any content/blog/*.mdx file`
      ).toBe(true);
    }
  });

  it('blog slugs are strings (not objects)', () => {
    for (const page of guidesData.pages) {
      if (page.relatedBlogPosts) {
        for (const slug of page.relatedBlogPosts) {
          expect(typeof slug).toBe('string');
        }
      }
    }
  });
});
