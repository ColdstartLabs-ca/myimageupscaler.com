import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@shared/config/env', async importOriginal => {
  const actual = await importOriginal<typeof import('@shared/config/env')>();
  return {
    ...actual,
    serverEnv: {
      ...actual.serverEnv,
      ENV: 'production',
      AMPLITUDE_API_KEY: 'amplitude-production-key',
      GA_MEASUREMENT_ID: 'G-TESTMEASUREMENT',
      GA4_API_SECRET: 'ga4-test-secret',
    },
  };
});

const fetchMock = vi.fn();

function ga4RequestBody() {
  const call = fetchMock.mock.calls.find(([url]) => String(url).includes('google-analytics.com'));
  expect(call).toBeTruthy();
  return JSON.parse((call![1] as RequestInit).body as string);
}

/**
 * Unit tests for the analytics service.
 * These tests verify the analytics service behavior without external dependencies.
 */
describe('Analytics Service', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    fetchMock.mockReset();
    fetchMock.mockImplementation(async (url: string) => {
      return String(url).includes('google-analytics.com')
        ? ({ ok: true, status: 204, text: async () => '' } as Response)
        : ({ ok: true, status: 200, text: async () => '{"code":200}' } as Response);
    });
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
    vi.unstubAllGlobals();
  });

  describe('GA4 Measurement Protocol context', () => {
    test('reuses provided GA4 client and session ids', async () => {
      const { trackServerEvent } = await import('../../server/analytics/analyticsService');

      const result = await trackServerEvent(
        'upscale_completed',
        { success: true },
        {
          apiKey: 'amplitude-production-key',
          userId: 'user-1',
          deviceId: 'amplitude-device',
          gaClientId: '111.222',
          gaSessionId: '333',
        }
      );

      expect(result).toBe(true);
      const body = ga4RequestBody();
      expect(body.client_id).toBe('111.222');
      expect(body.events[0].params.session_id).toBe('333');
      expect(body.events[0].params.engagement_time_msec).toBe(1);
    });

    test('falls back to deviceId and omits GA4 session params without GA context', async () => {
      const { trackServerEvent } = await import('../../server/analytics/analyticsService');

      const result = await trackServerEvent(
        'upscale_completed',
        { success: true },
        { apiKey: 'amplitude-production-key', userId: 'user-1', deviceId: 'amplitude-device' }
      );

      expect(result).toBe(true);
      const body = ga4RequestBody();
      expect(body.client_id).toBe('amplitude-device');
      expect(body.events[0].params.session_id).toBeUndefined();
      expect(body.events[0].params.engagement_time_msec).toBeUndefined();
    });
  });

  describe('trackServerEvent', () => {
    test('should return false when API key is empty', async () => {
      // Import dynamically to avoid module caching issues
      const { trackServerEvent } = await import('../../server/analytics/analyticsService');

      const result = await trackServerEvent(
        'login',
        { source: 'test' },
        { apiKey: '', userId: 'test-user' }
      );

      expect(result).toBe(false);
    });

    test('should return false when API key is missing', async () => {
      const { trackServerEvent } = await import('../../server/analytics/analyticsService');

      const result = await trackServerEvent(
        'signup_completed',
        { method: 'email' },
        { apiKey: '', userId: 'user-123' }
      );

      expect(result).toBe(false);
    });

    test('should log when API key is missing for server events', async () => {
      const { trackServerEvent } = await import('../../server/analytics/analyticsService');

      const result = await trackServerEvent(
        'purchase_confirmed',
        { source: 'test' },
        { apiKey: '', userId: 'user-123' }
      );

      expect(result).toBe(false);
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[Analytics] Missing Amplitude API key for server event',
        expect.objectContaining({
          event: 'purchase_confirmed',
          userId: 'user-123',
        })
      );
    });
  });

  describe('fetchAnalyticsWithTimeout', () => {
    test('should reject instead of hanging when analytics never responds', async () => {
      vi.useFakeTimers();
      const fetchImplementation = vi.fn(() => new Promise<Response>(() => {}));
      const { fetchAnalyticsWithTimeout } = await import('../../server/analytics/analyticsService');

      const request = fetchAnalyticsWithTimeout(
        'https://analytics.example.test/events',
        { method: 'POST' },
        100,
        fetchImplementation
      );
      const assertion = expect(request).rejects.toThrow('Analytics request timed out after 100ms');

      await vi.advanceTimersByTimeAsync(100);
      await assertion;
      vi.useRealTimers();
    });
  });

  // Test hashEmail utility
  describe('hashEmail utility', () => {
    test('should consistently hash the same email', async () => {
      const { hashEmail } = await import('../../server/analytics/analyticsService');

      const email = 'test@example.com';
      const hash1 = await hashEmail(email);
      const hash2 = await hashEmail(email);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex format
    });

    test('should produce different hashes for different emails', async () => {
      const { hashEmail } = await import('../../server/analytics/analyticsService');

      const hash1 = await hashEmail('user1@example.com');
      const hash2 = await hashEmail('user2@example.com');

      expect(hash1).not.toBe(hash2);
    });

    test('should produce non-empty hash', async () => {
      const { hashEmail } = await import('../../server/analytics/analyticsService');

      const hash = await hashEmail('test@example.com');

      expect(hash).toBeTruthy();
      expect(typeof hash).toBe('string');
      expect(hash.length).toBe(64); // SHA-256 hex length
    });

    test('should handle email normalization', async () => {
      const { hashEmail } = await import('../../server/analytics/analyticsService');

      const hash1 = await hashEmail('Test@Example.COM');
      const hash2 = await hashEmail('test@example.com  ');

      expect(hash1).toBe(hash2);
    });

    test('should throw error for invalid input', async () => {
      const { hashEmail } = await import('../../server/analytics/analyticsService');

      await expect(hashEmail('')).rejects.toThrow('Valid email string is required');
      await expect(hashEmail(null as unknown as string)).rejects.toThrow(
        'Valid email string is required'
      );
      await expect(hashEmail(undefined as unknown as string)).rejects.toThrow(
        'Valid email string is required'
      );
      await expect(hashEmail(123 as unknown as string)).rejects.toThrow(
        'Valid email string is required'
      );
    });
  });
});

describe('Analytics Types', () => {
  test('should export all required types', async () => {
    const types = await import('../../server/analytics/types');

    // Verify types exist (TypeScript compile-time check)
    expect(types).toBeDefined();
  });
});
