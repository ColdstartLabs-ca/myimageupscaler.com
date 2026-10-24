import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { updateBlogPost, getBlogPostBySlug, loadAutoSeoLocks } = vi.hoisted(() => ({
  updateBlogPost: vi.fn(),
  getBlogPostBySlug: vi.fn(),
  loadAutoSeoLocks: vi.fn(),
}));
vi.mock('@server/services/seo-lock.service', () => ({ loadAutoSeoLocks }));

vi.mock('@/content/seo-lock.json', () => ({
  default: {
    '/blog/locked-post': {
      title: 'Locked search title for the article | MyImageUpscaler',
      description:
        'Approved metadata description for this locked article, with enough detail about image upscaling to satisfy the search snippet validation rules.',
      h1: 'Locked title',
      introHash: 'a'.repeat(64),
      canonical: 'https://myimageupscaler.com/blog/locked-post',
      robots: 'index, follow',
      hreflang: ['en=https://myimageupscaler.com/blog/locked-post'],
      jsonLdTypes: ['BlogPosting'],
      source: 'db',
      clicks28d: 21,
    },
  },
}));

vi.mock('@lib/middleware/blogApiAuth', () => ({
  verifyBlogApiAuth: vi.fn().mockResolvedValue({ authenticated: true }),
  blogApiErrorResponse: (code: string, message: string, status: number) =>
    new Response(JSON.stringify({ success: false, error: { code, message } }), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
}));

vi.mock('@server/services/blog.service', () => ({
  getBlogPostBySlug,
  updateBlogPost,
  deleteBlogPost: vi.fn(),
}));

vi.mock('@lib/blog/revalidate-blog-paths', () => ({
  revalidateBlogPaths: vi.fn(),
}));

vi.mock('@server/monitoring/logger', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock('@shared/config/env', () => ({
  serverEnv: { BLOG_API_KEY: 'test-key' },
  clientEnv: { APP_NAME: 'MyImageUpscaler' },
}));

import { PATCH } from '@/app/api/blog/posts/[slug]/route';

const params = (slug: string) => ({ params: Promise.resolve({ slug }) });

function request(slug: string, body: Record<string, unknown>): NextRequest {
  return new NextRequest(`http://localhost/api/blog/posts/${slug}`, {
    method: 'PATCH',
    headers: { 'x-api-key': 'test-key', 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('blog PATCH SEO lock gate', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadAutoSeoLocks.mockResolvedValue({});
    updateBlogPost.mockResolvedValue({ id: '1', slug: 'post', title: 'Updated' });
    getBlogPostBySlug.mockResolvedValue({
      title: 'Locked title',
      description: 'Original introduction for the article.',
      seo_title: 'Locked search title for the article',
      seo_description:
        'Approved metadata description for this locked article, with enough detail about image upscaling to satisfy the search snippet validation rules.',
    });
  });

  it('returns 409 when a locked title changes', async () => {
    const response = await PATCH(
      request('locked-post', { title: 'Changed title' }),
      params('locked-post')
    );

    expect(response.status).toBe(409);
    expect(updateBlogPost).not.toHaveBeenCalled();
  });

  it('rejects changes to an auto-added localized lock', async () => {
    loadAutoSeoLocks.mockResolvedValue({ '/es/blog/auto-winner': { h1: 'Approved heading' } });
    const response = await PATCH(
      request('auto-winner', { title: 'Changed heading' }),
      params('auto-winner')
    );
    expect(response.status).toBe(409);
    expect(loadAutoSeoLocks).toHaveBeenCalledWith(
      expect.arrayContaining(['/blog/auto-winner', '/es/blog/auto-winner'])
    );
    expect(updateBlogPost).not.toHaveBeenCalled();
  });

  it('fails closed when auto locks cannot be read', async () => {
    loadAutoSeoLocks.mockRejectedValue(new Error('table unavailable'));
    const response = await PATCH(
      request('auto-winner', { title: 'Changed heading' }),
      params('auto-winner')
    );
    expect(response.status).toBe(500);
    expect(updateBlogPost).not.toHaveBeenCalled();
  });

  it('allows a locked title when it matches the deployed lock', async () => {
    const response = await PATCH(
      request('locked-post', { title: 'Locked title' }),
      params('locked-post')
    );

    expect(response.status).toBe(200);
    expect(updateBlogPost).toHaveBeenCalledWith('locked-post', { title: 'Locked title' });
  });

  it('keeps unlocked slugs working', async () => {
    const response = await PATCH(
      request('unlocked-post', { title: 'New title' }),
      params('unlocked-post')
    );

    expect(response.status).toBe(200);
    expect(updateBlogPost).toHaveBeenCalledWith('unlocked-post', { title: 'New title' });
  });

  it('allows the approved SEO title with the layout brand suffix', async () => {
    const response = await PATCH(
      request('locked-post', { seo_title: 'Locked search title for the article' }),
      params('locked-post')
    );
    expect(response.status).toBe(200);
  });

  it('rejects an intro change even when it equals the locked metadata description', async () => {
    const response = await PATCH(
      request('locked-post', {
        description:
          'Approved metadata description for this locked article, with enough detail about image upscaling to satisfy the search snippet validation rules.',
      }),
      params('locked-post')
    );
    expect(response.status).toBe(409);
    expect(updateBlogPost).not.toHaveBeenCalled();
  });
});
