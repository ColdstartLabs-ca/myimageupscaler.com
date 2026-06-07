import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import { AIProvider, EmailProvider } from '@shared/types/provider-adapter.types';

dayjs.extend(utc);

// Mock supabaseAdmin
const mockRpc = vi.fn();
const mockFrom = vi.fn(() => ({
  select: vi.fn(() => ({
    eq: vi.fn(() => ({
      single: vi.fn(),
    })),
  })),
  update: vi.fn(() => ({
    eq: vi.fn(() => ({
      eq: vi.fn(() => Promise.resolve({ error: null })),
    })),
  })),
}));

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: {
    rpc: mockRpc,
    from: mockFrom,
  },
}));

// Type for the provider credit tracker
type IProviderCreditTracker = {
  getProviderLimits: (provider: AIProvider | EmailProvider) => {
    dailyRequests: number;
    monthlyCredits: number;
    hardLimit: boolean;
    resetTimezone: string;
  };
  isProviderAvailable: (provider: AIProvider | EmailProvider) => Promise<boolean>;
  incrementUsage: (
    provider: AIProvider | EmailProvider,
    requests?: number,
    credits?: number
  ) => Promise<{
    success: boolean;
    dailyRemaining: number | null;
    monthlyRemaining: number | null;
    error?: string;
  }>;
  getProviderUsage: (provider: AIProvider | EmailProvider) => Promise<{
    provider: AIProvider | EmailProvider;
    todayRequests: number;
    monthCredits: number;
    lastDailyReset: string;
    lastMonthlyReset: string;
    totalRequests: number;
    totalCredits: number;
  }>;
  resetDailyCounters: (provider: AIProvider | EmailProvider) => Promise<void>;
  resetMonthlyCounters: (provider: AIProvider | EmailProvider) => Promise<void>;
  getAllProvidersUsage: () => Promise<Record<AIProvider, unknown>>;
  logProviderUsage: (provider: AIProvider | EmailProvider) => void;
};

type IGetProviderCreditTracker = () => IProviderCreditTracker;

// Dynamic import to ensure mocks are applied
let ProviderCreditTracker: new () => IProviderCreditTracker;
let getProviderCreditTracker: IGetProviderCreditTracker;

