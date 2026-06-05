import { describe, expect, it } from 'vitest';
import {
  buildBlogAboutEntities,
  buildBlogBreadcrumbJsonLd,
  buildBlogIndexJsonLd,
  buildBlogItemListJsonLd,
} from '@lib/seo/blog-template-signals';

const ORG = {
  appName: 'MyImageUpscaler',
  baseUrl: 'https://myimageupscaler.com',
};

const POSTS = [
  {
    slug: 'fix-blurry-photos',
    title: 'How to Fix Blurry Photos',
    description: 'A practical guide to repairing blurry photos with AI.',
    date: '2026-06-01',
    image: 'https://example.com/fix-blurry.jpg',
    tags: ['fix blurry photos', 'AI enhancement'],
  },
  {
    slug: 'print-dpi-guide',
    title: 'Image Resolution for Printing',
    description: 'DPI and pixel guidance for better print output.',
    date: '2026-06-02',
    tags: ['print DPI'],
  },
];

describe('blog template SEO signals', () => {
  it('builds Blog JSON-LD for the blog index with article URLs and publisher data', () => {
    const schema = buildBlogIndexJsonLd(POSTS, ORG);

    expect(schema['@type']).toBe('Blog');
    expect(schema.url).toBe('https://myimageupscaler.com/blog');
    expect(schema.publisher.name).toBe('MyImageUpscaler');
    expect(schema.blogPost).toHaveLength(2);
    expect(schema.blogPost[0]).toMatchObject({
      '@type': 'BlogPosting',
      headline: 'How to Fix Blurry Photos',
      url: 'https://myimageupscaler.com/blog/fix-blurry-photos',
      image: 'https://example.com/fix-blurry.jpg',
    });
    expect(schema.blogPost[1].image).toBe('https://myimageupscaler.com/og-image.png');
  });

  it('builds an ordered ItemList for latest blog guides', () => {
    const schema = buildBlogItemListJsonLd(POSTS, ORG);

    expect(schema['@type']).toBe('ItemList');
    expect(schema.itemListElement).toEqual([
      {
        '@type': 'ListItem',
        position: 1,
        url: 'https://myimageupscaler.com/blog/fix-blurry-photos',
        name: 'How to Fix Blurry Photos',
      },
      {
        '@type': 'ListItem',
        position: 2,
        url: 'https://myimageupscaler.com/blog/print-dpi-guide',
        name: 'Image Resolution for Printing',
      },
    ]);
  });

  it('builds BreadcrumbList JSON-LD for blog posts', () => {
    const schema = buildBlogBreadcrumbJsonLd(POSTS[0], ORG);

    expect(schema['@type']).toBe('BreadcrumbList');
    expect(schema.itemListElement.map(item => item.name)).toEqual([
      'Home',
      'Blog',
      'How to Fix Blurry Photos',
    ]);
    expect(schema.itemListElement[2].item).toBe(
      'https://myimageupscaler.com/blog/fix-blurry-photos'
    );
  });

  it('limits article about entities to six topical tags', () => {
    const entities = buildBlogAboutEntities([
      'one',
      'two',
      'three',
      'four',
      'five',
      'six',
      'seven',
    ]);

    expect(entities).toHaveLength(6);
    expect(entities[0]).toEqual({ '@type': 'Thing', name: 'one' });
    expect(entities[5]).toEqual({ '@type': 'Thing', name: 'six' });
  });
});
