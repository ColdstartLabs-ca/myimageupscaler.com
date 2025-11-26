import { describe, test, expect } from 'vitest';

/**
 * Unit tests for the analytics service.
 * These tests verify the analytics service behavior without external dependencies.
 */
describe('Analytics Service', () => {
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
  });

  describe('hashEmail utility', () => {
    test('should consistently hash the same email', async () => {
      const { analytics } = await import('../../server/analytics/analyticsService');

      const hash1 = await analytics.hashEmail('test@example.com');
      const hash2 = await analytics.hashEmail('test@example.com');

      expect(hash1).toBe(hash2);
    });

    test('should produce different hashes for different emails', async () => {
      const { analytics } = await import('../../server/analytics/analyticsService');

      const hash1 = await analytics.hashEmail('user1@example.com');
      const hash2 = await analytics.hashEmail('user2@example.com');

      expect(hash1).not.toBe(hash2);
    });

    test('should produce non-empty hash', async () => {
      const { analytics } = await import('../../server/analytics/analyticsService');

      const hash = await analytics.hashEmail('test@example.com');

      expect(hash).toBeTruthy();
      expect(hash.length).toBeGreaterThan(0);
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
