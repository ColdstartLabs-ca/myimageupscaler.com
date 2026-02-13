import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest, NextResponse } from 'next/server';
import { GET } from '@app/api/blog/images/route';
import { searchBlogImages } from '@server/services/blogImageStorage.service';
import { verifyBlogApiAuth, blogApiErrorResponse } from '@lib/middleware/blogApiAuth';
import type { IBlogImageMetadataWithDb } from '@shared/validation/blog.schema';

/**
 * Unit tests for Blog Image Search API Endpoint
 *
 * Tests the GET /api/blog/images endpoint for searching blog images
 * by tags and/or image type with authentication and validation.
 */

// Mock the searchBlogImages service function
vi.mock('@server/services/blogImageStorage.service', () => ({
  searchBlogImages: vi.fn(),
}));

// Mock the blog API auth middleware
vi.mock('@lib/middleware/blogApiAuth', () => ({
  verifyBlogApiAuth: vi.fn(),
  blogApiErrorResponse: vi.fn((code: string, message: string, status: number) => {
    return NextResponse.json(
      {
        success: false,
        error: { code, message },
      },
      { status }
    );
  }),
}));

// Helper to create a mock NextRequest
function createMockRequest(url: string, apiKey?: string): NextRequest {
  const headers = new Headers();
  if (apiKey) {
    headers.set('x-api-key', apiKey);
  }
  const fullUrl = new URL(url, 'http://localhost:3000');
  return new NextRequest(fullUrl, {
    method: 'GET',
    headers,
  });
}

// Helper to create mock image metadata
function createMockImageMetadata(
  overrides: Partial<IBlogImageMetadataWithDb> = {}
): IBlogImageMetadataWithDb {
  return {
    id: '123e4567-e89b-12d3-a456-426614174000',
    url: 'https://example.supabase.co/storage/v1/object/public/blog-images/2026/02/test-image.webp',
    storage_path: '2026/02/test-image.webp',
    alt_text: 'A test image showing before and after comparison',
    tags: ['before-after', 'comparison', 'upscaling'],
    description: 'Split screen comparison of image quality before and after upscaling',
    image_type: 'inline',
    width: 800,
    height: 600,
    prompt: 'Split screen: pixelated photo left, crystal clear right',
    used_in_posts: ['how-to-upscale-images'],
    created_at: '2026-02-12T10:00:00Z',
    ...overrides,
  };
}

