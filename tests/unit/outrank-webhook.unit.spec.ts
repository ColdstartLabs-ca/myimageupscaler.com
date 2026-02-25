import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  outrankWebhookPayloadSchema,
  mapOutrankArticleToBlogInput,
} from '@shared/validation/outrank-webhook.schema';

// ---------------------------------------------------------------------------
// Shared fixture helpers
// ---------------------------------------------------------------------------

/** Minimal valid content_html that satisfies blog.schema content min (100 chars) */
const VALID_CONTENT_HTML =
  '<p>This is a detailed article about image upscaling techniques and best practices for photographers and designers who want high quality results.</p>';

/** A valid Outrank article object satisfying all outrankArticleSchema constraints */
function makeArticle(overrides: Record<string, unknown> = {}) {
  return {
    id: 'article-001',
    title: 'How to Upscale Images Like a Pro',
    content_html: VALID_CONTENT_HTML,
    meta_description: 'Learn the best techniques to upscale images without losing quality.',
    created_at: '2026-02-24T12:00:00Z',
    image_url: 'https://cdn.example.com/images/hero.jpg',
    slug: 'how-to-upscale-images-like-a-pro',
    tags: ['upscaling', 'photography', 'tutorial'],
    ...overrides,
  };
}

/** A valid full webhook payload */
function makePayload(articleOverrides: Record<string, unknown> = {}) {
  return {
    event_type: 'publish_articles',
    timestamp: '2026-02-24T12:00:00Z',
    data: {
      articles: [makeArticle(articleOverrides)],
    },
  };
}

// ---------------------------------------------------------------------------
// Schema validation
// ---------------------------------------------------------------------------

