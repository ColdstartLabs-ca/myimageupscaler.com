import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  acquireProviderPermit: vi.fn(),
  analyze: vi.fn(),
  batchCheck: vi.fn(),
  batchRelease: vi.fn(),
  decodeImageDimensions: vi.fn(),
  ensureProfile: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  getMaxInputPixels: vi.fn(),
  getModel: vi.fn(),
  getModelsByTier: vi.fn(),
  insert: vi.fn(),
  processImage: vi.fn(),
  providerAvailability: vi.fn(),
  providerFailure: vi.fn(),
  providerSuccess: vi.fn(),
  rateLimit: vi.fn(),
  recordDeliverableOutput: vi.fn(),
  recordProviderFailure: vi.fn(),
  recordProviderSuccess: vi.fn(),
  refundReservation: vi.fn(),
  removeUpscaleInput: vi.fn(),
  resolveScalePreservingModel: vi.fn(),
  resolveUpscaleInput: vi.fn(),
  setupPending: vi.fn(),
  track: vi.fn(),
  validateMagicBytes: vi.fn(),
}));

vi.mock('@server/analytics', () => ({ trackServerEvent: mocks.track }));
vi.mock('@server/monitoring/logger', () => ({
  createLogger: () => ({ error: vi.fn(), flush: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));
vi.mock('@server/rateLimit', () => ({ upscaleRateLimit: { limit: mocks.rateLimit } }));
vi.mock('@server/services/batch-limit.service', () => ({
  batchLimitCheck: {
    checkAndIncrement: mocks.batchCheck,
    getUsage: () => ({ current: 1, limit: 5, resetAt: new Date(Date.now() + 60_000) }),
    release: mocks.batchRelease,
  },
}));
vi.mock('@server/services/anti-freeloader.service', () => ({
  ensureAntiFreeloaderProfile: mocks.ensureProfile,
}));
vi.mock('@server/services/image-generation.service', () => ({
  AIGenerationError: class AIGenerationError extends Error {},
  InsufficientCreditsError: class InsufficientCreditsError extends Error {},
}));
vi.mock('@server/services/image-processor.factory', () => ({
  ImageProcessorFactory: {
    createProcessor: () => ({ providerName: 'test', processImage: mocks.processImage }),
    createProcessorForModel: vi.fn(() => ({
      providerName: 'test',
      processImage: mocks.processImage,
    })),
  },
}));
vi.mock('@server/services/llm-image-analyzer', () => ({
  LLMImageAnalyzer: class {
    analyze(...args: unknown[]) {
      return mocks.analyze(...args);
    }
  },
}));
vi.mock('@server/services/model-registry', () => ({
  ModelRegistry: {
    getInstance: () => ({
      getMaxInputPixels: mocks.getMaxInputPixels,
      getModel: mocks.getModel,
      getModelsByTier: mocks.getModelsByTier,
    }),
  },
}));
vi.mock('@server/services/provider-health.service', () => ({
  providerHealthService: {
    acquireProcessingPermit: mocks.acquireProviderPermit,
    getAvailability: mocks.providerAvailability,
    recordFailure: mocks.recordProviderFailure,
    recordSuccess: mocks.providerSuccess,
  },
}));
vi.mock('@server/services/replicate.service', () => ({
  ReplicateError: class ReplicateError extends Error {
    code = 'UNKNOWN';
  },
}));
vi.mock('@server/services/replicate/utils/credit-manager', () => ({
  creditManager: {
    recordDeliverableOutput: mocks.recordDeliverableOutput,
    refundReservation: mocks.refundReservation,
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
vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: { from: mocks.from, rpc: mocks.rpc },
}));
vi.mock('@shared/config/env', async importOriginal => {
  const actual = await importOriginal<typeof import('@shared/config/env')>();
  return {
    ...actual,
    isProduction: () => false,
    serverEnv: { ...actual.serverEnv, AMPLITUDE_API_KEY: 'test-key', ENV: 'test' },
  };
});
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
    upscaleSchema: { parse: vi.fn() },
    validateMagicBytes: mocks.validateMagicBytes,
  };
});

import { POST as estimateCredits } from '@/app/api/credit-estimate/route';
import { POST as upscale } from '@/app/api/upscale/route';
import {
  evaluateFaceEnhancementPolicy,
  getFaceEnhancementEntitlement,
} from '@shared/config/face-enhancement-policy';
import { upscaleSchema } from '@shared/validation/upscale.schema';

const USER_ID = 'face-user-1';
const JOB_ID = '11111111-1111-4111-8111-111111111111';

type Profile = {
  subscription_status: string | null;
  subscription_tier: string | null;
  subscription_credits_balance: number;
  purchased_credits_balance: number;
};

type Model = {
  id: string;
  displayName: string;
  isEnabled: boolean;
  supportedScales: number[];
  tierRestriction?: string;
  capabilities: string[];
  processingTimeMs: number;
};

let currentProfile: Profile;
let models: Record<string, Model>;

function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    subscription_status: 'active',
    subscription_tier: 'hobby',
    subscription_credits_balance: 50,
    purchased_credits_balance: 0,
    ...overrides,
  };
}

