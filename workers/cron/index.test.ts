/**
 * Unit Tests: Cloudflare Cron Worker
 *
 * Tests for the worker that routes cron triggers to API endpoints.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import worker from './index';
import type { IEnv } from './index';

// Mock environment
const mockEnv: IEnv = {
  API_BASE_URL: 'https://api.example.com',
  CRON_SECRET: 'test-secret-123',
};

// Mock ExecutionContext
interface IMockExecutionContext {
  waitUntil: ReturnType<typeof vi.fn>;
  passThroughOnException: ReturnType<typeof vi.fn>;
}

const mockCtx: IMockExecutionContext = {
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn(),
};

describe('Cloudflare Cron Worker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  describe('scheduled handler', () => {
    it('should route webhook recovery cron pattern correctly', async () => {
      const event = {
        cron: '*/15 * * * *',
        scheduledTime: Date.now(),
        // eslint-disable-next-line no-undef
      } as ScheduledEvent;

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true, processed: 5, recovered: 3 }),
      });
      global.fetch = fetchMock;

      await worker.scheduled(event, mockEnv, mockCtx as unknown);

      // Wait for waitUntil to be called
      expect(mockCtx.waitUntil).toHaveBeenCalled();

      // Get the promise passed to waitUntil and await it
      const waitUntilPromise = mockCtx.waitUntil.mock.calls[0][0];
      await waitUntilPromise;

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.example.com/api/cron/recover-webhooks',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'x-cron-secret': 'test-secret-123',
          }),
        })
      );
    });

    it('should route expiration check cron pattern correctly', async () => {
      const event = {
        cron: '5 * * * *',
        scheduledTime: Date.now(),
        // eslint-disable-next-line no-undef
      } as ScheduledEvent;

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      });
      global.fetch = fetchMock;

      await worker.scheduled(event, mockEnv, mockCtx as unknown);

      expect(mockCtx.waitUntil).toHaveBeenCalled();
      const waitUntilPromise = mockCtx.waitUntil.mock.calls[0][0];
      await waitUntilPromise;

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.example.com/api/cron/check-expirations',
        expect.any(Object)
      );
    });

    it('should route reconciliation cron pattern correctly', async () => {
      const event = {
        cron: '5 3 * * *',
        scheduledTime: Date.now(),
        // eslint-disable-next-line no-undef
      } as ScheduledEvent;

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      });
      global.fetch = fetchMock;

      await worker.scheduled(event, mockEnv, mockCtx as unknown);

      expect(mockCtx.waitUntil).toHaveBeenCalled();
      const waitUntilPromise = mockCtx.waitUntil.mock.calls[0][0];
      await waitUntilPromise;

      expect(fetchMock).toHaveBeenCalledWith(
        'https://api.example.com/api/cron/reconcile',
        expect.any(Object)
      );
    });

    it('should handle unknown cron patterns', async () => {
      const event = {
        cron: '* * * * *',
        scheduledTime: Date.now(),
        // eslint-disable-next-line no-undef
      } as ScheduledEvent;

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await worker.scheduled(event, mockEnv, mockCtx as unknown);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Unknown cron pattern'),
        '* * * * *'
      );

      consoleSpy.mockRestore();
    });

    it('should handle API errors gracefully', async () => {
      const event = {
        cron: '*/15 * * * *',
        scheduledTime: Date.now(),
        // eslint-disable-next-line no-undef
      } as ScheduledEvent;

      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Internal server error' }),
      });
      global.fetch = fetchMock;

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await worker.scheduled(event, mockEnv, mockCtx as unknown);

      expect(mockCtx.waitUntil).toHaveBeenCalled();
      const waitUntilPromise = mockCtx.waitUntil.mock.calls[0][0];
      await waitUntilPromise;

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('failed with status 500'),
        expect.any(Object)
      );

      consoleSpy.mockRestore();
    });

    it('should handle network errors', async () => {
      const event = {
        cron: '*/15 * * * *',
        scheduledTime: Date.now(),
        // eslint-disable-next-line no-undef
      } as ScheduledEvent;

      const fetchMock = vi.fn().mockRejectedValue(new Error('Network error'));
      global.fetch = fetchMock;

      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      await worker.scheduled(event, mockEnv, mockCtx as unknown);

      expect(mockCtx.waitUntil).toHaveBeenCalled();
      const waitUntilPromise = mockCtx.waitUntil.mock.calls[0][0];
      await waitUntilPromise;

      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('error'), expect.any(Error));

      consoleSpy.mockRestore();
    });
  });

  describe('fetch handler - health check', () => {
    it('should return health status', async () => {
      const request = new Request('https://worker.dev/health');

      const response = await worker.fetch(request, mockEnv, mockCtx as unknown);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toEqual({
        status: 'ok',
        worker: 'pixelperfect-cron',
        timestamp: expect.any(String),
      });
    });
  });

  describe('fetch handler - manual trigger', () => {
    it('should trigger cron job via POST', async () => {
      const request = new Request(
        'https://worker.dev/trigger?pattern=%2A%2F15%20%2A%20%2A%20%2A%20%2A',
        {
          method: 'POST',
        }
      );

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });
      global.fetch = fetchMock;

      const response = await worker.fetch(request, mockEnv, mockCtx as unknown);

      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body).toEqual({
        message: 'Cron job triggered',
        pattern: '*/15 * * * *',
        timestamp: expect.any(String),
      });
    });

    it('should return error when pattern is missing', async () => {
      const request = new Request('https://worker.dev/trigger', {
        method: 'POST',
      });

      const response = await worker.fetch(request, mockEnv, mockCtx as unknown);

      expect(response.status).toBe(400);
      const body = await response.json();
      expect(body.error).toBe('Missing pattern parameter');
    });
  });

  describe('fetch handler - 404', () => {
    it('should return 404 for unknown paths', async () => {
      const request = new Request('https://worker.dev/unknown');

      const response = await worker.fetch(request, mockEnv, mockCtx as unknown);

      expect(response.status).toBe(404);
      const body = await response.json();
      expect(body.error).toBe('Not Found');
      expect(body.endpoints).toBeDefined();
    });
  });

  describe('Environment configuration', () => {
    it('should use correct API base URL', async () => {
      const customEnv: IEnv = {
        API_BASE_URL: 'https://custom-api.com',
        CRON_SECRET: 'secret',
      };

      const event = {
        cron: '*/15 * * * *',
        scheduledTime: Date.now(),
        // eslint-disable-next-line no-undef
      } as ScheduledEvent;

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });
      global.fetch = fetchMock;

      await worker.scheduled(event, customEnv, mockCtx as unknown);

      expect(mockCtx.waitUntil).toHaveBeenCalled();
      const waitUntilPromise = mockCtx.waitUntil.mock.calls[0][0];
      await waitUntilPromise;

      expect(fetchMock).toHaveBeenCalledWith(
        'https://custom-api.com/api/cron/recover-webhooks',
        expect.any(Object)
      );
    });

    it('should use correct CRON_SECRET', async () => {
      const customEnv: IEnv = {
        API_BASE_URL: 'https://api.com',
        CRON_SECRET: 'custom-secret-456',
      };

      const event = {
        cron: '*/15 * * * *',
        scheduledTime: Date.now(),
        // eslint-disable-next-line no-undef
      } as ScheduledEvent;

      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      });
      global.fetch = fetchMock;

      await worker.scheduled(event, customEnv, mockCtx as unknown);

      expect(mockCtx.waitUntil).toHaveBeenCalled();
      const waitUntilPromise = mockCtx.waitUntil.mock.calls[0][0];
      await waitUntilPromise;

      expect(fetchMock).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'x-cron-secret': 'custom-secret-456',
          }),
        })
      );
    });
  });
});
