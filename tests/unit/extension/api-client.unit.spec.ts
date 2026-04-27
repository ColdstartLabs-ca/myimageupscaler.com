/**
 * Extension API Client Tests
 *
 * Tests the extension's API client for upscale and credits endpoints.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// Mock chrome for extension detection
vi.stubGlobal('chrome', { runtime: true });

const { upscaleImage, getCredits } = await import('@extension/shared/api-client');

describe('Extension API Client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('upscaleImage', () => {
    it('sends POST request to /api/upscale with correct headers', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          imageUrl: 'https://example.com/upscaled.png',
          imageData: 'data:image/png;base64,...',
          processing: { creditsUsed: 1, creditsRemaining: 49 },
        }),
      };
      mockFetch.mockResolvedValue(mockResponse);

      const result = await upscaleImage('data:image/png;base64,abc', 'image/png', 'test-token');

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/upscale'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            Authorization: 'Bearer test-token',
          }),
        })
      );
      expect(result.imageUrl).toBe('https://example.com/upscaled.png');
    });

    it('throws on non-ok response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ error: { message: 'Invalid token' } }),
      });

      await expect(
        upscaleImage('data:image/png;base64,abc', 'image/png', 'bad-token')
      ).rejects.toThrow('Invalid token');
    });

    it('handles malformed error response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => ({ error: {} }),
      });

      await expect(upscaleImage('data:image/png;base64,abc', 'image/png', 'token')).rejects.toThrow(
        'HTTP 500: Internal Server Error'
      );
    });

    it('merges default config with provided overrides', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          imageUrl: 'https://example.com/result.png',
          processing: { creditsUsed: 1, creditsRemaining: 49 },
        }),
      });

      await upscaleImage('data:image/png;base64,abc', 'image/png', 'token', {
        scale: 4,
        qualityTier: 'ultra',
      });

      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(callBody.config.scale).toBe(4);
      expect(callBody.config.qualityTier).toBe('ultra');
      // Default options should still be present
      expect(callBody.config.additionalOptions.enhance).toBe(true);
    });
  });

  describe('getCredits', () => {
    it('fetches credits from /api/users/me', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ creditsRemaining: 42 }),
      });

      const credits = await getCredits('test-token');
      expect(credits).toBe(42);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/users/me'),
        expect.objectContaining({
          headers: { Authorization: 'Bearer test-token' },
        })
      );
    });

    it('returns 0 when creditsRemaining is missing', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      const credits = await getCredits('test-token');
      expect(credits).toBe(0);
    });

    it('throws on non-ok response', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        statusText: 'Unauthorized',
      });

      await expect(getCredits('bad-token')).rejects.toThrow('Failed to fetch credits');
    });
  });
});
