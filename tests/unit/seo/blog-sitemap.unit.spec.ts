/**
 * Blog Sitemap Unit Tests
 *
 * Verifies that the blog sitemap:
 * - Uses the hybrid data source (static JSON + Supabase DB)
 * - Excludes BLOCKED_BLOG_SLUGS
 * - Lists URLs as /blog/{slug} (no /en/ prefix)
 * - Includes the /blog listing page entry
 * - Blog post schema uses BlogPosting type
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@shared/config/env', () => ({
  clientEnv: {
    BASE_URL: 'https://myimageupscaler.com',
    APP_NAME: 'MyImageUpscaler',
    PRIMARY_DOMAIN: 'myimageupscaler.com',
    TWITTER_HANDLE: 'myimageupscaler',
  },
  serverEnv: {
    ENV: 'test',
  },
}));

// Mock the hybrid blog service
const mockGetAllPublishedPosts = vi.fn();
vi.mock('@server/services/blog.service', () => ({
  getAllPublishedPosts: () => mockGetAllPublishedPosts(),
}));

const STATIC_POST = {
  slug: 'how-to-upscale-images-without-losing-quality',
  title: 'How to Upscale Images Without Losing Quality',
  description: 'A guide',
  date: '2026-01-31T18:48:29.346Z',
  author: 'MyImageUpscaler Team',
  category: 'Guides',
  tags: ['upscaling'],
  image: undefined,
  readingTime: '5 min read',
};

const DB_POST_1 = {
  slug: 'how-to-convert-png-to-4k',
  title: 'How to Convert PNG to 4K',
  description: 'A database post',
  date: '2026-02-21T22:04:44.125Z',
  author: 'MyImageUpscaler Team',
  category: 'Guides',
  tags: ['upscaling'],
  image: 'https://example.com/image.jpg',
  readingTime: '4 min read',
};

const DB_POST_2 = {
  slug: 'best-free-ai-image-upscaler-2026-tested-compared',
  title: 'Best Free AI Image Upscaler in 2026',
  description: 'Another database post',
  date: '2026-02-17T22:29:35.449Z',
  author: 'MyImageUpscaler Team',
  category: 'Reviews',
  tags: ['upscaling'],
  image: undefined,
  readingTime: '6 min read',
};

const BLOCKED_STATIC_POST = {
  slug: 'anime-upscaling-4k-art-guide',
  title: 'Anime Upscaling Guide',
  description: 'A blocked post',
  date: '2024-11-01T00:00:00.000Z',
  author: 'MyImageUpscaler Team',
  category: 'Guides',
  tags: [],
  image: undefined,
  readingTime: '3 min read',
};

describe('Blog Sitemap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('data source', () => {
    it('calls getAllPublishedPosts from the hybrid service (not static-only)', async () => {
      mockGetAllPublishedPosts.mockResolvedValue([STATIC_POST]);

      const { GET } = await import('@/app/sitemap-blog.xml/route');
      await GET();

      expect(mockGetAllPublishedPosts).toHaveBeenCalledTimes(1);
    });

    it('includes posts from the database that are not in static JSON', async () => {
      mockGetAllPublishedPosts.mockResolvedValue([STATIC_POST, DB_POST_1, DB_POST_2]);

      const { GET } = await import('@/app/sitemap-blog.xml/route');
      const response = await GET();
      const xml = await response.text();

      expect(xml).toContain(`/blog/${DB_POST_1.slug}`);
      expect(xml).toContain(`/blog/${DB_POST_2.slug}`);
    });
  });

  describe('URL format', () => {
    it('lists blog post URLs as /blog/{slug} without locale prefix', async () => {
      mockGetAllPublishedPosts.mockResolvedValue([STATIC_POST, DB_POST_1]);

      const { GET } = await import('@/app/sitemap-blog.xml/route');
      const response = await GET();
      const xml = await response.text();

      expect(xml).toContain('https://myimageupscaler.com/blog/how-to-upscale-images-without-losing-quality');
      expect(xml).toContain('https://myimageupscaler.com/blog/how-to-convert-png-to-4k');
      expect(xml).not.toContain('/en/blog/');
    });

    it('includes the /blog listing page entry', async () => {
      mockGetAllPublishedPosts.mockResolvedValue([]);

      const { GET } = await import('@/app/sitemap-blog.xml/route');
      const response = await GET();
      const xml = await response.text();

      expect(xml).toContain('<loc>https://myimageupscaler.com/blog</loc>');
    });
  });

  describe('BLOCKED_BLOG_SLUGS', () => {
    it('excludes posts whose slugs are in BLOCKED_BLOG_SLUGS', async () => {
      mockGetAllPublishedPosts.mockResolvedValue([STATIC_POST, BLOCKED_STATIC_POST]);

      const { GET } = await import('@/app/sitemap-blog.xml/route');
      const response = await GET();
      const xml = await response.text();

      expect(xml).not.toContain(`/blog/${BLOCKED_STATIC_POST.slug}`);
    });

    it('does not exclude posts that are not in BLOCKED_BLOG_SLUGS', async () => {
      mockGetAllPublishedPosts.mockResolvedValue([STATIC_POST]);

      const { GET } = await import('@/app/sitemap-blog.xml/route');
      const response = await GET();
      const xml = await response.text();

      expect(xml).toContain(`/blog/${STATIC_POST.slug}`);
    });

    it('redirected cannibalization slugs are excluded from sitemap output', async () => {
      const cannibalizedSlugs = [
        'photo-enhancement-upscaling-vs-quality',
        'best-free-ai-image-upscaler-tools-2026',
        'restore-old-photos-online',
      ];

      mockGetAllPublishedPosts.mockResolvedValue(
        cannibalizedSlugs.map(slug => ({ ...STATIC_POST, slug }))
      );

      const { GET } = await import('@/app/sitemap-blog.xml/route');
      const response = await GET();
      const xml = await response.text();

      cannibalizedSlugs.forEach(slug => {
        expect(xml).not.toContain(`/blog/${slug}`);
      });
    });

    it('all known problematic static slugs are excluded from sitemap output', async () => {
      const knownBlockedSlugs = [
        'anime-upscaling-4k-art-guide',
        'dalle-3-image-enhancement-guide',
        'stable-diffusion-upscaling-complete-guide',
      ];

      mockGetAllPublishedPosts.mockResolvedValue(
        knownBlockedSlugs.map(slug => ({ ...STATIC_POST, slug }))
      );

      const { GET } = await import('@/app/sitemap-blog.xml/route');
      const response = await GET();
      const xml = await response.text();

      knownBlockedSlugs.forEach(slug => {
        expect(xml).not.toContain(`/blog/${slug}`);
      });
    });
  });

  describe('hreflang', () => {
    it('must NOT include hreflang links — blog is English-only content', async () => {
      mockGetAllPublishedPosts.mockResolvedValue([STATIC_POST]);

      const { GET } = await import('@/app/sitemap-blog.xml/route');
      const response = await GET();
      const xml = await response.text();

      expect(xml).not.toContain('xhtml:link');
      expect(xml).not.toContain('hreflang');
      expect(xml).not.toContain('xmlns:xhtml');
    });
  });

  describe('image inclusion', () => {
    it('includes image:image tag for posts with images', async () => {
      mockGetAllPublishedPosts.mockResolvedValue([DB_POST_1]);

      const { GET } = await import('@/app/sitemap-blog.xml/route');
      const response = await GET();
      const xml = await response.text();

      expect(xml).toContain('<image:image>');
      expect(xml).toContain(DB_POST_1.image);
    });

    it('omits image:image tag for posts without images', async () => {
      mockGetAllPublishedPosts.mockResolvedValue([STATIC_POST]);

      const { GET } = await import('@/app/sitemap-blog.xml/route');
      const response = await GET();
      const xml = await response.text();

      // Only the blog listing URL entry should exist (no image)
      expect(xml).not.toContain('<image:image>');
    });
  });

  describe('response headers', () => {
    it('returns XML content type', async () => {
      mockGetAllPublishedPosts.mockResolvedValue([]);

      const { GET } = await import('@/app/sitemap-blog.xml/route');
      const response = await GET();

      expect(response.headers.get('Content-Type')).toContain('application/xml');
    });
  });
});

describe('Blog Post Schema', () => {
  it('uses BlogPosting type (not Article)', async () => {
    // Read the source to verify the schema type
    // This is a static assertion — if the type changes, this test fails
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.resolve(
      process.cwd(),
      'app/[locale]/blog/[slug]/page.tsx'
    );
    const content = fs.readFileSync(filePath, 'utf8');

    expect(content).toContain("'@type': 'BlogPosting'");
    expect(content).not.toContain("'@type': 'Article'");
  });

  it('publisher name does not append extra suffix', async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.resolve(
      process.cwd(),
      'app/[locale]/blog/[slug]/page.tsx'
    );
    const content = fs.readFileSync(filePath, 'utf8');

    expect(content).not.toContain('`${clientEnv.APP_NAME} AI`');
    expect(content).toContain('name: clientEnv.APP_NAME');
  });
});
