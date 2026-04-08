import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

/**
 * Unit tests for the analytics service.
 * These tests verify the analytics service behavior without external dependencies.
 */
describe('Analytics Service', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
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
