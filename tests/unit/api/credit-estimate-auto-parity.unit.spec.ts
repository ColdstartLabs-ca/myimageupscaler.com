import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  acquireProviderPermit: vi.fn(),
  analyze: vi.fn(),
  batchCheck: vi.fn(),
  batchRelease: vi.fn(),
  decodeImageDimensions: vi.fn(),
  ensureProfile: vi.fn(),
  from: vi.fn(),
  processImage: vi.fn(),
  providerAvailability: vi.fn(),
  providerFailure: vi.fn(),
  providerSuccess: vi.fn(),
  rateLimit: vi.fn(),
  recordDeliverableOutput: vi.fn(),
  removeUpscaleInput: vi.fn(),
  resolveScalePreservingModel: vi.fn(),
  resolveUpscaleInput: vi.fn(),
  track: vi.fn(),
  validateMagicBytes: vi.fn(),
  createProcessorForModel: vi.fn(),
  setupPending: vi.fn(),
  AIGenerationError: class AIGenerationError extends Error {},
  InsufficientCreditsError: class InsufficientCreditsError extends Error {},
  ReplicateError: class ReplicateError extends Error {
    code = 'UNKNOWN';
  },
}));

vi.mock('@server/analytics', () => ({ trackServerEvent: mocks.track }));
vi.mock('@server/monitoring/logger', () => ({
  createLogger: () => ({ error: vi.fn(), flush: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));
vi.mock('@server/rateLimit', () => ({ upscaleRateLimit: { limit: mocks.rateLimit } }));
vi.mock('@server/services/batch-limit.service', () => ({
  batchLimitCheck: {
    checkAndIncrement: mocks.batchCheck,
    getUsage: () => ({ current: 0, limit: 5, resetAt: new Date(Date.now() + 60_000) }),
    release: mocks.batchRelease,
  },
}));
vi.mock('@server/services/anti-freeloader.service', () => ({
  ensureAntiFreeloaderProfile: mocks.ensureProfile,
}));
vi.mock('@server/services/image-generation.service', () => ({
  AIGenerationError: mocks.AIGenerationError,
  InsufficientCreditsError: mocks.InsufficientCreditsError,
}));
vi.mock('@server/services/image-processor.factory', () => ({
  ImageProcessorFactory: { createProcessorForModel: mocks.createProcessorForModel },
}));
vi.mock('@server/services/llm-image-analyzer', () => ({
  LLMImageAnalyzer: class {
    analyze(...args: unknown[]) {
      return mocks.analyze(...args);
    }
  },
}));
vi.mock('@server/services/provider-health.service', () => ({
  providerHealthService: {
    getAvailability: mocks.providerAvailability,
    acquireProcessingPermit: mocks.acquireProviderPermit,
    recordFailure: mocks.providerFailure,
    recordSuccess: mocks.providerSuccess,
  },
}));
vi.mock('@server/services/replicate.service', () => ({ ReplicateError: mocks.ReplicateError }));
vi.mock('@server/services/replicate/utils/credit-manager', () => ({
  creditManager: {
    recordDeliverableOutput: mocks.recordDeliverableOutput,
  },
}));
vi.mock('@server/services/scale-preserving-model', () => ({
  getScalePreservingFallbackCandidates: () => [],
  resolveScalePreservingModel: mocks.resolveScalePreservingModel,
}));
vi.mock('@server/services/upscale-input-storage.service', () => ({
  removeUpscaleInput: mocks.removeUpscaleInput,
  resolveUpscaleInput: mocks.resolveUpscaleInput,
}));
vi.mock('@server/supabase/supabaseAdmin', () => ({ supabaseAdmin: { from: mocks.from } }));
vi.mock('@/lib/anti-freeloader/check-freeloader', () => ({
  isAccountSetupPending: mocks.setupPending,
  isFreeleaderBlocked: () => false,
}));
vi.mock('@shared/validation/upscale.schema', async () => {
  const actual = await vi.importActual<typeof import('@shared/validation/upscale.schema')>(
    '@shared/validation/upscale.schema'
  );
  return {
    ...actual,
    decodeImageDimensions: mocks.decodeImageDimensions,
    validateMagicBytes: mocks.validateMagicBytes,
  };
});

import { POST as estimateCredits } from '@/app/api/credit-estimate/route';
import { POST as upscale } from '@/app/api/upscale/route';
import { ModelRegistry } from '@server/services/model-registry';
import { calculateFinalProviderAwareCredits } from '@shared/config/subscription.utils';

const USER_ID = '00000000-0000-4000-8000-000000000001';
const JOB_ID = '99999999-9999-4999-8999-999999999999';

function request(path: string, body: unknown): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: { 'X-User-Id': USER_ID, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function profile(
  overrides: Partial<{
    subscription_status: string | null;
    subscription_tier: string | null;
    subscription_credits_balance: number;
    purchased_credits_balance: number;
    is_flagged_freeloader: boolean;
    region_tier: string | null;
    signup_country: string | null;
    created_at: string;
  }> = {}
) {
  return {
    subscription_status: 'active',
    subscription_tier: 'hobby',
    subscription_credits_balance: 5,
    purchased_credits_balance: 0,
    is_flagged_freeloader: false,
    region_tier: 'standard',
    signup_country: 'CA',
    created_at: '2026-07-17T00:00:00.000Z',
    ...overrides,
  };
}

describe('Auto credit estimate and deduction parity', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockResolvedValue({ success: true, remaining: 4, reset: Date.now() + 60_000 });
    mocks.batchCheck.mockResolvedValue({
      allowed: true,
      current: 0,
      limit: 5,
      resetAt: new Date(Date.now() + 60_000),
    });
    mocks.batchRelease.mockResolvedValue(true);
    mocks.providerAvailability.mockResolvedValue({ available: true, status: 'closed', retryAt: null });
    mocks.acquireProviderPermit.mockResolvedValue(true);
    mocks.providerFailure.mockResolvedValue(true);
    mocks.providerSuccess.mockResolvedValue(true);
    mocks.recordDeliverableOutput.mockResolvedValue(true);
    mocks.removeUpscaleInput.mockResolvedValue(undefined);
    mocks.setupPending.mockReturnValue(false);
    mocks.ensureProfile.mockImplementation((_request, _userId, rawProfile) => rawProfile);
    mocks.resolveUpscaleInput.mockResolvedValue({
      imageReference: 'https://storage.example/signed-input?token=abc',
      validationImageData: 'iVBORw0KGgoAAAANSUhEUg==',
      sizeBytes: 1024,
      mimeType: 'image/png',
    });
    mocks.decodeImageDimensions.mockReturnValue({ width: 64, height: 64 });
    mocks.validateMagicBytes.mockReturnValue({ valid: true, detectedMimeType: 'image/png' });
    mocks.resolveScalePreservingModel.mockReturnValue({
      modelId: 'nano-banana',
      usedFallback: false,
    });
    mocks.from.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: profile(), error: null }),
          maybeSingle: async () => ({ data: { user_id: USER_ID }, error: null }),
        }),
      }),
      insert: async () => ({ error: null }),
    }));
    mocks.createProcessorForModel.mockReturnValue({
      providerName: 'Replicate',
      processImage: mocks.processImage,
    });
  });

  it('quotes a document Auto request at the same Nano Banana cost the live route deducts', async () => {
    const registry = ModelRegistry.getInstance();
    registry.reset();
    expect(
      registry.recommendModel({ contentType: 'document' }, 'free', 'both', 2).recommendedModel
    ).toBe('nano-banana');
    expect(
      calculateFinalProviderAwareCredits({
        modelId: 'nano-banana',
        qualityTier: 'quick',
        scale: 2,
      }).finalCredits
    ).toBe(2);

    const autoEstimate = await estimateCredits(
      request('/api/credit-estimate', {
        config: {
          mode: 'both',
          scale: 2,
          qualityTier: 'auto',
          selectedModel: 'auto',
          additionalOptions: { smartAnalysis: true },
        },
        analysisHint: { contentType: 'document' },
      })
    );
    const estimateBody = await autoEstimate.json();

    const legacyAutoEstimate = await estimateCredits(
      request('/api/credit-estimate', {
        config: {
          mode: 'both',
          scale: 2,
          selectedModel: 'auto',
          additionalOptions: { smartAnalysis: true },
        },
        analysisHint: { contentType: 'document' },
      })
    );
    const legacyEstimateBody = await legacyAutoEstimate.json();

    mocks.analyze.mockResolvedValue({
      recommendedModel: 'nano-banana',
      issues: [{ type: 'text', severity: 'high' }],
      enhancementPrompt: 'Preserve text and logos.',
    });
    let deductedCredits: number | undefined;
    mocks.processImage.mockImplementation(async (_userId, _input, options) => {
      deductedCredits = options.creditCost;
      options.onCreditsDeducted?.({
        amount: options.creditCost,
        subscriptionAmount: options.creditCost,
        purchasedAmount: 0,
        jobId: JOB_ID,
      });
      return {
        imageUrl: 'https://replicate.delivery/nano-banana.png',
        mimeType: 'image/png',
        expiresAt: 1795737600000,
        creditsRemaining: 3,
      };
    });

    vi.useFakeTimers();
    try {
      const upscalePromise = upscale(
        request('/api/upscale', {
          storagePath: `${USER_ID}/${JOB_ID}.png`,
          jobId: JOB_ID,
          mimeType: 'image/png',
          config: {
            qualityTier: 'auto',
            scale: 2,
            // Preserve the stale client flag to prove Auto does not add a
            // second smart-analysis surcharge after model resolution.
            additionalOptions: { smartAnalysis: true },
          },
        })
      );
      await vi.advanceTimersByTimeAsync(5000);
      const upscaleResponse = await upscalePromise;
      const upscaleBody = await upscaleResponse.json();

      expect(autoEstimate.status).toBe(200);
      expect(estimateBody.breakdown.totalCredits).toBe(2);
      expect(legacyAutoEstimate.status).toBe(200);
      expect(legacyEstimateBody.breakdown.totalCredits).toBe(2);
      expect(upscaleResponse.status).toBe(200);
      expect(upscaleBody.processing.creditsUsed).toBe(2);
      expect(deductedCredits).toBe(estimateBody.breakdown.totalCredits);
      expect(mocks.analyze).toHaveBeenCalledWith(
        'https://storage.example/signed-input?token=abc',
        'image/png',
        expect.arrayContaining(['nano-banana']),
        true
      );
    } finally {
      vi.useRealTimers();
    }
  }, 15_000);

  it('allows free Auto requests when the client sends a stale smart-analysis flag', async () => {
    const freeProfile = profile({
      subscription_status: null,
      subscription_tier: null,
      subscription_credits_balance: 1,
      purchased_credits_balance: 0,
    });
    mocks.from.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: freeProfile, error: null }),
          maybeSingle: async () => ({ data: { user_id: USER_ID }, error: null }),
        }),
      }),
      insert: async () => ({ error: null }),
    }));
    mocks.ensureProfile.mockReturnValue(freeProfile);
    mocks.analyze.mockResolvedValue({
      recommendedModel: 'real-esrgan',
      issues: [],
      enhancementPrompt: undefined,
    });
    mocks.processImage.mockImplementation(async (_userId, _input, options) => {
      options.onCreditsDeducted?.({
        amount: options.creditCost,
        subscriptionAmount: options.creditCost,
        purchasedAmount: 0,
        jobId: JOB_ID,
      });
      return {
        imageUrl: 'https://replicate.delivery/real-esrgan.png',
        mimeType: 'image/png',
        expiresAt: 1795737600000,
        creditsRemaining: 0,
      };
    });

    vi.useFakeTimers();
    try {
      const responsePromise = upscale(
        request('/api/upscale', {
          storagePath: `${USER_ID}/${JOB_ID}.png`,
          jobId: JOB_ID,
          mimeType: 'image/png',
          config: {
            qualityTier: 'auto',
            scale: 2,
            additionalOptions: { smartAnalysis: true },
          },
        })
      );
      await vi.advanceTimersByTimeAsync(5000);
      const response = await responsePromise;
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.processing.creditsUsed).toBe(1);
      expect(mocks.analyze).toHaveBeenCalledWith(
        'https://storage.example/signed-input?token=abc',
        'image/png',
        expect.arrayContaining(['real-esrgan']),
        true
      );
    } finally {
      vi.useRealTimers();
    }
  }, 15_000);
});