function clarityModel(overrides: Partial<Model> = {}): Model {
  return {
    id: 'clarity-pro-upscaler',
    displayName: 'Clarity Pro',
    isEnabled: true,
    supportedScales: [2, 4, 8],
    tierRestriction: 'hobby',
    capabilities: ['upscale', 'enhance', 'face-restoration'],
    processingTimeMs: 1000,
    ...overrides,
  };
}

function gfpganModel(overrides: Partial<Model> = {}): Model {
  return {
    id: 'gfpgan',
    displayName: 'Face Restore',
    isEnabled: true,
    supportedScales: [2, 4],
    tierRestriction: 'hobby',
    capabilities: ['upscale', 'face-restoration'],
    processingTimeMs: 1000,
    ...overrides,
  };
}

function quickPayload(overrides: Record<string, unknown> = {}) {
  return {
    storagePath: `${USER_ID}/${JOB_ID}.png`,
    jobId: JOB_ID,
    mimeType: 'image/png',
    config: {
      qualityTier: 'quick',
      scale: 2,
      additionalOptions: {
        smartAnalysis: false,
        enhance: true,
        enhanceFaces: true,
        preserveText: false,
      },
    },
    ...overrides,
  };
}

function clarityUpscalePayload(scale: 2 | 4 | 8 = 2) {
  return {
    storagePath: `${USER_ID}/${JOB_ID}.png`,
    jobId: JOB_ID,
    mimeType: 'image/png',
    config: {
      qualityTier: 'clarity-pro',
      scale,
      additionalOptions: {
        smartAnalysis: false,
        enhance: true,
        enhanceFaces: false,
        preserveText: false,
      },
    },
  };
}

function clarityEstimatePayload(inputWidth?: number, inputHeight?: number, scale: 2 | 4 | 8 = 2) {
  return {
    config: {
      mode: 'both',
      scale,
      qualityTier: 'clarity-pro',
      selectedModel: 'auto',
      inputWidth,
      inputHeight,
      enhanceFaces: false,
      additionalOptions: { smartAnalysis: false },
    },
  };
}