describe('ProviderCreditTracker', () => {
  let tracker: IProviderCreditTracker;

  beforeEach(async () => {
    vi.clearAllMocks();
    mockRpc.mockReset();
    mockFrom.mockReset();

    // Reset mockFrom to return fresh chainable mocks
    mockFrom.mockReturnValue({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn(),
        })),
      })),
      update: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ error: null })),
        })),
      })),
    });

    // Dynamic import after mocking
    const module = await import('@server/services/provider-credit-tracker.service');
    ProviderCreditTracker = module.ProviderCreditTracker;
    getProviderCreditTracker = module.getProviderCreditTracker;

    tracker = new ProviderCreditTracker();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getProviderLimits', () => {
    it('should return correct limits for REPLICATE AI provider', () => {
      const limits = tracker.getProviderLimits(AIProvider.REPLICATE);

      expect(limits).toEqual({
        dailyRequests: 0,
        monthlyCredits: 0,
        hardLimit: false,
        resetTimezone: 'UTC',
      });
    });

    it('should return correct limits for GEMINI AI provider', () => {
      const limits = tracker.getProviderLimits(AIProvider.GEMINI);

      expect(limits).toEqual({
        dailyRequests: 500,
        monthlyCredits: 15000,
        hardLimit: true,
        resetTimezone: 'UTC',
      });
    });

    it('should return correct limits for STABILITY_AI AI provider', () => {
      const limits = tracker.getProviderLimits(AIProvider.STABILITY_AI);

      expect(limits).toEqual({
        dailyRequests: 0,
        monthlyCredits: 0,
        hardLimit: false,
        resetTimezone: 'UTC',
      });
    });

    it('should return correct limits for OPENAI AI provider', () => {
      const limits = tracker.getProviderLimits(AIProvider.OPENAI);

      expect(limits).toEqual({
        dailyRequests: 0,
        monthlyCredits: 0,
        hardLimit: false,
        resetTimezone: 'UTC',
      });
    });

    it('should return correct limits for BREVO email provider', () => {
      const limits = tracker.getProviderLimits(EmailProvider.BREVO);

      expect(limits).toEqual({
        dailyRequests: 300,
        monthlyCredits: 9000,
        hardLimit: true,
        resetTimezone: 'UTC',
      });
    });

    it('tracks cloudflare email usage limits', () => {
      const limits = tracker.getProviderLimits(EmailProvider.CLOUDFLARE);

      expect(limits).toEqual({
        dailyRequests: 0,
        monthlyCredits: 3000,
        hardLimit: true,
        resetTimezone: 'UTC',
      });
    });

    it('should return correct limits for RESEND email provider', () => {
      const limits = tracker.getProviderLimits(EmailProvider.RESEND);

      expect(limits).toEqual({
        dailyRequests: 100,
        monthlyCredits: 3000,
        hardLimit: true,
        resetTimezone: 'UTC',
      });
    });

    it('should return default limits for unknown provider', () => {
      const limits = tracker.getProviderLimits('unknown' as AIProvider);

      expect(limits).toEqual({
        dailyRequests: 0,
        monthlyCredits: 0,
        hardLimit: false,
        resetTimezone: 'UTC',
      });
    });
  });

  describe('isProviderAvailable', () => {
    it('should return true for providers with no limits', async () => {
      const isAvailable = await tracker.isProviderAvailable(AIProvider.REPLICATE);

      expect(isAvailable).toBe(true);
    });

    it('should return true when provider is within daily limits', async () => {
      mockRpc.mockResolvedValueOnce({
        data: [
          {
            daily_requests: 100,
            monthly_credits: 1000,
            last_daily_reset: dayjs.utc().toISOString(),
            last_monthly_reset: dayjs.utc().format('YYYY-MM'),
          },
        ],
        error: null,
      });

      const isAvailable = await tracker.isProviderAvailable(AIProvider.GEMINI);

      expect(isAvailable).toBe(true);
    });

    it('should return false when daily limit is exceeded', async () => {
      mockRpc.mockResolvedValueOnce({
        data: [
          {
            daily_requests: 500,
            monthly_credits: 1000,
            last_daily_reset: dayjs.utc().toISOString(),
            last_monthly_reset: dayjs.utc().format('YYYY-MM'),
          },
        ],
        error: null,
      });

      const isAvailable = await tracker.isProviderAvailable(AIProvider.GEMINI);

      expect(isAvailable).toBe(false);
    });

    it('should return false when monthly limit is exceeded', async () => {
      mockRpc.mockResolvedValueOnce({
        data: [
          {
            daily_requests: 100,
            monthly_credits: 15000,
            last_daily_reset: dayjs.utc().toISOString(),
            last_monthly_reset: dayjs.utc().format('YYYY-MM'),
          },
        ],
        error: null,
      });

      const isAvailable = await tracker.isProviderAvailable(AIProvider.GEMINI);

      expect(isAvailable).toBe(false);
    });

    it('should return true when daily counters need reset (new day)', async () => {
      const yesterday = dayjs.utc().subtract(1, 'day');

      mockRpc.mockResolvedValueOnce({
        data: [
          {
            daily_requests: 500,
            monthly_credits: 1000,
            last_daily_reset: yesterday.toISOString(),
            last_monthly_reset: dayjs.utc().format('YYYY-MM'),
          },
        ],
        error: null,
      });

      mockRpc.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      const isAvailable = await tracker.isProviderAvailable(AIProvider.GEMINI);

      expect(isAvailable).toBe(true);
    });

    it('should return true when monthly counters need reset (new month)', async () => {
      const lastMonth = dayjs.utc().subtract(1, 'month').format('YYYY-MM');

      mockRpc.mockResolvedValueOnce({
        data: [
          {
            daily_requests: 100,
            monthly_credits: 15000,
            last_daily_reset: dayjs.utc().toISOString(),
            last_monthly_reset: lastMonth,
          },
        ],
        error: null,
      });

      mockRpc.mockResolvedValueOnce({
        data: null,
        error: null,
      });

      const isAvailable = await tracker.isProviderAvailable(AIProvider.GEMINI);

      expect(isAvailable).toBe(true);
    });

    it('should handle email providers correctly', async () => {
      mockRpc.mockResolvedValueOnce({
        data: [
          {
            daily_requests: 50,
            monthly_credits: 500,
            last_daily_reset: dayjs.utc().toISOString(),
            last_monthly_reset: dayjs.utc().format('YYYY-MM'),
          },
        ],
        error: null,
      });

      const isAvailable = await tracker.isProviderAvailable(EmailProvider.BREVO);

      expect(isAvailable).toBe(true);
      expect(mockRpc).toHaveBeenCalledWith('get_or_create_email_provider_usage', {
        p_provider: EmailProvider.BREVO,
      });
    });

    it('should handle errors gracefully and return default availability', async () => {
      mockRpc.mockResolvedValueOnce({
        data: null,
        error: new Error('Database error'),
      });

      const isAvailable = await tracker.isProviderAvailable(AIProvider.GEMINI);

      expect(isAvailable).toBe(true);
    });
  });

  describe('incrementUsage', () => {
    it('should increment usage for AI provider successfully', async () => {
      mockRpc.mockResolvedValue({
        data: [{ success: true, daily_requests_remaining: 400, monthly_credits_remaining: 14000 }],
        error: null,
      });

      const result = await tracker.incrementUsage(AIProvider.GEMINI, 1, 10);

      expect(result.success).toBe(true);
      expect(result.dailyRemaining).toBe(400);
      expect(result.monthlyRemaining).toBe(14000);
      expect(result.error).toBeUndefined();
      expect(mockRpc).toHaveBeenCalledWith('increment_provider_usage', {
        p_provider: AIProvider.GEMINI,
        p_requests: 1,
        p_credits: 10,
      });
    });

    it('should increment usage for email provider successfully', async () => {
      mockRpc.mockResolvedValue({
        data: [{ success: true, daily_requests_remaining: 250, monthly_credits_remaining: 8500 }],
        error: null,
      });

      const result = await tracker.incrementUsage(EmailProvider.BREVO, 1, 5);

      expect(result.success).toBe(true);
      expect(result.dailyRemaining).toBe(250);
      expect(result.monthlyRemaining).toBe(8500);
      expect(mockRpc).toHaveBeenCalledWith('increment_email_provider_usage', {
        p_provider: EmailProvider.BREVO,
        p_requests: 1,
        p_credits: 5,
      });
    });

    it('should handle increment errors gracefully', async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'Database connection failed' },
      });

      const result = await tracker.incrementUsage(AIProvider.GEMINI, 1, 10);

      expect(result.success).toBe(false);
      expect(result.dailyRemaining).toBe(null);
      expect(result.monthlyRemaining).toBe(null);
      expect(result.error).toBe('Database connection failed');
    });

    it('should handle exceptions during increment', async () => {
      mockRpc.mockRejectedValue(new Error('Unexpected error'));

      const result = await tracker.incrementUsage(AIProvider.GEMINI, 1, 10);

      expect(result.success).toBe(false);
      expect(result.dailyRemaining).toBe(null);
      expect(result.monthlyRemaining).toBe(null);
      expect(result.error).toBe('Unexpected error');
    });

    it('should handle missing data in response', async () => {
      mockRpc.mockResolvedValue({
        data: [],
        error: null,
      });

      const result = await tracker.incrementUsage(AIProvider.GEMINI, 1, 10);

      expect(result.success).toBe(false);
      expect(result.dailyRemaining).toBe(null);
      expect(result.monthlyRemaining).toBe(null);
    });

    it('should use default values when requests and credits not provided', async () => {
      mockRpc.mockResolvedValue({
        data: [{ success: true, daily_requests_remaining: 499, monthly_credits_remaining: 15000 }],
        error: null,
      });

      const result = await tracker.incrementUsage(AIProvider.GEMINI);

      expect(result.success).toBe(true);
      expect(mockRpc).toHaveBeenCalledWith('increment_provider_usage', {
        p_provider: AIProvider.GEMINI,
        p_requests: 1,
        p_credits: 0,
      });
    });
  });

  describe('getProviderUsage', () => {
    it('should return usage data for AI provider', async () => {
      mockRpc.mockResolvedValue({
        data: [
          {
            daily_requests: 100,
            monthly_credits: 1000,
            last_daily_reset: dayjs.utc().toISOString(),
            last_monthly_reset: dayjs.utc().format('YYYY-MM'),
          },
        ],
        error: null,
      });

      const usage = await tracker.getProviderUsage(AIProvider.GEMINI);

      expect(usage.provider).toBe(AIProvider.GEMINI);
      expect(usage.todayRequests).toBe(100);
      expect(usage.monthCredits).toBe(1000);
      expect(mockRpc).toHaveBeenCalledWith('get_or_create_provider_usage', {
        p_provider: AIProvider.GEMINI,
      });
    });

    it('should return usage data for email provider', async () => {
      mockRpc.mockResolvedValue({
        data: [
          {
            daily_requests: 50,
            monthly_credits: 500,
            last_daily_reset: dayjs.utc().toISOString(),
            last_monthly_reset: dayjs.utc().format('YYYY-MM'),
          },
        ],
        error: null,
      });

      const usage = await tracker.getProviderUsage(EmailProvider.BREVO);

      expect(usage.provider).toBe(EmailProvider.BREVO);
      expect(usage.todayRequests).toBe(50);
      expect(usage.monthCredits).toBe(500);
      expect(mockRpc).toHaveBeenCalledWith('get_or_create_email_provider_usage', {
        p_provider: EmailProvider.BREVO,
      });
    });

    it('should return default usage when no data exists', async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: null,
      });

      const usage = await tracker.getProviderUsage(AIProvider.GEMINI);

      expect(usage.todayRequests).toBe(0);
      expect(usage.monthCredits).toBe(0);
      expect(usage.provider).toBe(AIProvider.GEMINI);
    });

    it('should return default usage when error occurs', async () => {
      mockRpc.mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      });

      const usage = await tracker.getProviderUsage(AIProvider.GEMINI);

      expect(usage.todayRequests).toBe(0);
      expect(usage.monthCredits).toBe(0);
      expect(usage.provider).toBe(AIProvider.GEMINI);
    });

    it('should handle empty data array', async () => {
      mockRpc.mockResolvedValue({
        data: [],
        error: null,
      });

      const usage = await tracker.getProviderUsage(AIProvider.GEMINI);

      expect(usage.todayRequests).toBe(0);
      expect(usage.monthCredits).toBe(0);
    });

    it('should handle exceptions during fetch', async () => {
      mockRpc.mockRejectedValue(new Error('Network error'));

      const usage = await tracker.getProviderUsage(AIProvider.GEMINI);

      expect(usage.todayRequests).toBe(0);
      expect(usage.monthCredits).toBe(0);
    });

    it('should handle zero values in database response', async () => {
      mockRpc.mockResolvedValue({
        data: [
          {
            daily_requests: 0,
            monthly_credits: 0,
            last_daily_reset: dayjs.utc().toISOString(),
            last_monthly_reset: dayjs.utc().format('YYYY-MM'),
          },
        ],
        error: null,
      });

      const usage = await tracker.getProviderUsage(AIProvider.GEMINI);

      expect(usage.todayRequests).toBe(0);
      expect(usage.monthCredits).toBe(0);
    });
  });

  describe('resetDailyCounters', () => {
    it('should reset daily counters for AI provider', async () => {
      const mockUpdate = vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ error: null })),
        })),
      }));

      mockFrom.mockReturnValueOnce({
        update: mockUpdate,
      });

      await tracker.resetDailyCounters(AIProvider.GEMINI);

      expect(mockFrom).toHaveBeenCalledWith('provider_usage');
      expect(mockUpdate).toHaveBeenCalledWith({
        daily_requests: 0,
        last_daily_reset: expect.any(String),
        updated_at: expect.any(String),
      });
    });

    it('should reset daily counters for email provider', async () => {
      const mockUpdate = vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ error: null })),
        })),
      }));

      mockFrom.mockReturnValueOnce({
        update: mockUpdate,
      });

      await tracker.resetDailyCounters(EmailProvider.BREVO);

      expect(mockFrom).toHaveBeenCalledWith('email_provider_usage');
      expect(mockUpdate).toHaveBeenCalledWith({
        daily_requests: 0,
        last_daily_reset: expect.any(String),
        updated_at: expect.any(String),
      });
    });

    it('should handle errors during reset', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const mockUpdate = vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ error: { message: 'Update failed' } })),
        })),
      }));

      mockFrom.mockReturnValueOnce({
        update: mockUpdate,
      });

      await expect(tracker.resetDailyCounters(AIProvider.GEMINI)).resolves.not.toThrow();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should handle exceptions during reset', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      mockFrom.mockImplementationOnce(() => {
        throw new Error('Unexpected error');
      });

      await expect(tracker.resetDailyCounters(AIProvider.GEMINI)).resolves.not.toThrow();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('resetMonthlyCounters', () => {
    it('should reset monthly counters for AI provider', async () => {
      const mockUpdate = vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ error: null })),
        })),
      }));

      mockFrom.mockReturnValueOnce({
        update: mockUpdate,
      });

      await tracker.resetMonthlyCounters(AIProvider.GEMINI);

      expect(mockFrom).toHaveBeenCalledWith('provider_usage');
      expect(mockUpdate).toHaveBeenCalledWith({
        monthly_credits: 0,
        last_monthly_reset: expect.any(String),
        updated_at: expect.any(String),
      });
    });

    it('should reset monthly counters for email provider', async () => {
      const mockUpdate = vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ error: null })),
        })),
      }));

      mockFrom.mockReturnValueOnce({
        update: mockUpdate,
      });

      await tracker.resetMonthlyCounters(EmailProvider.RESEND);

      expect(mockFrom).toHaveBeenCalledWith('email_provider_usage');
      expect(mockUpdate).toHaveBeenCalledWith({
        monthly_credits: 0,
        last_monthly_reset: expect.any(String),
        updated_at: expect.any(String),
      });
    });

    it('should handle errors during reset', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const mockUpdate = vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => Promise.resolve({ error: { message: 'Update failed' } })),
        })),
      }));

      mockFrom.mockReturnValueOnce({
        update: mockUpdate,
      });

      await expect(tracker.resetMonthlyCounters(AIProvider.GEMINI)).resolves.not.toThrow();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should handle exceptions during reset', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      mockFrom.mockImplementationOnce(() => {
        throw new Error('Unexpected error');
      });

      await expect(tracker.resetMonthlyCounters(AIProvider.GEMINI)).resolves.not.toThrow();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('getAllProvidersUsage', () => {
    it('should return usage for all AI providers', async () => {
      mockRpc.mockImplementation((rpcName: string) => {
        if (rpcName === 'get_or_create_provider_usage') {
          return Promise.resolve({
            data: [
              {
                daily_requests: 10,
                monthly_credits: 100,
                last_daily_reset: dayjs.utc().toISOString(),
                last_monthly_reset: dayjs.utc().format('YYYY-MM'),
              },
            ],
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: null });
      });

      const usageMap = await tracker.getAllProvidersUsage();

      expect(usageMap).toBeDefined();
      expect(Object.keys(usageMap)).toContain(AIProvider.REPLICATE);
      expect(Object.keys(usageMap)).toContain(AIProvider.GEMINI);
      expect(Object.keys(usageMap)).toContain(AIProvider.STABILITY_AI);
      expect(Object.keys(usageMap)).toContain(AIProvider.OPENAI);
    });

    it('should handle partial failures when fetching usage', async () => {
      let callCount = 0;
      mockRpc.mockImplementation(() => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            data: [
              {
                daily_requests: 10,
                monthly_credits: 100,
                last_daily_reset: dayjs.utc().toISOString(),
                last_monthly_reset: dayjs.utc().format('YYYY-MM'),
              },
            ],
            error: null,
          });
        }
        return Promise.resolve({ data: null, error: new Error('Failed') });
      });

      const usageMap = await tracker.getAllProvidersUsage();

      expect(Object.keys(usageMap)).toHaveLength(4);
    });
  });

  describe('logProviderUsage', () => {
    it('should log provider usage information', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      mockRpc.mockResolvedValue({
        data: [
          {
            daily_requests: 100,
            monthly_credits: 1000,
            last_daily_reset: dayjs.utc().toISOString(),
            last_monthly_reset: dayjs.utc().format('YYYY-MM'),
          },
        ],
        error: null,
      });

      tracker.logProviderUsage(AIProvider.GEMINI);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(consoleSpy).toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        '[ProviderTracker] gemini:',
        expect.objectContaining({
          daily: expect.any(String),
          monthly: expect.any(String),
          available: expect.any(Boolean),
        })
      );

      consoleSpy.mockRestore();
    });

    it('should handle providers with no limits', async () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      mockRpc.mockResolvedValue({
        data: [
          {
            daily_requests: 0,
            monthly_credits: 0,
            last_daily_reset: dayjs.utc().toISOString(),
            last_monthly_reset: dayjs.utc().format('YYYY-MM'),
          },
        ],
        error: null,
      });

      tracker.logProviderUsage(AIProvider.REPLICATE);

      await new Promise(resolve => setTimeout(resolve, 0));

      expect(consoleSpy).toHaveBeenCalledWith(
        '[ProviderTracker] replicate:',
        expect.objectContaining({
          daily: '0/∞',
          monthly: '0/∞',
        })
      );

      consoleSpy.mockRestore();
    });
  });

  describe('getProviderCreditTracker singleton', () => {
    it('should return same instance on multiple calls', () => {
      const instance1 = getProviderCreditTracker();
      const instance2 = getProviderCreditTracker();

      expect(instance1).toBe(instance2);
    });

    it('should create new instance if none exists', () => {
      const newInstance = getProviderCreditTracker();

      expect(newInstance).toBeInstanceOf(ProviderCreditTracker);
    });
  });

  describe('edge cases and error handling', () => {
    it('should handle null provider gracefully', () => {
      const limits = tracker.getProviderLimits(null as unknown as AIProvider);

      expect(limits).toEqual({
        dailyRequests: 0,
        monthlyCredits: 0,
        hardLimit: false,
        resetTimezone: 'UTC',
      });
    });

    it('should handle undefined provider gracefully', () => {
      const limits = tracker.getProviderLimits(undefined as unknown as AIProvider);

      expect(limits).toEqual({
        dailyRequests: 0,
        monthlyCredits: 0,
        hardLimit: false,
        resetTimezone: 'UTC',
      });
    });

    it('should handle increment with zero values', async () => {
      mockRpc.mockResolvedValue({
        data: [{ success: true, daily_requests_remaining: 500, monthly_credits_remaining: 15000 }],
        error: null,
      });

      const result = await tracker.incrementUsage(AIProvider.GEMINI, 0, 0);

      expect(result.success).toBe(true);
      expect(mockRpc).toHaveBeenCalledWith('increment_provider_usage', {
        p_provider: AIProvider.GEMINI,
        p_requests: 0,
        p_credits: 0,
      });
    });

    it('should handle negative values in increment', async () => {
      mockRpc.mockResolvedValue({
        data: [{ success: true, daily_requests_remaining: 500, monthly_credits_remaining: 15000 }],
        error: null,
      });

      const result = await tracker.incrementUsage(AIProvider.GEMINI, -1, -10);

      expect(result.success).toBe(true);
      expect(mockRpc).toHaveBeenCalledWith('increment_provider_usage', {
        p_provider: AIProvider.GEMINI,
        p_requests: -1,
        p_credits: -10,
      });
    });

    it('should handle very large values in increment', async () => {
      mockRpc.mockResolvedValue({
        data: [{ success: true, daily_requests_remaining: 0, monthly_credits_remaining: 0 }],
        error: null,
      });

      const result = await tracker.incrementUsage(
        AIProvider.GEMINI,
        Number.MAX_SAFE_INTEGER,
        Number.MAX_SAFE_INTEGER
      );

      expect(result.success).toBe(true);
    });
  });

  describe('private method behaviors', () => {
    it('should correctly identify email providers', async () => {
      mockRpc.mockResolvedValue({
        data: [{ success: true, daily_requests_remaining: 250, monthly_credits_remaining: 8500 }],
        error: null,
      });

      await tracker.incrementUsage(EmailProvider.BREVO, 1, 5);

      expect(mockRpc).toHaveBeenCalledWith('increment_email_provider_usage', {
        p_provider: EmailProvider.BREVO,
        p_requests: 1,
        p_credits: 5,
      });
    });

    it('should correctly identify AI providers', async () => {
      mockRpc.mockResolvedValue({
        data: [{ success: true, daily_requests_remaining: 400, monthly_credits_remaining: 14000 }],
        error: null,
      });

      await tracker.incrementUsage(AIProvider.GEMINI, 1, 10);

      expect(mockRpc).toHaveBeenCalledWith('increment_provider_usage', {
        p_provider: AIProvider.GEMINI,
        p_requests: 1,
        p_credits: 10,
      });
    });
  });
});
