import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  batchCheck: vi.fn(),
  batchRelease: vi.fn(),
  ensureProfile: vi.fn(),
  from: vi.fn(),
  InsufficientCreditsError: class InsufficientCreditsError extends Error {
    availableCredits?: number;

    constructor(message: string, availableCredits?: number) {
      super(message);
      this.availableCredits = availableCredits;
    }
  },
  ReplicateError: class ReplicateError extends Error {
    code: string;
    providerStatus?: number;

    constructor(message: string, code: string, providerStatus?: number) {
      super(message);
      this.name = 'ReplicateError';
      this.code = code;
      this.providerStatus = providerStatus;
    }
  },
  refundCredits: vi.fn(),
  processImage: vi.fn(),
  providerAvailability: vi.fn(),
  acquireProviderPermit: vi.fn(),
  recordProviderFailure: vi.fn(),
  recordProviderSuccess: vi.fn(),
  rateLimit: vi.fn(),
  setupPending: vi.fn(),
  track: vi.fn(),
}));

vi.mock('@server/analytics', () => ({ trackServerEvent: mocks.track }));
vi.mock('@server/monitoring/logger', () => ({
  createLogger: () => ({ error: vi.fn(), flush: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));
vi.mock('@server/rateLimit', () => ({ upscaleRateLimit: { limit: mocks.rateLimit } }));
vi.mock('@server/services/batch-limit.service', () => ({
  batchLimitCheck: { checkAndIncrement: mocks.batchCheck, release: mocks.batchRelease },
}));
vi.mock('@server/services/anti-freeloader.service', () => ({
  ensureAntiFreeloaderProfile: mocks.ensureProfile,
}));
vi.mock('@server/services/image-generation.service', () => ({
  AIGenerationError: class AIGenerationError extends Error {},
  InsufficientCreditsError: mocks.InsufficientCreditsError,
}));
vi.mock('@server/services/image-processor.factory', () => ({
  ImageProcessorFactory: {
    createProcessorForModel: () => ({ providerName: 'test', processImage: mocks.processImage }),
    createProcessor: () => ({ providerName: 'test', processImage: mocks.processImage }),
  },
}));
vi.mock('@server/services/llm-image-analyzer', () => ({ LLMImageAnalyzer: class {} }));
vi.mock('@server/services/model-registry', () => ({
  ModelRegistry: {
    getInstance: () => ({
      getMaxInputPixels: () => Number.MAX_SAFE_INTEGER,
      getModel: () => ({ isEnabled: true, minTier: 'free', supportedScales: [2] }),
      getModelsByTier: () => [],
    }),
  },
}));
vi.mock('@server/services/provider-health.service', () => ({
  providerHealthService: {
    getAvailability: mocks.providerAvailability,
    acquireProcessingPermit: mocks.acquireProviderPermit,
    recordFailure: mocks.recordProviderFailure,
    recordSuccess: mocks.recordProviderSuccess,
  },
}));
vi.mock('@server/services/replicate.service', () => ({
  ReplicateError: mocks.ReplicateError,
}));
vi.mock('@server/services/scale-preserving-model', () => ({
  resolveScalePreservingModel: () => ({ usedFallback: false, modelId: 'real-esrgan' }),
}));
vi.mock('@server/services/replicate/utils/credit-manager', () => ({
  creditManager: { refundCredits: mocks.refundCredits },
}));
vi.mock('@server/supabase/supabaseAdmin', () => ({ supabaseAdmin: { from: mocks.from } }));
vi.mock('@shared/config/env', () => ({
  isProduction: () => false,
  serverEnv: { AMPLITUDE_API_KEY: 'test-key', ENV: 'test' },
}));
vi.mock('@shared/config/model-costs.config', () => ({
  MODEL_COSTS: { PREMIUM_QUALITY_TIERS: [], SMART_ANALYSIS_REQUIRES_PAID: false },
}));
vi.mock('@shared/config/subscription.utils', () => ({
  calculateFinalProviderAwareCredits: () => ({ finalCredits: 1 }),
  getModelForTier: () => 'real-esrgan',
}));
vi.mock('@/lib/anti-freeloader/check-freeloader', () => ({
  isAccountSetupPending: mocks.setupPending,
  isFreeleaderBlocked: () => false,
}));
vi.mock('@shared/validation/upscale.schema', () => ({
  upscaleSchema: {
    parse: () => ({
      imageData: 'aGVsbG8=',
      mimeType: 'image/jpeg',
      config: {
        qualityTier: 'quick',
        scale: 2,
        additionalOptions: { smartAnalysis: false, enhance: true },
      },
    }),
  },
  decodeImageDimensions: () => null,
  validateImageDimensions: () => ({ valid: true }),
  validateImageSizeForTier: () => ({ valid: true }),
  // The route enforces the allowlist against the *detected* type, so the double must
  // report one and expose the allowlist it is checked against.
  validateMagicBytes: () => ({ valid: true, detectedMimeType: 'image/jpeg' }),
  IMAGE_VALIDATION: { ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'] },
}));

import { POST } from '@/app/api/upscale/route';
import { InsufficientCreditsError } from '@server/services/image-generation.service';
import { ReplicateError } from '@server/services/replicate.service';

function request(): NextRequest {
  return new NextRequest('http://localhost/api/upscale', {
    method: 'POST',
    headers: { 'X-User-Id': 'user-1', 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
}

function profile(overrides: Record<string, unknown> = {}) {
  return {
    subscription_status: null,
    subscription_tier: null,
    subscription_credits_balance: 0,
    purchased_credits_balance: 0,
    is_flagged_freeloader: false,
    region_tier: 'standard',
    signup_country: 'CA',
    created_at: '2026-07-17T00:00:00.000Z',
    ...overrides,
  };
}

describe('POST /api/upscale free limit errors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockResolvedValue({ success: true, remaining: 4, reset: Date.now() + 60_000 });
    mocks.setupPending.mockReturnValue(false);
    mocks.refundCredits.mockResolvedValue(true);
    mocks.providerAvailability.mockResolvedValue({
      available: true,
      status: 'closed',
      retryAt: null,
    });
    mocks.acquireProviderPermit.mockResolvedValue(true);
    mocks.recordProviderFailure.mockResolvedValue(true);
    mocks.recordProviderSuccess.mockResolvedValue(true);
    mocks.batchCheck.mockResolvedValue({
      allowed: true,
      current: 0,
      limit: 5,
      resetAt: new Date(Date.now() + 60_000),
    });
    mocks.batchRelease.mockResolvedValue(true);
    mocks.from.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: profile(), error: null }),
          maybeSingle: async () => ({ data: { user_id: 'user-1' }, error: null }),
        }),
      }),
    }));
    mocks.ensureProfile.mockImplementation((_req, _userId, rawProfile) => rawProfile);
  });

  it('returns account setup pending for a provisional zero profile', async () => {
    mocks.setupPending.mockReturnValue(true);

    const response = await POST(request());

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'ACCOUNT_SETUP_PENDING' },
    });
    expect(mocks.rateLimit).not.toHaveBeenCalled();
    expect(mocks.batchCheck).not.toHaveBeenCalled();
    expect(mocks.processImage).not.toHaveBeenCalled();
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it('reads the grant decision before the credit profile', async () => {
    const reads: string[] = [];
    mocks.from.mockImplementation((table: string) => ({
      select: () => ({
        eq: () => ({
          single: async () => {
            reads.push(table);
            return { data: profile(), error: null };
          },
          maybeSingle: async () => {
            reads.push(table);
            return { data: null, error: null };
          },
        }),
      }),
    }));
    mocks.setupPending.mockReturnValue(true);

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(reads).toEqual(['free_credit_grants', 'profiles']);
  });

  it('returns INSUFFICIENT_CREDITS at zero free credits', async () => {
    const response = await POST(request());

    expect(response.status).toBe(402);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'INSUFFICIENT_CREDITS', details: { required: 1, available: 0 } },
    });
    expect(mocks.track).toHaveBeenCalledWith(
      'credit_wall_shown',
      {
        source: 'server_402',
        requiredCredits: 1,
        currentBalance: 0,
        deficit: 1,
      },
      { apiKey: 'test-key', userId: 'user-1' }
    );
  });

  it('keeps INSUFFICIENT_CREDITS for a paid user with zero current balance', async () => {
    const paidZeroProfile = profile({ subscription_status: 'active', subscription_tier: 'hobby' });
    mocks.from.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: paidZeroProfile, error: null }),
          maybeSingle: async () => ({ data: { user_id: 'user-1' }, error: null }),
        }),
      }),
    }));

    const response = await POST(request());

    expect(response.status).toBe(402);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'INSUFFICIENT_CREDITS', details: { required: 1, available: 0 } },
    });
  });

  it('keeps INSUFFICIENT_CREDITS for a former paid plan with zero current balance', async () => {
    const formerPaidProfile = profile({
      subscription_status: 'canceled',
      subscription_tier: 'hobby',
    });
    mocks.from.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: formerPaidProfile, error: null }),
          maybeSingle: async () => ({ data: { user_id: 'user-1' }, error: null }),
        }),
      }),
    }));

    const response = await POST(request());

    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'INSUFFICIENT_CREDITS' },
    });
  });

  it('uses a zero balance reported by the atomic deduction after a stale precheck', async () => {
    const oneCreditProfile = profile({ subscription_credits_balance: 1 });
    mocks.from.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: oneCreditProfile, error: null }),
          maybeSingle: async () => ({ data: { user_id: 'user-1' }, error: null }),
        }),
      }),
    }));
    mocks.processImage.mockRejectedValue(
      new InsufficientCreditsError('Insufficient credits. Required: 1, Available: 0', 0)
    );

    const response = await POST(request());

    expect(response.status).toBe(402);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'INSUFFICIENT_CREDITS', details: { required: 1, available: 0 } },
    });
    expect(mocks.track).toHaveBeenCalledWith(
      'credit_wall_shown',
      {
        source: 'server_402',
        requiredCredits: 1,
        currentBalance: 0,
        deficit: 1,
      },
      { apiKey: 'test-key', userId: 'user-1' }
    );
  });

  it('returns a vendor-neutral response for a provider 402', async () => {
    const oneCreditProfile = profile({ subscription_credits_balance: 1 });
    mocks.from.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: oneCreditProfile, error: null }),
          maybeSingle: async () => ({ data: { user_id: 'user-1' }, error: null }),
        }),
      }),
    }));
    mocks.processImage.mockImplementation(
      async (
        _userId: string,
        _input: unknown,
        options: { onCreditsDeducted?: (deduction: Record<string, unknown>) => void }
      ) => {
        options.onCreditsDeducted?.({
          amount: 1,
          subscriptionAmount: 1,
          purchasedAmount: 0,
          jobId: 'job-402',
        });
        throw new ReplicateError(
          'Request to https://api.replicate.com failed with 402. Buy credits at https://replicate.com/account/billing.',
          'PROVIDER_UNAVAILABLE',
          402
        );
      }
    );

    const response = await POST(request());
    const payload = await response.json();

    expect(response.status).toBe(503);
    expect(payload).toEqual({
      success: false,
      error: {
        code: 'AI_UNAVAILABLE',
        message:
          'Image processing is temporarily unavailable due to a provider issue. Your credits have not been charged. Please try again shortly or contact our support team.',
      },
    });
    expect(JSON.stringify(payload)).not.toMatch(/replicate|https?:\/\/|buy|purchase|billing/i);
    expect(mocks.batchRelease).toHaveBeenCalledWith('user-1');
    expect(mocks.recordProviderFailure).toHaveBeenCalledWith('billing');
  });

  it('releases the hourly slot when an internal failure happens before credit deduction', async () => {
    const oneCreditProfile = profile({ subscription_credits_balance: 1 });
    mocks.from.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: oneCreditProfile, error: null }),
          maybeSingle: async () => ({ data: { user_id: 'user-1' }, error: null }),
        }),
      }),
    }));
    mocks.processImage.mockRejectedValue(new Error('Internal processor setup failure'));

    const response = await POST(request());

    expect(response.status).toBe(500);
    expect(mocks.refundCredits).not.toHaveBeenCalled();
    expect(mocks.batchRelease).toHaveBeenCalledWith('user-1');
  });

  it('keeps the hourly slot for a safety-filter rejection', async () => {
    const oneCreditProfile = profile({ subscription_credits_balance: 1 });
    mocks.from.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: oneCreditProfile, error: null }),
          maybeSingle: async () => ({ data: { user_id: 'user-1' }, error: null }),
        }),
      }),
    }));
    mocks.processImage.mockImplementation(
      async (
        _userId: string,
        _input: unknown,
        options: { onCreditsDeducted?: (deduction: Record<string, unknown>) => void }
      ) => {
        options.onCreditsDeducted?.({
          amount: 1,
          subscriptionAmount: 1,
          purchasedAmount: 0,
          jobId: 'job-safety',
        });
        throw new ReplicateError('raw provider safety detail', 'SAFETY');
      }
    );

    const response = await POST(request());

    expect(response.status).toBe(422);
    expect(mocks.refundCredits).toHaveBeenCalled();
    expect(mocks.batchRelease).not.toHaveBeenCalled();
    expect(mocks.recordProviderFailure).not.toHaveBeenCalled();
  });

  it('serves maintenance before consuming quota while the circuit is open', async () => {
    mocks.providerAvailability.mockResolvedValue({
      available: false,
      status: 'open',
      retryAt: new Date('2026-07-26T20:00:00Z'),
    });

    const response = await POST(request());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      success: false,
      error: {
        code: 'AI_UNAVAILABLE',
        message:
          'Image processing is temporarily unavailable due to a provider issue. Your credits have not been charged. Please try again shortly or contact our support team.',
        details: {
          providerUnavailable: true,
          suppressPurchaseCtas: true,
          retryAt: '2026-07-26T20:00:00.000Z',
        },
      },
    });
    expect(mocks.batchCheck).not.toHaveBeenCalled();
    expect(mocks.processImage).not.toHaveBeenCalled();
  });
});
