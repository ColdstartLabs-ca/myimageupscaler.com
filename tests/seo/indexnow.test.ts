/**
 * IndexNow API Integration Tests
 *
 * Tests for IndexNow URL submission functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Create a mutable mock object that we can modify in tests
const mockEnvState = {
  INDEXNOW_KEY: 'test123456789abcdef',
  DOMAIN_NAME: 'myimageupscaler.com',
};

// Mock serverEnv using a getter so changes to mockEnvState are reflected
vi.mock('@shared/config/env', () => ({
  serverEnv: new Proxy(
    {},
    {
      get(_, prop: string) {
        return (mockEnvState as Record<string, string>)[prop];
      },
    }
  ),
}));

// Now import the module under test
import {
  submitUrl,
  submitBatch,
  submitFromCSV,
  getSubmissionStatus,
  generateIndexNowKey,
  validateIndexNowKey,
  getKeyFileContent,
} from '@lib/seo/indexnow';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('IndexNow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to valid key
    mockEnvState.INDEXNOW_KEY = 'test123456789abcdef';
  });

  describe('submitUrl', () => {
    it('should submit a single URL successfully', async () => {
      const mockResponse = { ok: true, status: 200 };
      mockFetch.mockResolvedValueOnce(mockResponse);

      const result = await submitUrl('https://myimageupscaler.com/blog/test-post');

      expect(result.success).toBe(true);
      expect(result.statusCode).toBe(200);
      expect(result.message).toBe('URL submitted successfully');
      expect(result.urlCount).toBe(1);

      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('url=https%3A%2F%2Fmyimageupscaler.com%2Fblog%2Ftest-post'),
        expect.objectContaining({
          method: 'GET',
        })
      );
    });

    it('should handle invalid URL', async () => {
      const result = await submitUrl('not-a-valid-url');

      expect(result.success).toBe(false);
      expect(result.message).toContain('Invalid URL');
    });

    it('should handle missing IndexNow key', async () => {
      mockEnvState.INDEXNOW_KEY = '';

      const result = await submitUrl('https://myimageupscaler.com/blog/test-post');

      expect(result.success).toBe(false);
      expect(result.message).toContain('INDEXNOW_KEY');
    });

    it('should handle API errors', async () => {
      const mockResponse = { ok: false, status: 429, text: async () => 'Rate limited' };
      mockFetch.mockResolvedValueOnce(mockResponse);

      const result = await submitUrl('https://myimageupscaler.com/blog/test-post');

      expect(result.success).toBe(false);
      expect(result.statusCode).toBe(429);
      expect(result.message).toContain('Rate limited');
    });
  });

  describe('submitBatch', () => {
    it('should submit multiple URLs in batches', async () => {
      const urls = [
        'https://myimageupscaler.com/blog/post-1',
        'https://myimageupscaler.com/blog/post-2',
        'https://myimageupscaler.com/blog/post-3',
      ];

      const mockResponse = { ok: true, status: 200 };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await submitBatch(urls, { batchSize: 2 });

      expect(result.success).toBe(true);
      expect(result.urlCount).toBe(3);
      expect(result.message).toContain('Submitted 3/3 URLs');

      // Should have called fetch twice (batch size of 2, then 1)
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should filter out invalid URLs', async () => {
      const urls = [
        'https://myimageupscaler.com/blog/post-1',
        'not-a-valid-url',
        'https://myimageupscaler.com/blog/post-2',
      ];

      const mockResponse = { ok: true, status: 200 };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await submitBatch(urls);

      expect(result.success).toBe(true);
      expect(result.urlCount).toBe(2);
      expect(result.message).toContain('Submitted 2/2');
    });

    it('should handle empty URL array', async () => {
      const result = await submitBatch([]);

      expect(result.success).toBe(false);
      expect(result.message).toContain('non-empty array');
    });

    it('should respect abort signal', async () => {
      const urls = Array.from({ length: 100 }, (_, i) => `https://myimageupscaler.com/page-${i}`);

      const abortController = new AbortController();
      abortController.abort();

      const result = await submitBatch(urls, {
        batchSize: 10,
        signal: abortController.signal,
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('aborted');
    });
  });

  describe('submitFromCSV', () => {
    it('should parse newline-separated URLs from CSV', async () => {
      const csv = `https://myimageupscaler.com/blog/post-1
https://myimageupscaler.com/blog/post-2
https://myimageupscaler.com/blog/post-3`;

      const mockResponse = { ok: true, status: 200 };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await submitFromCSV(csv);

      expect(result.success).toBe(true);
      expect(result.urlCount).toBe(3);
    });

    it('should parse comma-separated URLs from CSV', async () => {
      const csv = 'https://myimageupscaler.com/blog/post-1,https://myimageupscaler.com/blog/post-2';

      const mockResponse = { ok: true, status: 200 };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await submitFromCSV(csv);

      expect(result.success).toBe(true);
      expect(result.urlCount).toBe(2);
    });

    it('should handle empty CSV content', async () => {
      const result = await submitFromCSV('');

      expect(result.success).toBe(false);
      expect(result.message).toContain('No valid URLs found');
    });
  });

  describe('getSubmissionStatus', () => {
    it('should return IndexNow status', async () => {
      const status = await getSubmissionStatus();

      expect(status).toHaveProperty('isEnabled');
      expect(status).toHaveProperty('totalSubmitted');
      expect(status).toHaveProperty('keyLocation');
      expect(status.isEnabled).toBe(true);
      expect(status.totalSubmitted).toBe(0);
    });

    it('should return disabled status when no key configured', async () => {
      mockEnvState.INDEXNOW_KEY = '';

      const status = await getSubmissionStatus();

      expect(status.isEnabled).toBe(false);
      expect(status.keyLocation).toBeUndefined();
    });
  });

  describe('generateIndexNowKey', () => {
    it('should generate a valid key with default length', () => {
      const key = generateIndexNowKey();

      expect(key).toHaveLength(32);
      expect(validateIndexNowKey(key)).toBe(true);
    });

    it('should generate a valid key with custom length', () => {
      const key = generateIndexNowKey(16);

      expect(key).toHaveLength(16);
      expect(validateIndexNowKey(key)).toBe(true);
    });

    it('should only contain valid characters', () => {
      const key = generateIndexNowKey();
      const validChars = /^[a-z0-9-]+$/;

      expect(validChars.test(key)).toBe(true);
    });
  });

  describe('validateIndexNowKey', () => {
    it('should validate correct keys', () => {
      expect(validateIndexNowKey('abc123def456')).toBe(true);
      expect(validateIndexNowKey('a-b-c-1-2-3')).toBe(true);
      expect(validateIndexNowKey('ABCabc123')).toBe(true);
    });

    it('should reject keys that are too short', () => {
      expect(validateIndexNowKey('abc12')).toBe(false);
      expect(validateIndexNowKey('a')).toBe(false);
    });

    it('should reject keys that are too long', () => {
      const longKey = 'a'.repeat(129);
      expect(validateIndexNowKey(longKey)).toBe(false);
    });

    it('should reject keys with invalid characters', () => {
      expect(validateIndexNowKey('abc_123')).toBe(false);
      expect(validateIndexNowKey('abc.123')).toBe(false);
      expect(validateIndexNowKey('abc 123')).toBe(false);
    });
  });

  describe('getKeyFileContent', () => {
    it('should return the key when configured', () => {
      mockEnvState.INDEXNOW_KEY = 'test123456789abcdef';

      const content = getKeyFileContent();

      expect(content).toBe('test123456789abcdef');
    });

    it('should return empty string when not configured', () => {
      mockEnvState.INDEXNOW_KEY = '';

      const content = getKeyFileContent();

      expect(content).toBe('');
    });
  });
});
