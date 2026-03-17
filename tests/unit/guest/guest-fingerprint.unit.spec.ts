/**
 * Unit tests for guest fingerprint and usage tracking
 *
 * Tests client-side guest tracking logic for:
 * - canProcessAsGuest: Daily limit check
 * - incrementGuestUsage: Usage counter updates
 * - getRemainingUses: Remaining uses calculation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value;
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
});

// Import after mocking
const { canProcessAsGuest, getGuestUsage, incrementGuestUsage, getRemainingUses } =
  await import('@/client/utils/guest-fingerprint');

const STORAGE_KEY = 'miu_guest_usage';
const DAILY_LIMIT = 3;

describe('Guest Fingerprint Utils', () => {
  beforeEach(() => {
    localStorageMock.clear();
  });

  describe('getGuestUsage', () => {
    it('should return null when no usage stored', () => {
      expect(getGuestUsage()).toBeNull();
    });

    it('should return parsed usage when stored', () => {
      const usage = {
        fingerprint: 'test-fp',
        dailyCount: 2,
        lastResetDate: '2026-01-06',
        totalCount: 10,
        firstUsedAt: '2026-01-01T00:00:00.000Z',
      };
      localStorageMock.setItem(STORAGE_KEY, JSON.stringify(usage));
      expect(getGuestUsage()).toEqual(usage);
    });

    it('should return null for invalid JSON', () => {
      localStorageMock.setItem(STORAGE_KEY, 'not-json');
      expect(getGuestUsage()).toBeNull();
    });
  });

  describe('canProcessAsGuest', () => {
    it('should allow first-time user (null usage)', () => {
      expect(canProcessAsGuest(null)).toBe(true);
    });

    it('should allow user with usage below limit', () => {
      const usage = {
        fingerprint: 'test-fp',
        dailyCount: 2,
        lastResetDate: new Date().toISOString().split('T')[0],
        totalCount: 2,
        firstUsedAt: new Date().toISOString(),
      };
      expect(canProcessAsGuest(usage)).toBe(true);
    });

    it('should block user at daily limit', () => {
      const usage = {
        fingerprint: 'test-fp',
        dailyCount: DAILY_LIMIT,
        lastResetDate: new Date().toISOString().split('T')[0],
        totalCount: DAILY_LIMIT,
        firstUsedAt: new Date().toISOString(),
      };
      expect(canProcessAsGuest(usage)).toBe(false);
    });

    it('should allow user with stale date (new day)', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const usage = {
        fingerprint: 'test-fp',
        dailyCount: DAILY_LIMIT,
        lastResetDate: yesterday.toISOString().split('T')[0],
        totalCount: 10,
        firstUsedAt: new Date().toISOString(),
      };
      expect(canProcessAsGuest(usage)).toBe(true);
    });

    it('should allow user at limit but from previous day', () => {
      const usage = {
        fingerprint: 'test-fp',
        dailyCount: 10, // Way over limit
        lastResetDate: '2025-12-25', // Old date
        totalCount: 100,
        firstUsedAt: '2025-01-01T00:00:00.000Z',
      };
      expect(canProcessAsGuest(usage)).toBe(true);
    });
  });

  describe('incrementGuestUsage', () => {
    it('should create new usage for first-time visitor', () => {
      const visitorId = 'new-visitor-123';
      const usage = incrementGuestUsage(visitorId);

      expect(usage.fingerprint).toBe(visitorId);
      expect(usage.dailyCount).toBe(1);
      expect(usage.totalCount).toBe(1);
      expect(usage.lastResetDate).toBe(new Date().toISOString().split('T')[0]);
      expect(usage.firstUsedAt).toBeDefined();
    });

    it('should increment existing usage for same visitor', () => {
      const visitorId = 'existing-visitor';
      const today = new Date().toISOString().split('T')[0];

      // First increment
      incrementGuestUsage(visitorId);

      // Second increment
      const usage = incrementGuestUsage(visitorId);

      expect(usage.fingerprint).toBe(visitorId);
      expect(usage.dailyCount).toBe(2);
      expect(usage.totalCount).toBe(2);
      expect(usage.lastResetDate).toBe(today);
    });

    it('should reset daily count on new day', () => {
      const visitorId = 'returning-visitor';
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      // Set up existing usage from yesterday
      const existingUsage = {
        fingerprint: visitorId,
        dailyCount: 3,
        lastResetDate: yesterday.toISOString().split('T')[0],
        totalCount: 100,
        firstUsedAt: '2025-01-01T00:00:00.000Z',
      };
      localStorageMock.setItem(STORAGE_KEY, JSON.stringify(existingUsage));

      const usage = incrementGuestUsage(visitorId);

      expect(usage.dailyCount).toBe(1); // Reset to 1
      expect(usage.totalCount).toBe(101); // Still incremented
      expect(usage.lastResetDate).toBe(new Date().toISOString().split('T')[0]);
    });

    it('should create new usage for different visitor', () => {
      const firstVisitor = 'visitor-1';
      const secondVisitor = 'visitor-2';

      incrementGuestUsage(firstVisitor);
      const usage = incrementGuestUsage(secondVisitor);

      expect(usage.fingerprint).toBe(secondVisitor);
      expect(usage.dailyCount).toBe(1);
      expect(usage.totalCount).toBe(1);
    });
  });

  describe('getRemainingUses', () => {
    it('should return full limit for null usage', () => {
      expect(getRemainingUses(null)).toBe(DAILY_LIMIT);
    });

    it('should return correct remaining for partial usage', () => {
      const usage = {
        fingerprint: 'test-fp',
        dailyCount: 1,
        lastResetDate: new Date().toISOString().split('T')[0],
        totalCount: 1,
        firstUsedAt: new Date().toISOString(),
      };
      expect(getRemainingUses(usage)).toBe(DAILY_LIMIT - 1);
    });

    it('should return 0 when at limit', () => {
      const usage = {
        fingerprint: 'test-fp',
        dailyCount: DAILY_LIMIT,
        lastResetDate: new Date().toISOString().split('T')[0],
        totalCount: DAILY_LIMIT,
        firstUsedAt: new Date().toISOString(),
      };
      expect(getRemainingUses(usage)).toBe(0);
    });

    it('should return full limit for stale date', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      const usage = {
        fingerprint: 'test-fp',
        dailyCount: DAILY_LIMIT,
        lastResetDate: yesterday.toISOString().split('T')[0],
        totalCount: 100,
        firstUsedAt: new Date().toISOString(),
      };
      expect(getRemainingUses(usage)).toBe(DAILY_LIMIT);
    });

    it('should not return negative values', () => {
      const usage = {
        fingerprint: 'test-fp',
        dailyCount: 100, // Way over limit (shouldn't happen in practice)
        lastResetDate: new Date().toISOString().split('T')[0],
        totalCount: 100,
        firstUsedAt: new Date().toISOString(),
      };
      expect(getRemainingUses(usage)).toBe(0);
    });
  });
});