describe('Blog Image Search API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('Authentication', () => {
    test('should require api key auth', async () => {
      // Mock auth failure
      vi.mocked(verifyBlogApiAuth).mockResolvedValueOnce({
        authenticated: false,
        error: blogApiErrorResponse('UNAUTHORIZED', 'API key required', 401),
      });

      const request = createMockRequest('/api/blog/images');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.success).toBe(false);
      expect(data.error.code).toBe('UNAUTHORIZED');
    });

    test('should reject invalid API key', async () => {
      vi.mocked(verifyBlogApiAuth).mockResolvedValueOnce({
        authenticated: false,
        error: blogApiErrorResponse('UNAUTHORIZED', 'Invalid API key', 401),
      });

      const request = createMockRequest('/api/blog/images', 'invalid-key');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(401);
      expect(data.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('Search functionality', () => {
    test('should return images matching tags', async () => {
      // Mock successful auth
      vi.mocked(verifyBlogApiAuth).mockResolvedValueOnce({
        authenticated: true,
        apiKeyId: 'blog-ai-agent',
      });

      // Mock search results
      const mockImages = [
        createMockImageMetadata({ tags: ['before-after', 'comparison'] }),
        createMockImageMetadata({
          id: '123e4567-e89b-12d3-a456-426614174001',
          tags: ['before-after', 'ai-processing'],
        }),
      ];
      vi.mocked(searchBlogImages).mockResolvedValueOnce({ data: mockImages, total: 5 });

      const request = createMockRequest(
        '/api/blog/images?tags=before-after,comparison',
        'valid-api-key'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(2);
      expect(data.data[0].tags).toContain('before-after');
      expect(data.data[0].url).toBeDefined();
      expect(data.data[0].alt_text).toBeDefined();

      // Verify the service was called with correct params
      expect(searchBlogImages).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: ['before-after', 'comparison'],
        })
      );
    });

    test('should filter by image_type', async () => {
      vi.mocked(verifyBlogApiAuth).mockResolvedValueOnce({
        authenticated: true,
        apiKeyId: 'blog-ai-agent',
      });

      // Mock search results - only featured images
      const mockImages = [
        createMockImageMetadata({
          image_type: 'featured',
          width: 1200,
          height: 630,
        }),
      ];
      vi.mocked(searchBlogImages).mockResolvedValueOnce({ data: mockImages, total: 1 });

      const request = createMockRequest('/api/blog/images?image_type=featured', 'valid-api-key');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(1);
      expect(data.data[0].image_type).toBe('featured');

      // Verify the service was called with correct params
      expect(searchBlogImages).toHaveBeenCalledWith(
        expect.objectContaining({
          image_type: 'featured',
        })
      );
    });

    test('should combine tags and image_type filters', async () => {
      vi.mocked(verifyBlogApiAuth).mockResolvedValueOnce({
        authenticated: true,
        apiKeyId: 'blog-ai-agent',
      });

      const mockImages = [
        createMockImageMetadata({
          image_type: 'inline',
          tags: ['before-after', 'comparison'],
        }),
      ];
      vi.mocked(searchBlogImages).mockResolvedValueOnce({ data: mockImages, total: 1 });

      const request = createMockRequest(
        '/api/blog/images?tags=before-after&image_type=inline',
        'valid-api-key'
      );
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);

      // Verify both filters were passed to the service
      expect(searchBlogImages).toHaveBeenCalledWith(
        expect.objectContaining({
          tags: ['before-after'],
          image_type: 'inline',
        })
      );
    });

    test('should return empty array when no images match', async () => {
      vi.mocked(verifyBlogApiAuth).mockResolvedValueOnce({
        authenticated: true,
        apiKeyId: 'blog-ai-agent',
      });

      vi.mocked(searchBlogImages).mockResolvedValueOnce({ data: [], total: 0 });

      const request = createMockRequest('/api/blog/images?tags=nonexistent-tag', 'valid-api-key');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.success).toBe(true);
      expect(data.data).toHaveLength(0);
    });
  });

  describe('Pagination', () => {
    test('should use default limit and offset values', async () => {
      vi.mocked(verifyBlogApiAuth).mockResolvedValueOnce({
        authenticated: true,
        apiKeyId: 'blog-ai-agent',
      });

      vi.mocked(searchBlogImages).mockResolvedValueOnce({ data: [], total: 0 });

      const request = createMockRequest('/api/blog/images', 'valid-api-key');
      await GET(request);

      expect(searchBlogImages).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 10,
          offset: 0,
        })
      );
    });

    test('should accept custom limit and offset', async () => {
      vi.mocked(verifyBlogApiAuth).mockResolvedValueOnce({
        authenticated: true,
        apiKeyId: 'blog-ai-agent',
      });

      vi.mocked(searchBlogImages).mockResolvedValueOnce({ data: [], total: 0 });

      const request = createMockRequest('/api/blog/images?limit=5&offset=10', 'valid-api-key');
      await GET(request);

      expect(searchBlogImages).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 5,
          offset: 10,
        })
      );
    });

    test('should return pagination metadata in response', async () => {
      vi.mocked(verifyBlogApiAuth).mockResolvedValueOnce({
        authenticated: true,
        apiKeyId: 'blog-ai-agent',
      });

      const mockImages = [createMockImageMetadata()];
      vi.mocked(searchBlogImages).mockResolvedValueOnce({ data: mockImages, total: 25 });

      const request = createMockRequest('/api/blog/images?limit=5&offset=10', 'valid-api-key');
      const response = await GET(request);
      const data = await response.json();

      expect(data.pagination).toEqual({
        total: 25,
        limit: 5,
        offset: 10,
        hasMore: true,
      });
    });
  });

  describe('Validation', () => {
    test('should reject invalid image_type', async () => {
      vi.mocked(verifyBlogApiAuth).mockResolvedValueOnce({
        authenticated: true,
        apiKeyId: 'blog-ai-agent',
      });

      const request = createMockRequest('/api/blog/images?image_type=banner', 'valid-api-key');
      const response = await GET(request);

      // The Zod validation should reject 'banner' as an invalid image_type
      expect(response.status).toBe(400);
    });

    test('should reject limit above maximum', async () => {
      vi.mocked(verifyBlogApiAuth).mockResolvedValueOnce({
        authenticated: true,
        apiKeyId: 'blog-ai-agent',
      });

      const request = createMockRequest('/api/blog/images?limit=200', 'valid-api-key');
      const response = await GET(request);

      expect(response.status).toBe(400);
    });

    test('should reject negative offset', async () => {
      vi.mocked(verifyBlogApiAuth).mockResolvedValueOnce({
        authenticated: true,
        apiKeyId: 'blog-ai-agent',
      });

      const request = createMockRequest('/api/blog/images?offset=-5', 'valid-api-key');
      const response = await GET(request);

      expect(response.status).toBe(400);
    });

    test('should reject limit below minimum', async () => {
      vi.mocked(verifyBlogApiAuth).mockResolvedValueOnce({
        authenticated: true,
        apiKeyId: 'blog-ai-agent',
      });

      const request = createMockRequest('/api/blog/images?limit=0', 'valid-api-key');
      const response = await GET(request);

      expect(response.status).toBe(400);
    });
  });

  describe('Response format', () => {
    test('should exclude storage_path and used_in_posts from response', async () => {
      vi.mocked(verifyBlogApiAuth).mockResolvedValueOnce({
        authenticated: true,
        apiKeyId: 'blog-ai-agent',
      });

      vi.mocked(searchBlogImages).mockResolvedValueOnce({
        data: [createMockImageMetadata()],
        total: 1,
      });

      const request = createMockRequest('/api/blog/images', 'valid-api-key');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data.data[0]).not.toHaveProperty('storage_path');
      expect(data.data[0]).not.toHaveProperty('used_in_posts');
      expect(data.data[0]).not.toHaveProperty('id');
      // description IS included for reuse decisions
      expect(data.data[0]).toHaveProperty('description');
    });

    test('should include all required fields in response', async () => {
      vi.mocked(verifyBlogApiAuth).mockResolvedValueOnce({
        authenticated: true,
        apiKeyId: 'blog-ai-agent',
      });

      vi.mocked(searchBlogImages).mockResolvedValueOnce({
        data: [createMockImageMetadata()],
        total: 1,
      });

      const request = createMockRequest('/api/blog/images', 'valid-api-key');
      const response = await GET(request);
      const data = await response.json();

      const imageItem = data.data[0];
      expect(imageItem).toHaveProperty('url');
      expect(imageItem).toHaveProperty('alt_text');
      expect(imageItem).toHaveProperty('description');
      expect(imageItem).toHaveProperty('tags');
      expect(imageItem).toHaveProperty('image_type');
      expect(imageItem).toHaveProperty('width');
      expect(imageItem).toHaveProperty('height');
      expect(imageItem).toHaveProperty('prompt');
      expect(imageItem).toHaveProperty('created_at');
    });
  });
});
