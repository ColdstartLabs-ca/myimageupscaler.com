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
  refundReservation: vi.fn(),
  recordDeliverableOutput: vi.fn(),
  processImage: vi.fn(),
  providerAvailability: vi.fn(),
  acquireProviderPermit: vi.fn(),
  recordProviderFailure: vi.fn(),
  recordProviderSuccess: vi.fn(),
  rateLimit: vi.fn(),
  setupPending: vi.fn(),
  track: vi.fn(),
  parseUpscale: vi.fn(),
  getModel: vi.fn(),
  getModelForTier: vi.fn(),
  modelIdToTier: vi.fn(),
  calculateCredits: vi.fn(),
  resolveResolution: vi.fn(),
}));

vi.mock('@server/analytics', () => ({ trackServerEvent: mocks.track }));
vi.mock('@server/monitoring/logger', () => ({
  createLogger: () => ({ error: vi.fn(), flush: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));
vi.mock('@server/rateLimit', () => ({ upscaleRateLimit: { limit: mocks.rateLimit } }));
vi.mock('@server/services/batch-limit.service', () => ({
  batchLimitCheck: {
    checkAndIncrement: mocks.batchCheck,
    getUsage: () => ({
      current: 1,
      limit: 5,
      resetAt: new Date('2026-07-26T21:00:00.000Z'),
    }),
    release: mocks.batchRelease,
  },
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
      getModel: mocks.getModel,
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
  creditManager: {
    refundReservation: mocks.refundReservation,
    recordDeliverableOutput: mocks.recordDeliverableOutput,
  },
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
  calculateFinalProviderAwareCredits: mocks.calculateCredits,
  calculateProviderAwareCredits: mocks.calculateCredits,
  getModelForTier: mocks.getModelForTier,
  modelIdToTier: mocks.modelIdToTier,
  resolveEffectiveResolution: mocks.resolveResolution,
}));
vi.mock('@/lib/anti-freeloader/check-freeloader', () => ({
  isAccountSetupPending: mocks.setupPending,
  isFreeleaderBlocked: () => false,
}));
vi.mock('@shared/validation/upscale.schema', () => ({
  upscaleSchema: {
    parse: mocks.parseUpscale,
  },
  decodeImageDimensions: () => null,
  getBase64PayloadLength: (value: string) =>
    value.length - (value.startsWith('data:') ? value.indexOf(',') + 1 : 0),
  getBase64PayloadOffset: (value: string) =>
    value.startsWith('data:') ? value.indexOf(',') + 1 : 0,
  validateImageDimensions: () => ({ valid: true }),
  validateImageSizeForTier: () => ({ valid: true }),
  // The route enforces the allowlist against the *detected* type, so the double must
  // report one and expose the allowlist it is checked against.
  validateMagicBytes: () => ({ valid: true, detectedMimeType: 'image/jpeg' }),
  IMAGE_VALIDATION: {
    ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
    MAX_REQUEST_BYTES: 16 * 1024 * 1024,
  },
}));

import { POST } from '@/app/api/upscale/route';
import { POST as estimateCredits } from '@/app/api/credit-estimate/route';
import { InsufficientCreditsError } from '@server/services/image-generation.service';
import { ReplicateError } from '@server/services/replicate.service';

function request(): NextRequest {
  return new NextRequest('http://localhost/api/upscale', {
    method: 'POST',
    headers: { 'X-User-Id': 'user-1', 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
}

function requestWithBody(path: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'X-User-Id': 'user-1', 'content-type': 'application/json' },
    body: JSON.stringify(body),
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
    mocks.refundReservation.mockResolvedValue(true);
    mocks.recordDeliverableOutput.mockResolvedValue(true);
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
    mocks.getModelForTier.mockReturnValue('real-esrgan');
    mocks.modelIdToTier.mockReturnValue('quick');
    mocks.calculateCredits.mockReturnValue({
      finalCredits: 1,
      credits: 1,
      effectiveResolution: undefined,
      pricingModel: 'flat',
      providerCostUsd: 0.002,
    });
    mocks.resolveResolution.mockReturnValue(undefined);
    mocks.getModel.mockReturnValue({
      isEnabled: true,
      minTier: 'free',
      supportedScales: [2],
      tierRestriction: null,
    });
    mocks.parseUpscale.mockReturnValue({
      imageData: 'aGVsbG8=',
      mimeType: 'image/jpeg',
      config: {
        qualityTier: 'quick',
        scale: 2,
        additionalOptions: { smartAnalysis: false, enhance: true },
      },
    });
  });

  it('charges the same 25 credits priced for an ultra 4K override', async () => {
    const paidProfile = profile({
      subscription_status: 'active',
      subscription_tier: 'pro',
      subscription_credits_balance: 100,
    });
    mocks.from.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: paidProfile, error: null }),
          maybeSingle: async () => ({ data: { user_id: 'user-1' }, error: null }),
        }),
      }),
    }));
    mocks.parseUpscale.mockReturnValue({
      imageData: 'aGVsbG8=',
      mimeType: 'image/jpeg',
      config: {
        qualityTier: 'ultra',
        scale: 2,
        additionalOptions: { smartAnalysis: false, enhance: true },
        nanoBananaProConfig: { resolution: '4K' },
      },
    });
    mocks.getModelForTier.mockReturnValue('nano-banana-pro');
    mocks.getModel.mockReturnValue({
      isEnabled: true,
      minTier: 'pro',
      supportedScales: [2, 4, 8],
      tierRestriction: 'pro',
      capabilities: ['upscale'],
      displayName: 'Upscale Ultra',
    });
    mocks.resolveResolution.mockReturnValue('4K');
    mocks.calculateCredits.mockReturnValue({
      finalCredits: 25,
      credits: 25,
      effectiveResolution: '4K',
      pricingModel: 'per-resolution',
      providerCostUsd: 0.3,
    });
    mocks.processImage.mockImplementation(async (_userId, _input, options) => {
      options?.onCreditsDeducted?.({
        amount: 25,
        newBalance: 75,
        jobId: '11111111-1111-4111-8111-111111111111',
        subscriptionAmount: 25,
        purchasedAmount: 0,
      });
      return {
        imageUrl: 'https://output.test/result.png',
        mimeType: 'image/png',
        creditsRemaining: 75,
      };
    });

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.processing.creditsUsed).toBe(25);
    expect(mocks.processImage).toHaveBeenCalledWith(
      'user-1',
      expect.anything(),
      expect.objectContaining({
        creditCost: 25,
        costAttribution: expect.objectContaining({
          effectiveResolution: '4K',
          creditsCharged: 25,
        }),
      })
    );
  });

  it('quotes and charges identically for the same smart-analysis 4K payload', async () => {
    const payload = {
      imageData: 'aGVsbG8=',
      mimeType: 'image/jpeg',
      config: {
        qualityTier: 'ultra',
        scale: 2,
        additionalOptions: { smartAnalysis: true, enhance: true },
        nanoBananaProConfig: { resolution: '4K' },
      },
    };
    const paidProfile = profile({
      subscription_status: 'active',
      subscription_tier: 'pro',
      subscription_credits_balance: 100,
      credits_balance: 100,
    });
    mocks.from.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: paidProfile, error: null }),
          maybeSingle: async () => ({ data: { user_id: 'user-1' }, error: null }),
        }),
      }),
    }));
    mocks.parseUpscale.mockReturnValue(payload);
    mocks.getModelForTier.mockReturnValue('nano-banana-pro');
    mocks.modelIdToTier.mockReturnValue('ultra');
    mocks.getModel.mockReturnValue({
      isEnabled: true,
      minTier: 'pro',
      supportedScales: [2, 4, 8],
      tierRestriction: 'pro',
      capabilities: ['upscale'],
      displayName: 'Upscale Ultra',
      processingTimeMs: 30_000,
    });
    mocks.resolveResolution.mockReturnValue('4K');
    mocks.calculateCredits.mockReturnValue({
      finalCredits: 26,
      credits: 26,
      effectiveResolution: '4K',
      pricingModel: 'per-resolution',
      providerCostUsd: 0.3,
    });
    mocks.processImage.mockImplementation(async (_userId, _input, options) => {
      options?.onCreditsDeducted?.({
        amount: 26,
        newBalance: 74,
        jobId: '22222222-2222-4222-8222-222222222222',
        subscriptionAmount: 26,
        purchasedAmount: 0,
      });
      return {
        imageUrl: 'https://output.test/result.png',
        mimeType: 'image/png',
        creditsRemaining: 74,
      };
    });

    const estimateResponse = await estimateCredits(
      requestWithBody('/api/credit-estimate', payload)
    );
    const estimate = await estimateResponse.json();
    const estimatePricingInput = mocks.calculateCredits.mock.calls.at(-1)?.[0];

    const upscaleResponse = await POST(requestWithBody('/api/upscale', payload));
    const upscale = await upscaleResponse.json();
    const upscalePricingInput = mocks.calculateCredits.mock.calls.at(-1)?.[0];

    expect(estimateResponse.status).toBe(200);
    expect(upscaleResponse.status).toBe(200);
    expect(estimate.breakdown.totalCredits).toBe(26);
    expect(upscale.processing.creditsUsed).toBe(26);
    expect(upscalePricingInput).toEqual(estimatePricingInput);
  }, 15_000);

  it('should reject scale 8 for seedream', async () => {
    const paidProfile = profile({
      subscription_status: 'active',
      subscription_tier: 'hobby',
      subscription_credits_balance: 100,
    });
    mocks.from.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: paidProfile, error: null }),
          maybeSingle: async () => ({ data: { user_id: 'user-1' }, error: null }),
        }),
      }),
    }));
    mocks.parseUpscale.mockReturnValue({
      imageData: 'aGVsbG8=',
      mimeType: 'image/jpeg',
      config: {
        qualityTier: 'seedream-edit',
        scale: 8,
        additionalOptions: { smartAnalysis: false, enhance: true },
      },
    });
    mocks.getModelForTier.mockReturnValue('seedream');
    mocks.getModel.mockReturnValue({
      isEnabled: true,
      minTier: 'hobby',
      supportedScales: [],
      tierRestriction: 'hobby',
    });

    const response = await POST(request());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'VALIDATION_ERROR' },
    });
    expect(mocks.processImage).not.toHaveBeenCalled();
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

    const processingFailures = mocks.track.mock.calls.filter(
      ([eventName]) => eventName === 'processing_failed'
    );
    expect(processingFailures).toHaveLength(1);
    expect(processingFailures[0][1]).toEqual(
      expect.objectContaining({
        errorType: 'provider_unavailable',
        reason: 'provider_unavailable',
        provider: 'unknown',
        model: 'real-esrgan',
        qualityTier: 'quick',
        retryable: true,
        requestId: 'unknown',
      })
    );
    expect(JSON.stringify(processingFailures)).not.toContain('api.replicate.com');
  });

  it.each([
    ['authentication', 'AUTHENTICATION_FAILED', 403, 'authentication'],
    ['rate limiting', 'RATE_LIMITED', 429, 'rate_limited'],
  ])(
    'returns the support-only outage state for provider %s failures',
    async (_failureName, replicateCode, providerStatus, expectedFailureKind) => {
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
        new ReplicateError(
          'Raw Replicate failure: buy credits at https://replicate.com/account/billing.',
          replicateCode,
          providerStatus
        )
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
      expect(mocks.recordProviderFailure).toHaveBeenCalledWith(expectedFailureKind);
    }
  );

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
    expect(mocks.refundReservation).not.toHaveBeenCalled();
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
    expect(mocks.refundReservation).toHaveBeenCalled();
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
