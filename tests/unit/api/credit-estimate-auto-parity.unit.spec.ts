import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  acquireProviderPermit: vi.fn(),
  analyze: vi.fn(),
  batchCheck: vi.fn(),
  batchRelease: vi.fn(),
  decodeImageDimensions: vi.fn(),
  ensureProfile: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  fetch: vi.fn(),
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
vi.mock('@server/services/scale-preserving-model', async importOriginal => ({
  ...(await importOriginal<typeof import('@server/services/scale-preserving-model')>()),
  getScalePreservingFallbackCandidates: () => [],
  resolveScalePreservingModel: mocks.resolveScalePreservingModel,
}));
vi.mock('@server/services/upscale-input-storage.service', () => ({
  removeUpscaleInput: mocks.removeUpscaleInput,
  resolveUpscaleInput: mocks.resolveUpscaleInput,
}));
vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: { from: mocks.from, rpc: mocks.rpc },
}));
vi.mock('@shared/config/env', () => ({
  isProduction: () => false,
  serverEnv: {
    ENV: 'test',
    REPLICATE_API_TOKEN: 'provider-fixture-token',
    ENABLE_PREMIUM_MODELS: true,
    MODEL_FOR_GENERAL_UPSCALE: 'real-esrgan',
    MODEL_FOR_TEXT_LOGOS: 'nano-banana',
  },
  clientEnv: {},
}));
vi.unmock('dayjs');
vi.unmock('dayjs/plugin/utc');
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
    let reservation: Record<string, unknown> | undefined;
    const state = () => ({
      outcome: 'found',
      reservation,
      balance: { subscription: 3, purchased: 0, total: 3 },
    });
    mocks.rpc.mockImplementation(async (name, args) => {
      if (name === 'read_async_upscale_job') {
        return { data: reservation ? state() : { outcome: 'new' }, error: null };
      }
      if (name === 'admit_async_upscale_job') {
        reservation = {
          job_id: args.p_job_id,
          user_id: args.p_user_id,
          amount: args.p_amount,
          status: 'processing',
          provider_phase: 'submitting',
          attempt_id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          attempt_started_at: new Date().toISOString(),
          execution_deadline_at: new Date(Date.now() + 900000).toISOString(),
          resolved_model: args.p_resolved_model,
          quality_tier: args.p_quality_tier,
          result_context: args.p_result_context,
          async_delivery_token: args.p_delivery_token,
        };
        return { data: { ...state(), outcome: 'admitted' }, error: null };
      }
      if (name === 'record_async_upscale_prediction' && reservation) {
        reservation.provider_phase = 'processing';
        reservation.provider_prediction_id = args.p_prediction_id;
        return { data: true, error: null };
      }
      if (name === 'claim_async_upscale_observation') {
        return {
          data: {
            ...state(),
            claimed: true,
            observation_token: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          },
          error: null,
        };
      }
      if (name === 'apply_async_upscale_observation') {
        return { data: { ...state(), transitioned: false }, error: null };
      }
      throw new Error(`Unexpected RPC in pricing parity test: ${name}`);
    });
    mocks.fetch.mockImplementation(async () =>
      Response.json({ id: 'fixture-prediction', status: 'starting' })
    );
    vi.stubGlobal('fetch', mocks.fetch);
    mocks.rateLimit.mockResolvedValue({ success: true, remaining: 4, reset: Date.now() + 60_000 });
    mocks.batchCheck.mockResolvedValue({
      allowed: true,
      current: 0,
      limit: 5,
      resetAt: new Date(Date.now() + 60_000),
    });
    mocks.batchRelease.mockResolvedValue(true);
    mocks.providerAvailability.mockResolvedValue({
      available: true,
      status: 'closed',
      retryAt: null,
    });
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

  afterEach(() => {
    vi.unstubAllGlobals();
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
      expect(upscaleResponse.status).toBe(202);
      expect(upscaleBody).toMatchObject({ jobId: JOB_ID, status: 'processing' });
      const admission = mocks.rpc.mock.calls.find(
        ([name]) => name === 'admit_async_upscale_job'
      )?.[1];
      expect(admission).toMatchObject({
        p_resolved_model: 'nano-banana',
        p_quality_tier: 'quick',
        p_amount: estimateBody.breakdown.totalCredits,
      });
      expect(mocks.processImage).not.toHaveBeenCalled();
      expect(mocks.fetch).toHaveBeenCalledOnce();
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

      expect(response.status).toBe(202);
      expect(body).toMatchObject({ jobId: JOB_ID, status: 'processing' });
      const admission = mocks.rpc.mock.calls.find(
        ([name]) => name === 'admit_async_upscale_job'
      )?.[1];
      expect(admission).toMatchObject({ p_resolved_model: 'real-esrgan', p_amount: 1 });
      expect(mocks.processImage).not.toHaveBeenCalled();
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

  it('quotes Clarity Pro with the same decoded dimensions the live route charges', async () => {
    const paidProfile = profile({ subscription_credits_balance: 20 });
    mocks.from.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: paidProfile, error: null }),
          maybeSingle: async () => ({ data: { user_id: USER_ID }, error: null }),
        }),
      }),
      insert: async () => ({ error: null }),
    }));
    mocks.decodeImageDimensions.mockReturnValue({ width: 1000, height: 1000 });
    mocks.resolveScalePreservingModel.mockReturnValue({
      modelId: 'clarity-pro-upscaler',
      usedFallback: false,
    });

    const estimateResponse = await estimateCredits(
      request('/api/credit-estimate', {
        config: {
          mode: 'both',
          scale: 2,
          qualityTier: 'clarity-pro',
          selectedModel: 'auto',
          inputWidth: 1000,
          inputHeight: 1000,
          additionalOptions: { smartAnalysis: false, enhanceFaces: true },
        },
      })
    );
    const estimateBody = await estimateResponse.json();

    const upscaleResponse = await upscale(
      request('/api/upscale', {
        storagePath: `${USER_ID}/${JOB_ID}.png`,
        jobId: JOB_ID,
        mimeType: 'image/png',
        config: {
          qualityTier: 'clarity-pro',
          scale: 2,
          additionalOptions: {
            smartAnalysis: false,
            enhance: true,
            enhanceFaces: true,
            preserveText: false,
          },
        },
      })
    );
    const upscaleBody = await upscaleResponse.json();

    expect(estimateResponse.status, JSON.stringify(estimateBody)).toBe(200);
    expect(estimateBody).toMatchObject({
      modelToBe: 'clarity-pro-upscaler',
      breakdown: {
        pricingModel: 'output-megapixel',
        outputMegapixels: 4,
        totalCredits: 10,
      },
    });
    expect(upscaleResponse.status, JSON.stringify(upscaleBody)).toBe(202);
    const admission = mocks.rpc.mock.calls.find(
      ([name]) => name === 'admit_async_upscale_job'
    )?.[1];
    expect(admission).toMatchObject({
      p_resolved_model: 'clarity-pro-upscaler',
      p_amount: estimateBody.breakdown.totalCredits,
      p_result_context: {
        response: {
          dimensions: {
            input: { width: 1000, height: 1000 },
            output: { width: 2000, height: 2000 },
          },
        },
        costAttribution: {
          modelId: 'clarity-pro-upscaler',
          pricingModel: 'output-megapixel',
          creditsCharged: estimateBody.breakdown.totalCredits,
        },
      },
    });
    expect(mocks.processImage).not.toHaveBeenCalled();
  });
});
