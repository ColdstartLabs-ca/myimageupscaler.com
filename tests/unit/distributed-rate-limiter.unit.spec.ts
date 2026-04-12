import { describe, test, expect, vi, beforeEach } from 'vitest';

// Mock Redis functions - these must be stable references that persist
// through the singleton Redis instance created by getRedis()
const mockPipelineExec = vi.fn();
const mockRedisGet = vi.fn();
const mockRedisDel = vi.fn();

// Self-returning pipeline mock
const mockPipeline = {
  incr: vi.fn().mockReturnThis(),
  expire: vi.fn().mockReturnThis(),
  exec: mockPipelineExec,
};

vi.mock('@upstash/redis', () => {
  return {
    Redis: class {
      pipeline() {
        return mockPipeline;
      }
      get(...args: unknown[]) {
        return mockRedisGet(...args);
      }
      del(...args: unknown[]) {
        return mockRedisDel(...args);
      }
    },
  };
});

vi.mock('@shared/config/env', () => ({
  serverEnv: {
    UPSTASH_REDIS_REST_URL: 'https://test.upstash.redis',
    UPSTASH_REDIS_REST_TOKEN: 'test-token',
  },
}));

import {
  checkRateLimit,
  resetRateLimit,
  getRateLimitStats,
} from '../../server/services/distributed-rate-limiter';

describe('Distributed Rate Limiter', () => {
  beforeEach(() => {
    mockPipelineExec.mockReset();
    mockRedisGet.mockReset();
    mockRedisDel.mockReset();
    mockPipeline.incr.mockReset().mockReturnThis();
    mockPipeline.expire.mockReset().mockReturnThis();
  });

  describe('checkRateLimit', () => {
    test('should allow request when under limit', async () => {
      mockPipelineExec.mockResolvedValue([1, true]);

      const result = await checkRateLimit('user_allow', 5, 10000);

      expect(result.success).toBe(true);
      expect(result.remaining).toBe(4);
      expect(result.reset).toBeGreaterThan(0);
    });

    test('should block request when limit exceeded', async () => {
      mockPipelineExec.mockResolvedValue([6, true]);

      const result = await checkRateLimit('user_blocked', 5, 10000);

      expect(result.success).toBe(false);
      expect(result.remaining).toBe(0);
      expect(result.reset).toBeGreaterThan(0);
    });

    test('should calculate correct remaining count', async () => {
      mockPipelineExec.mockResolvedValue([3, true]);

      const result = await checkRateLimit('user_remaining', 10, 10000);

      expect(result.success).toBe(true);
      expect(result.remaining).toBe(7);
    });

    test('should use correct Redis key format with window-based partitioning', async () => {
      mockPipelineExec.mockResolvedValue([1, true]);

      await checkRateLimit('test_user', 5, 10000);

      expect(mockPipeline.incr).toHaveBeenCalledWith(
        expect.stringMatching(/^ratelimit:test_user:w\d+$/)
      );
    });

    test('should set expiry on key converted to seconds', async () => {
      mockPipelineExec.mockResolvedValue([1, true]);

      await checkRateLimit('test_user', 5, 60000);

      expect(mockPipeline.expire).toHaveBeenCalledWith(
        expect.any(String),
        60 // 60000ms / 1000 = 60s
      );
    });

    test('should fail open when pipeline returns no results', async () => {
      mockPipelineExec.mockResolvedValue(null);

      const result = await checkRateLimit('test_null', 5, 10000);

      expect(result.success).toBe(true);
      expect(result.remaining).toBe(4);
    });

    test('should fail open when pipeline returns empty array', async () => {
      mockPipelineExec.mockResolvedValue([]);

      const result = await checkRateLimit('test_empty', 5, 10000);

      expect(result.success).toBe(true);
      expect(result.remaining).toBe(4);
    });

    test('should fail open on Redis error', async () => {
      mockPipelineExec.mockRejectedValue(new Error('Connection refused'));

      const result = await checkRateLimit('test_error', 5, 10000);

      expect(result.success).toBe(true);
      expect(result.remaining).toBe(4);
    });

    test('should work with 10-second windows (sub-minute) without divide-by-zero', async () => {
      mockPipelineExec.mockResolvedValue([1, true]);

      const result = await checkRateLimit('user_10s', 50, 10000);

      expect(result.success).toBe(true);
      const incrCall = mockPipeline.incr.mock.calls[0][0] as string;
      expect(incrCall).toMatch(/^ratelimit:user_10s:w\d+$/);
      expect(incrCall).not.toContain('Infinity');
      expect(incrCall).not.toContain('NaN');
    });

    test('should handle limit of 1 correctly', async () => {
      mockPipelineExec.mockResolvedValue([1, true]);

      const result = await checkRateLimit('user_1_limit', 1, 10000);

      expect(result.success).toBe(true);
      expect(result.remaining).toBe(0);
    });

    test('should calculate reset time from window boundary when blocked', async () => {
      mockPipelineExec.mockResolvedValue([6, true]);

      const now = Date.now();
      const windowMs = 10000;
      const result = await checkRateLimit('user_reset_time', 5, windowMs);

      expect(result.success).toBe(false);
      const expectedReset = (Math.floor(now / windowMs) + 1) * windowMs;
      expect(result.reset).toBeGreaterThanOrEqual(now);
      expect(result.reset).toBeLessThanOrEqual(expectedReset + 100);
    });
  });

  describe('resetRateLimit', () => {
    test('should delete the rate limit key', async () => {
      mockRedisDel.mockResolvedValue(1);

      const result = await resetRateLimit('test_user_del', 10000);

      expect(result).toBe(true);
      expect(mockRedisDel).toHaveBeenCalledWith(
        expect.stringMatching(/^ratelimit:test_user_del:w/)
      );
    });

    test('should return false on Redis error', async () => {
      mockRedisDel.mockRejectedValue(new Error('Connection refused'));

      const result = await resetRateLimit('test_user_del_err', 10000);

      expect(result).toBe(false);
    });
  });

  describe('getRateLimitStats', () => {
    test('should return current count from Redis', async () => {
      mockRedisGet.mockResolvedValue(3);

      const result = await getRateLimitStats('test_user_stats', 10000);

      expect(result).toEqual({
        count: 3,
        limit: 0,
        windowMs: 10000,
      });
    });

    test('should return 0 count when key does not exist', async () => {
      mockRedisGet.mockResolvedValue(null);

      const result = await getRateLimitStats('test_user_nokey', 10000);

      expect(result).toEqual({
        count: 0,
        limit: 0,
        windowMs: 10000,
      });
    });

    test('should return null on Redis error', async () => {
      mockRedisGet.mockRejectedValue(new Error('Connection refused'));

      const result = await getRateLimitStats('test_user_stats_err', 10000);

      expect(result).toBeNull();
    });
  });
});