function request(path: string, body: unknown, userId?: string): NextRequest {
  const effectiveUserId = arguments.length >= 3 ? userId : USER_ID;
  return new NextRequest(`http://localhost${path}`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(effectiveUserId ? { 'X-User-Id': effectiveUserId } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function callUpscale(payload: unknown) {
  vi.mocked(upscaleSchema.parse).mockReturnValue(payload as never);
  return upscale(request('/api/upscale', payload));
}

async function json(response: Response): Promise<Record<string, any>> {
  return response.json() as Promise<Record<string, any>>;
}

describe('Phase 3 paid face enhancement policy', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rpc.mockResolvedValue({ data: { outcome: 'new' }, error: null });

    currentProfile = profile();
    models = {
      'real-esrgan': {
        id: 'real-esrgan',
        displayName: 'Quick',
        isEnabled: true,
        supportedScales: [2, 4],
        capabilities: ['upscale'],
        processingTimeMs: 1000,
      },
      gfpgan: gfpganModel(),
      'clarity-pro-upscaler': clarityModel(),
    };

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
    mocks.refundReservation.mockResolvedValue(true);
    mocks.removeUpscaleInput.mockResolvedValue(undefined);
    mocks.setupPending.mockReturnValue(false);
    mocks.ensureProfile.mockImplementation((_request, _userId, rawProfile) => rawProfile);
    mocks.decodeImageDimensions.mockReturnValue({ width: 1000, height: 1000 });
    mocks.validateMagicBytes.mockReturnValue({ valid: true, detectedMimeType: 'image/png' });
    mocks.resolveScalePreservingModel.mockImplementation(({ modelId }: { modelId: string }) => ({
      modelId,
      usedFallback: false,
    }));
    mocks.resolveUpscaleInput.mockResolvedValue({
      imageReference: 'https://storage.example/signed-input?token=abc',
      validationImageData: 'iVBORw0KGgoAAAANSUhEUg==',
      sizeBytes: 1024,
      mimeType: 'image/png',
    });
    mocks.getMaxInputPixels.mockReturnValue(Number.MAX_SAFE_INTEGER);
    mocks.getModel.mockImplementation((modelId: string) => models[modelId] ?? null);
    mocks.getModelsByTier.mockReturnValue([models['real-esrgan']]);
    mocks.processImage.mockImplementation(async (_userId, _input, options) => {
      const creditCost = (options as { creditCost: number }).creditCost;
      (options as { onCreditsDeducted?: (deduction: unknown) => void }).onCreditsDeducted?.({
        amount: creditCost,
        subscriptionAmount: creditCost,
        purchasedAmount: 0,
        jobId: JOB_ID,
      });
      return {
        imageUrl: 'https://replicate.delivery/result.png',
        mimeType: 'image/png',
        expiresAt: 1795737600000,
        creditsRemaining: currentProfile.subscription_credits_balance - creditCost,
      };
    });
    mocks.from.mockImplementation((table: string) => {
      if (table === 'processing_jobs') return { insert: mocks.insert };

      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { user_id: USER_ID }, error: null }),
            single: async () => ({ data: currentProfile, error: null }),
          }),
        }),
      };
    });
    mocks.insert.mockResolvedValue({ error: null });
  });

  it('distinguishes promotional credits, credit packs, paid history, and free access', () => {
    const promotional = getFaceEnhancementEntitlement({
      subscriptionStatus: null,
      subscriptionTier: null,
      subscriptionCreditsBalance: 20,
      purchasedCreditsBalance: 0,
    });
    expect(promotional).toMatchObject({
      accessClass: 'free',
      isPaidUser: false,
      effectiveTier: 'free',
      spendableCredits: 20,
    });

    const pack = getFaceEnhancementEntitlement({
      subscriptionStatus: null,
      subscriptionTier: null,
      subscriptionCreditsBalance: 0,
      purchasedCreditsBalance: 20,
    });
    expect(pack).toMatchObject({
      accessClass: 'credit-pack',
      isPaidUser: true,
      effectiveTier: 'hobby',
      spendableCredits: 20,
    });

    const history = getFaceEnhancementEntitlement({
      subscriptionStatus: 'canceled',
      subscriptionTier: 'pro',
      subscriptionCreditsBalance: 0,
      purchasedCreditsBalance: 0,
    });
    expect(history).toMatchObject({
      accessClass: 'paid-history',
      isPaidUser: true,
      effectiveTier: 'pro',
      spendableCredits: 0,
    });
  });

  it('returns 401 for unauthenticated upscale and estimate requests', async () => {
    const upscaleResponse = await upscale(request('/api/upscale', quickPayload(), ''));
    const estimateResponse = await estimateCredits(
      request('/api/credit-estimate', clarityEstimatePayload(1000, 1000), '')
    );

    expect(upscaleResponse.status).toBe(401);
    expect((await json(upscaleResponse)).error.code).toBe('UNAUTHORIZED');
    expect(estimateResponse.status).toBe(401);
    expect((await json(estimateResponse)).error.code).toBe('UNAUTHORIZED');
  });

  it('should reject face enhancement before spending credits when the user is free', async () => {
    currentProfile = profile({
      subscription_status: null,
      subscription_tier: null,
      subscription_credits_balance: 20,
      purchased_credits_balance: 0,
    });

    const response = await callUpscale(quickPayload());
    const body = await json(response);

    expect(response.status).toBe(403);
    expect(body).toMatchObject({
      success: false,
      error: { code: 'FORBIDDEN', details: { requiresPaidAccess: true } },
    });
    expect(mocks.resolveUpscaleInput).not.toHaveBeenCalled();
    expect(mocks.analyze).not.toHaveBeenCalled();
    expect(mocks.processImage).not.toHaveBeenCalled();
    expect(mocks.acquireProviderPermit).not.toHaveBeenCalled();
    expect(mocks.refundReservation).not.toHaveBeenCalled();
    expect(mocks.batchCheck).not.toHaveBeenCalled();
    expect(mocks.batchRelease).not.toHaveBeenCalled();
  });

  it('rejects a forged direct Clarity model flag for a free user before quoting', async () => {
    currentProfile = profile({
      subscription_status: null,
      subscription_tier: null,
      subscription_credits_balance: 20,
      purchased_credits_balance: 0,
    });

    const response = await estimateCredits(
      request('/api/credit-estimate', {
        config: {
          scale: 2,
          selectedModel: 'clarity-pro-upscaler',
          inputWidth: 1000,
          inputHeight: 1000,
        },
      })
    );
    const body = await json(response);

    expect(response.status).toBe(403);
    expect(body.error.code).toBe('FORBIDDEN');
    expect(mocks.getModel).not.toHaveBeenCalled();
  });

  it('should require reselection when a legacy Quick request enables faces', async () => {
    const response = await callUpscale(quickPayload());
    const body = await json(response);

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      success: false,
      error: {
        code: 'VALIDATION_ERROR',
        details: {
          requiresReselection: true,
          recommendedQualityTier: 'clarity-pro',
        },
      },
    });
    expect(mocks.resolveUpscaleInput).not.toHaveBeenCalled();
    expect(mocks.analyze).not.toHaveBeenCalled();
    expect(mocks.processImage).not.toHaveBeenCalled();
    expect(mocks.batchCheck).not.toHaveBeenCalled();
    expect(mocks.batchRelease).not.toHaveBeenCalled();
  });

  it('rejects a paid request that forges a face model against Quick', async () => {
    currentProfile = profile();
    const response = await estimateCredits(
      request('/api/credit-estimate', {
        config: {
          scale: 2,
          qualityTier: 'quick',
          selectedModel: 'clarity-pro-upscaler',
          inputWidth: 1000,
          inputHeight: 1000,
        },
      })
    );
    const body = await json(response);

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
        details: { requiresReselection: false, faceEnhancement: true },
      },
    });
  });

  it('rejects a forged face model hint on the upscale path before processing', async () => {
    const response = await callUpscale(
      quickPayload({
        resolvedModel: 'clarity-pro-upscaler',
        config: {
          qualityTier: 'quick',
          scale: 2,
          additionalOptions: {
            smartAnalysis: false,
            enhance: true,
            enhanceFaces: false,
            preserveText: false,
          },
        },
      })
    );
    const body = await json(response);

    expect(response.status).toBe(400);
    expect(body).toMatchObject({
      error: {
        code: 'VALIDATION_ERROR',
        details: { requiresReselection: false, faceEnhancement: true },
      },
    });
    expect(mocks.resolveUpscaleInput).not.toHaveBeenCalled();
    expect(mocks.processImage).not.toHaveBeenCalled();
  });

  it('should quote the charged Clarity Pro cost when a paying user selects face upscaling', async () => {
    currentProfile = profile({ subscription_credits_balance: 50 });
    const estimateResponse = await estimateCredits(
      request('/api/credit-estimate', clarityEstimatePayload(1000, 1000, 2))
    );
    const estimateBody = await json(estimateResponse);

    const upscaleResponse = await callUpscale(clarityUpscalePayload(2));
    const upscaleBody = await json(upscaleResponse);

    expect(estimateResponse.status).toBe(200);
    expect(estimateBody).toMatchObject({
      modelToBe: 'clarity-pro-upscaler',
      breakdown: {
        pricingModel: 'output-megapixel',
        outputMegapixels: 4,
        totalCredits: 10,
      },
      userCredits: 50,
      canAfford: true,
    });
    expect(upscaleResponse.status).toBe(200);
    expect(upscaleBody.processing).toMatchObject({
      modelUsed: 'clarity-pro-upscaler',
      creditsUsed: estimateBody.breakdown.totalCredits,
    });
    expect(mocks.processImage).toHaveBeenCalledWith(
      USER_ID,
      expect.anything(),
      expect.objectContaining({ creditCost: estimateBody.breakdown.totalCredits })
    );
  });

  it('allows a credit-pack purchaser to quote and process paid face upscaling', async () => {
    currentProfile = profile({
      subscription_status: null,
      subscription_tier: null,
      subscription_credits_balance: 0,
      purchased_credits_balance: 20,
    });

    const estimateResponse = await estimateCredits(
      request('/api/credit-estimate', clarityEstimatePayload(1000, 1000))
    );
    const estimateBody = await json(estimateResponse);
    const upscaleResponse = await callUpscale(clarityUpscalePayload());
    const upscaleBody = await json(upscaleResponse);

    expect(estimateResponse.status).toBe(200);
    expect(estimateBody.userCredits).toBe(20);
    expect(estimateBody.canAfford).toBe(true);
    expect(upscaleResponse.status).toBe(200);
    expect(upscaleBody.processing.creditsUsed).toBe(estimateBody.breakdown.totalCredits);
  });

  it('keeps expired paid history on the existing insufficient-credit path', async () => {
    currentProfile = profile({
      subscription_status: 'canceled',
      subscription_tier: 'pro',
      subscription_credits_balance: 0,
      purchased_credits_balance: 0,
    });

    const estimateResponse = await estimateCredits(
      request('/api/credit-estimate', clarityEstimatePayload(1000, 1000))
    );
    const estimateBody = await json(estimateResponse);
    const upscaleResponse = await callUpscale(clarityUpscalePayload());
    const upscaleBody = await json(upscaleResponse);

    expect(estimateResponse.status).toBe(200);
    expect(estimateBody.canAfford).toBe(false);
    expect(upscaleResponse.status).toBe(402);
    expect(upscaleBody.error.code).toBe('INSUFFICIENT_CREDITS');
    expect(mocks.processImage).not.toHaveBeenCalled();
    expect(mocks.refundReservation).not.toHaveBeenCalled();
  });

  it('returns 400 for Clarity Pro pricing when dimensions are missing', async () => {
    currentProfile = profile();
    const estimateResponse = await estimateCredits(
      request('/api/credit-estimate', clarityEstimatePayload())
    );
    const estimateBody = await json(estimateResponse);

    mocks.decodeImageDimensions.mockReturnValue(null);
    const upscaleResponse = await callUpscale(clarityUpscalePayload());
    const upscaleBody = await json(upscaleResponse);

    expect(estimateResponse.status).toBe(400);
    expect(estimateBody.error).toMatchObject({
      code: 'VALIDATION_ERROR',
      details: { reason: 'missing-dimensions' },
    });
    expect(upscaleResponse.status).toBe(400);
    expect(upscaleBody.error.details.reason).toBe('missing-dimensions');
    expect(mocks.processImage).not.toHaveBeenCalled();
  });

  it('rejects Clarity Pro output above the 64 MP cap instead of clamping its quote', async () => {
    currentProfile = profile();
    const estimateResponse = await estimateCredits(
      request('/api/credit-estimate', clarityEstimatePayload(1500, 1500, 8))
    );
    const estimateBody = await json(estimateResponse);

    mocks.decodeImageDimensions.mockReturnValue({ width: 1500, height: 1500 });
    const upscaleResponse = await callUpscale(clarityUpscalePayload(8));
    const upscaleBody = await json(upscaleResponse);

    expect(estimateResponse.status).toBe(400);
    expect(estimateBody.error.details).toMatchObject({
      reason: 'output-cap',
      outputMegapixels: 144,
    });
    expect(upscaleResponse.status).toBe(400);
    expect(upscaleBody.error.details.reason).toBe('output-cap');
    expect(mocks.processImage).not.toHaveBeenCalled();
  });

  it('preserves disabled-model validation without attempting inference', async () => {
    currentProfile = profile();
    models['clarity-pro-upscaler'] = clarityModel({ isEnabled: false });

    const estimateResponse = await estimateCredits(
      request('/api/credit-estimate', clarityEstimatePayload(1000, 1000))
    );
    const upscaleResponse = await callUpscale(clarityUpscalePayload());

    expect(estimateResponse.status).toBe(400);
    expect((await json(estimateResponse)).error.code).toBe('VALIDATION_ERROR');
    expect(upscaleResponse.status).toBe(500);
    expect((await json(upscaleResponse)).error.code).toBe('INTERNAL_ERROR');
    expect(mocks.processImage).not.toHaveBeenCalled();
  });

  it('preserves unsupported-scale validation for the paid Face Restore tier', async () => {
    currentProfile = profile();
    const faceRestoreEstimate = {
      config: {
        scale: 8,
        qualityTier: 'face-restore',
        selectedModel: 'auto',
        inputWidth: 1000,
        inputHeight: 1000,
      },
    };
    const estimateResponse = await estimateCredits(
      request('/api/credit-estimate', faceRestoreEstimate)
    );
    const estimateBody = await json(estimateResponse);

    vi.mocked(upscaleSchema.parse).mockReturnValue({
      ...clarityUpscalePayload(2),
      config: {
        qualityTier: 'face-restore',
        scale: 8,
        additionalOptions: { smartAnalysis: false, enhanceFaces: false },
      },
    } as never);
    models.gfpgan = gfpganModel();
    const upscaleResponse = await upscale(request('/api/upscale', {}));
    const upscaleBody = await json(upscaleResponse);

    expect(estimateResponse.status).toBe(400);
    expect(estimateBody.error.code).toBe('MODEL_NOT_SUPPORTED');
    expect(upscaleResponse.status).toBe(400);
    expect(upscaleBody.error.code).toBe('VALIDATION_ERROR');
    expect(mocks.processImage).not.toHaveBeenCalled();
  });

  it('keeps rate limiting before processing and face inference', async () => {
    mocks.rateLimit.mockResolvedValue({ success: false, remaining: 0, reset: Date.now() + 60_000 });

    const response = await callUpscale(clarityUpscalePayload());
    const body = await json(response);

    expect(response.status).toBe(429);
    expect(body.error.code).toBe('RATE_LIMITED');
    expect(mocks.batchCheck).not.toHaveBeenCalled();
    expect(mocks.processImage).not.toHaveBeenCalled();
  });

  it('keeps pure policy decisions independent of database or provider calls', () => {
    const entitlement = getFaceEnhancementEntitlement({
      subscriptionStatus: null,
      subscriptionTier: null,
      subscriptionCreditsBalance: 10,
      purchasedCreditsBalance: 0,
    });
    const decision = evaluateFaceEnhancementPolicy({
      request: { qualityTier: 'quick', enhanceFaces: true },
      entitlement,
    });

    expect(decision).toMatchObject({
      faceEnhancementRequested: true,
      isPaidUser: false,
      reason: 'free-user',
    });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.processImage).not.toHaveBeenCalled();
  });
});
