import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { updateBlogPost } = vi.hoisted(() => ({ updateBlogPost: vi.fn() }));

vi.mock('@/content/seo-lock.json', () => ({
  default: {
    '/blog/locked-post': {
      title: 'Locked title',
      description: 'Locked description',
      h1: 'Locked heading',
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
  getBlogPostBySlug: vi.fn(),
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

vi.mock('@shared/config/env', () => ({ serverEnv: { BLOG_API_KEY: 'test-key' } }));

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
    updateBlogPost.mockResolvedValue({ id: '1', slug: 'post', title: 'Updated' });
  });

  it('returns 409 when a locked title changes', async () => {
    const response = await PATCH(
      request('locked-post', { title: 'Changed title' }),
      params('locked-post')
    );

    expect(response.status).toBe(409);
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
});