describe('outrankWebhookPayloadSchema', () => {
  it('should validate a valid Outrank payload', () => {
    const result = outrankWebhookPayloadSchema.safeParse(makePayload());
    expect(result.success).toBe(true);
  });

  it('should reject payload with missing articles array', () => {
    const result = outrankWebhookPayloadSchema.safeParse({
      event_type: 'publish_articles',
      data: {},
    });
    expect(result.success).toBe(false);
  });

  it('should reject payload with an empty articles array', () => {
    const result = outrankWebhookPayloadSchema.safeParse({
      event_type: 'publish_articles',
      data: { articles: [] },
    });
    expect(result.success).toBe(false);
  });

  it('should reject payload with wrong event_type', () => {
    const result = outrankWebhookPayloadSchema.safeParse({
      ...makePayload(),
      event_type: 'update_articles',
    });
    expect(result.success).toBe(false);
  });

  it('should accept payload without optional timestamp', () => {
    const { timestamp: _ts, ...payloadWithoutTimestamp } = makePayload();
    const result = outrankWebhookPayloadSchema.safeParse(payloadWithoutTimestamp);
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Slug sanitization
// ---------------------------------------------------------------------------

describe('mapOutrankArticleToBlogInput — slug sanitization', () => {
  it('should sanitize slug with special characters', () => {
    const article = makeArticle({ slug: 'My Article Title!' });
    const result = mapOutrankArticleToBlogInput(
      article as Parameters<typeof mapOutrankArticleToBlogInput>[0]
    );
    expect(result.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
  });

  it('should not have leading or trailing hyphens in sanitized slug', () => {
    const article = makeArticle({ slug: '---leading-and-trailing---' });
    const result = mapOutrankArticleToBlogInput(
      article as Parameters<typeof mapOutrankArticleToBlogInput>[0]
    );
    expect(result.slug).not.toMatch(/^-/);
    expect(result.slug).not.toMatch(/-$/);
  });

  it('should collapse consecutive special characters into a single hyphen', () => {
    const article = makeArticle({ slug: 'hello---world!!!' });
    const result = mapOutrankArticleToBlogInput(
      article as Parameters<typeof mapOutrankArticleToBlogInput>[0]
    );
    expect(result.slug).toBe('hello-world');
  });

  it('should truncate slug to at most 100 characters', () => {
    const longSlug = 'a'.repeat(150);
    const article = makeArticle({ slug: longSlug });
    const result = mapOutrankArticleToBlogInput(
      article as Parameters<typeof mapOutrankArticleToBlogInput>[0]
    );
    expect(result.slug.length).toBeLessThanOrEqual(100);
  });
});

// ---------------------------------------------------------------------------
// SEO field truncation
// ---------------------------------------------------------------------------

describe('mapOutrankArticleToBlogInput — SEO field truncation', () => {
  it('should truncate seo_title to 70 chars when title is longer', () => {
    const longTitle = 'A'.repeat(100);
    const article = makeArticle({ title: longTitle });
    const result = mapOutrankArticleToBlogInput(
      article as Parameters<typeof mapOutrankArticleToBlogInput>[0]
    );
    expect(result.seo_title).toBeDefined();
    expect(result.seo_title!.length).toBeLessThanOrEqual(70);
  });

  it('should truncate seo_description to 160 chars when meta_description is longer', () => {
    const longMeta = 'B'.repeat(200);
    const article = makeArticle({ meta_description: longMeta });
    const result = mapOutrankArticleToBlogInput(
      article as Parameters<typeof mapOutrankArticleToBlogInput>[0]
    );
    expect(result.seo_description).toBeDefined();
    expect(result.seo_description!.length).toBeLessThanOrEqual(160);
  });

  it('should leave seo_description undefined when meta_description is absent', () => {
    const article = makeArticle({ meta_description: undefined });
    const result = mapOutrankArticleToBlogInput(
      article as Parameters<typeof mapOutrankArticleToBlogInput>[0]
    );
    expect(result.seo_description).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Content selection
// ---------------------------------------------------------------------------

describe('mapOutrankArticleToBlogInput — content selection', () => {
  it('should use content_html over content_markdown when both are present', () => {
    const article = makeArticle({
      content_html: VALID_CONTENT_HTML,
      content_markdown: '# Markdown version that should not be used',
    });
    const result = mapOutrankArticleToBlogInput(
      article as Parameters<typeof mapOutrankArticleToBlogInput>[0]
    );
    expect(result.content).toBe(VALID_CONTENT_HTML);
  });
});

// ---------------------------------------------------------------------------
// Description generation
// ---------------------------------------------------------------------------

describe('mapOutrankArticleToBlogInput — description generation', () => {
  it('should generate description from meta_description when present', () => {
    const meta = 'Learn the best techniques to upscale images without losing quality.';
    const article = makeArticle({ meta_description: meta });
    const result = mapOutrankArticleToBlogInput(
      article as Parameters<typeof mapOutrankArticleToBlogInput>[0]
    );
    expect(result.description).toBe(meta);
  });

  it('should generate description from stripped HTML content when meta_description is absent', () => {
    const article = makeArticle({ meta_description: undefined });
    const result = mapOutrankArticleToBlogInput(
      article as Parameters<typeof mapOutrankArticleToBlogInput>[0]
    );
    // Should not contain any HTML tags
    expect(result.description).not.toMatch(/<[^>]*>/);
    // Should be derived from the content
    expect(result.description.length).toBeGreaterThan(0);
  });

  it('should clamp description to at most 500 chars', () => {
    const longMeta = 'D'.repeat(600);
    const article = makeArticle({ meta_description: longMeta });
    const result = mapOutrankArticleToBlogInput(
      article as Parameters<typeof mapOutrankArticleToBlogInput>[0]
    );
    expect(result.description.length).toBeLessThanOrEqual(500);
  });
});

// ---------------------------------------------------------------------------
// Image URL handling
// ---------------------------------------------------------------------------

describe('mapOutrankArticleToBlogInput — image URL handling', () => {
  it('should set featured_image_url to undefined when image_url is an empty string', () => {
    const article = makeArticle({ image_url: '' });
    const result = mapOutrankArticleToBlogInput(
      article as Parameters<typeof mapOutrankArticleToBlogInput>[0]
    );
    expect(result.featured_image_url).toBeUndefined();
  });

  it('should map a valid https image_url to featured_image_url', () => {
    const imageUrl = 'https://cdn.example.com/images/hero.jpg';
    const article = makeArticle({ image_url: imageUrl });
    const result = mapOutrankArticleToBlogInput(
      article as Parameters<typeof mapOutrankArticleToBlogInput>[0]
    );
    expect(result.featured_image_url).toBe(imageUrl);
  });

  it('should set featured_image_url to undefined when image_url is absent', () => {
    const article = makeArticle({ image_url: undefined });
    const result = mapOutrankArticleToBlogInput(
      article as Parameters<typeof mapOutrankArticleToBlogInput>[0]
    );
    expect(result.featured_image_url).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Static field mapping
// ---------------------------------------------------------------------------

describe('mapOutrankArticleToBlogInput — static field mapping', () => {
  it('should always set author to MyImageUpscaler Team', () => {
    const result = mapOutrankArticleToBlogInput(
      makeArticle() as Parameters<typeof mapOutrankArticleToBlogInput>[0]
    );
    expect(result.author).toBe('MyImageUpscaler Team');
  });

  it('should always set category to blog', () => {
    const result = mapOutrankArticleToBlogInput(
      makeArticle() as Parameters<typeof mapOutrankArticleToBlogInput>[0]
    );
    expect(result.category).toBe('blog');
  });

  it('should limit tags to at most 10', () => {
    const manyTags = Array.from({ length: 15 }, (_, i) => `tag-${i}`);
    const article = makeArticle({ tags: manyTags });
    const result = mapOutrankArticleToBlogInput(
      article as Parameters<typeof mapOutrankArticleToBlogInput>[0]
    );
    expect(result.tags.length).toBeLessThanOrEqual(10);
  });

  it('should default tags to empty array when absent', () => {
    // outrankArticleSchema defaults tags to [], so omit from raw object
    const rawArticle = {
      id: 'article-002',
      title: 'Default Tags Test Article',
      content_html: VALID_CONTENT_HTML,
      slug: 'default-tags-test',
    };
    // Parse through schema to get default tags applied
    const parsed = outrankWebhookPayloadSchema.parse({
      event_type: 'publish_articles',
      data: { articles: [rawArticle] },
    }).data.articles[0];
    const result = mapOutrankArticleToBlogInput(parsed);
    expect(result.tags).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// POST /api/webhooks/outrank route handler
// ---------------------------------------------------------------------------
//
// Mock strategy: use a module-level variable with a getter so individual tests
// can change the secret without resetting modules (same pattern as Stripe tests).

import { NextRequest } from 'next/server';
import { POST as outrankPOST } from '@/app/api/webhooks/outrank/route';
import * as blogService from '@server/services/blog.service';

let mockOutrankSecret = 'test-secret';

vi.mock('@shared/config/env', () => ({
  get serverEnv() {
    return {
      OUTRANK_WEBHOOK_SECRET: mockOutrankSecret,
      BASELIME_API_KEY: '',
      ENV: 'test',
    };
  },
  isDevelopment: () => false,
}));

vi.mock('@server/services/blog.service', () => ({
  createBlogPost: vi.fn(),
  publishBlogPost: vi.fn(),
  slugExists: vi.fn(),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

vi.mock('@server/monitoring/logger', () => ({
  createLogger: vi.fn(() => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
  })),
}));

// Helper to build a NextRequest for the outrank webhook endpoint
function makeOutrankRequest(body: unknown, token = 'test-secret') {
  return new NextRequest('http://localhost/api/webhooks/outrank', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
}

const validOutrankPayload = {
  event_type: 'publish_articles',
  timestamp: '2026-02-24T12:00:00Z',
  data: {
    articles: [
      {
        id: 'test-123',
        title: 'Test Article from Outrank That Has A Long Enough Title',
        content_html:
          '<p>This is a test article with enough content to pass the minimum 100 character validation requirement.</p>',
        meta_description:
          'A test article with a valid description that meets the minimum length requirement.',
        slug: 'test-article-from-outrank',
        tags: ['test'],
      },
    ],
  },
};

describe('POST /api/webhooks/outrank route handler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockOutrankSecret = 'test-secret';

    // Default behaviour: slug does not exist, create/publish succeed
    vi.mocked(blogService.slugExists).mockResolvedValue(false);
     
    vi.mocked(blogService.createBlogPost).mockResolvedValue({
      slug: 'test-article-from-outrank',
    } as any);
     
    vi.mocked(blogService.publishBlogPost).mockResolvedValue({
      slug: 'test-article-from-outrank',
    } as any);
  });

  it('should return 401 when no Authorization header', async () => {
    const request = new NextRequest('http://localhost/api/webhooks/outrank', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validOutrankPayload),
    });

    const response = await outrankPOST(request);

    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.message).toBe('Unauthorized');
  });

  it('should return 401 when Bearer token is wrong', async () => {
    const request = makeOutrankRequest(validOutrankPayload, 'wrong-token');
    const response = await outrankPOST(request);

    expect(response.status).toBe(401);
    const json = await response.json();
    expect(json.message).toBe('Unauthorized');
  });

  it('should return 503 when OUTRANK_WEBHOOK_SECRET is not configured (empty string)', async () => {
    mockOutrankSecret = '';
    const request = makeOutrankRequest(validOutrankPayload);
    const response = await outrankPOST(request);

    expect(response.status).toBe(503);
    const json = await response.json();
    expect(json.message).toBe('Webhook not configured');
  });

  it('should return 400 for invalid payload (wrong event_type)', async () => {
    const invalidPayload = { ...validOutrankPayload, event_type: 'update_articles' };
    const request = makeOutrankRequest(invalidPayload);
    const response = await outrankPOST(request);

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.message).toBe('Invalid payload');
    expect(json.errors).toBeDefined();
  });

  it('should create and publish a valid article', async () => {
    const request = makeOutrankRequest(validOutrankPayload);
    const response = await outrankPOST(request);

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.processed).toContain('test-article-from-outrank');
    expect(json.skipped).toHaveLength(0);
    expect(json.errors).toHaveLength(0);

    expect(blogService.createBlogPost).toHaveBeenCalledOnce();
    expect(blogService.publishBlogPost).toHaveBeenCalledWith('test-article-from-outrank');
  });

  it('should skip article when slug already exists', async () => {
    vi.mocked(blogService.slugExists).mockResolvedValue(true);

    const request = makeOutrankRequest(validOutrankPayload);
    const response = await outrankPOST(request);

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.skipped).toContain('test-article-from-outrank');
    expect(json.processed).toHaveLength(0);
    expect(blogService.createBlogPost).not.toHaveBeenCalled();
  });

  it('should handle multiple articles in one payload', async () => {
    const twoArticlePayload = {
      ...validOutrankPayload,
      data: {
        articles: [
          validOutrankPayload.data.articles[0],
          {
            id: 'test-456',
            title: 'Second Test Article from Outrank With Long Enough Title',
            content_html:
              '<p>This is the second test article with enough content to pass the minimum 100 character validation requirement.</p>',
            meta_description:
              'Second test article with a valid description meeting minimum length.',
            slug: 'second-test-article-from-outrank',
            tags: ['test', 'second'],
          },
        ],
      },
    };

    const request = makeOutrankRequest(twoArticlePayload);
    const response = await outrankPOST(request);

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.processed).toHaveLength(2);
    expect(json.processed).toContain('test-article-from-outrank');
    expect(json.processed).toContain('second-test-article-from-outrank');
    expect(blogService.createBlogPost).toHaveBeenCalledTimes(2);
    expect(blogService.publishBlogPost).toHaveBeenCalledTimes(2);
  });

  it('should continue processing other articles if one createBlogPost fails', async () => {
    const twoArticlePayload = {
      ...validOutrankPayload,
      data: {
        articles: [
          validOutrankPayload.data.articles[0],
          {
            id: 'test-789',
            title: 'Third Test Article from Outrank With Long Enough Title',
            content_html:
              '<p>This is the third test article with enough content to pass the minimum 100 character validation requirement.</p>',
            meta_description: 'Third test article with a valid description meeting minimum length.',
            slug: 'third-test-article-from-outrank',
            tags: ['test'],
          },
        ],
      },
    };

    // First article fails to create, second should still be processed
    vi.mocked(blogService.createBlogPost)
      .mockRejectedValueOnce(new Error('Database connection error'))
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .mockResolvedValueOnce({ slug: 'third-test-article-from-outrank' } as any);

    const request = makeOutrankRequest(twoArticlePayload);
    const response = await outrankPOST(request);

    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.success).toBe(true);
    expect(json.errors).toContain('test-article-from-outrank');
    expect(json.processed).toContain('third-test-article-from-outrank');
    expect(json.processed).toHaveLength(1);
    expect(json.errors).toHaveLength(1);
  });
});
