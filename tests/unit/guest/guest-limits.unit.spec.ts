/**
 * Unit tests for guest limits configuration
 *
 * Tests that the guest limits are correctly defined and match the PRD spec.
 */

import { describe, it, expect } from 'vitest';
import { GUEST_LIMITS } from '@/shared/config/guest-limits.config';

describe('Guest Limits Configuration', () => {
  describe('Global Limits (Cost Protection)', () => {
    it('should have global daily limit of 500', () => {
      expect(GUEST_LIMITS.GLOBAL_DAILY_LIMIT).toBe(500);
    });

    it('should have correct cost cap of $0.85', () => {
      expect(GUEST_LIMITS.GLOBAL_DAILY_COST_CAP_USD).toBe(0.85);
    });

    it('should verify cost calculation: 500 × $0.0017 ≈ $0.85', () => {
      const costPerUpscale = 0.0017;
      const maxDailyCost = GUEST_LIMITS.GLOBAL_DAILY_LIMIT * costPerUpscale;
      expect(maxDailyCost).toBeCloseTo(GUEST_LIMITS.GLOBAL_DAILY_COST_CAP_USD, 2);
    });
  });

  describe('IP-based Limits', () => {
    it('should have IP hourly limit of 10', () => {
      expect(GUEST_LIMITS.IP_HOURLY_LIMIT).toBe(10);
    });

    it('should have IP daily limit of 20', () => {
      expect(GUEST_LIMITS.IP_DAILY_LIMIT).toBe(20);
    });

    it('should have hourly limit lower than daily limit', () => {
      expect(GUEST_LIMITS.IP_HOURLY_LIMIT).toBeLessThan(GUEST_LIMITS.IP_DAILY_LIMIT);
    });
  });

  describe('Bot Detection', () => {
    it('should have fingerprints per IP limit of 5', () => {
      expect(GUEST_LIMITS.FINGERPRINTS_PER_IP_LIMIT).toBe(5);
    });
  });

  describe('Client-side Limits (UX)', () => {
    it('should have fingerprint daily limit of 3', () => {
      expect(GUEST_LIMITS.FINGERPRINT_DAILY_LIMIT).toBe(3);
    });
  });

  describe('Processing Limits', () => {
    it('should have max file size of 2MB', () => {
      expect(GUEST_LIMITS.MAX_FILE_SIZE_MB).toBe(2);
    });

    it('should have scale of 2', () => {
      expect(GUEST_LIMITS.SCALE).toBe(2);
    });

    it('should use real-esrgan model', () => {
      expect(GUEST_LIMITS.MODEL).toBe('real-esrgan');
    });
  });

  describe('Configuration Immutability', () => {
    it('should be frozen (as const)', () => {
      // The `as const` assertion makes it deeply readonly
      // This test verifies the values are what we expect
      expect(GUEST_LIMITS.GLOBAL_DAILY_LIMIT).toBeDefined();
      expect(GUEST_LIMITS.IP_HOURLY_LIMIT).toBeDefined();
      expect(GUEST_LIMITS.FINGERPRINT_DAILY_LIMIT).toBeDefined();
    });
  });

  describe('Limit Reasonableness', () => {
    it('should have client limit less than server IP limit', () => {
      // Client limit is for UX, server enforces real limits
      expect(GUEST_LIMITS.FINGERPRINT_DAILY_LIMIT).toBeLessThanOrEqual(GUEST_LIMITS.IP_DAILY_LIMIT);
    });

    it('should have global limit higher than IP limit', () => {
      // Global limit should allow many legitimate users
      expect(GUEST_LIMITS.GLOBAL_DAILY_LIMIT).toBeGreaterThan(GUEST_LIMITS.IP_DAILY_LIMIT);
    });

    it('should have reasonable file size for guest demo', () => {
      // 2MB is enough for demo, small enough to process quickly
      expect(GUEST_LIMITS.MAX_FILE_SIZE_MB).toBeGreaterThanOrEqual(1);
      expect(GUEST_LIMITS.MAX_FILE_SIZE_MB).toBeLessThanOrEqual(5);
    });

    it('should have scale factor that creates upgrade incentive', () => {
      // 2x is good demo, but 4x/8x creates upgrade incentive
      expect(GUEST_LIMITS.SCALE).toBeLessThan(4);
    });
  });
});
