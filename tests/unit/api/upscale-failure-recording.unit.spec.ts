import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  batchCheck: vi.fn(),
  batchRelease: vi.fn(),
  ensureProfile: vi.fn(),
  from: vi.fn(),
  insert: vi.fn(),
  processImage: vi.fn(),
  providerAvailability: vi.fn(),
  acquireProviderPermit: vi.fn(),
  recordProviderFailure: vi.fn(),
  recordProviderSuccess: vi.fn(),
  rateLimit: vi.fn(),
  refundReservation: vi.fn(),
  recordDeliverableOutput: vi.fn(),
  stageGeminiOutput: vi.fn(),
  removeUpscaleInput: vi.fn(),
  setupPending: vi.fn(),
  track: vi.fn(),
  parseUpscale: vi.fn(),
  getModel: vi.fn(),
  getModelForTier: vi.fn(),
  calculateCredits: vi.fn(),
  resolveResolution: vi.fn(),
  ReplicateError: class ReplicateError extends Error {
    constructor(
      message: string,
      public readonly code: string,
      public readonly providerStatus?: number
    ) {
      super(message);
      this.name = 'ReplicateError';
    }
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
    getUsage: () => ({
      current: 1,
      limit: 5,
      resetAt: new Date('2026-08-10T21:00:00.000Z'),
    }),
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
vi.mock('@server/services/upscale-input-storage.service', () => ({
  resolveUpscaleInput: vi.fn(),
  removeUpscaleInput: mocks.removeUpscaleInput,
  stageGeminiOutput: mocks.stageGeminiOutput,
}));
vi.mock('@server/services/replicate.service', () => ({ ReplicateError: mocks.ReplicateError }));
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
  modelIdToTier: vi.fn(),
  resolveEffectiveResolution: mocks.resolveResolution,
}));
vi.mock('@/lib/anti-freeloader/check-freeloader', () => ({
  isAccountSetupPending: mocks.setupPending,
  isFreeleaderBlocked: () => false,
}));
vi.mock('@shared/validation/upscale.schema', () => ({
  upscaleSchema: { parse: mocks.parseUpscale },
  decodeImageDimensions: () => null,
  getBase64PayloadLength: (value: string) =>
    value.length - (value.startsWith('data:') ? value.indexOf(',') + 1 : 0),
  getBase64PayloadOffset: (value: string) =>
    value.startsWith('data:') ? value.indexOf(',') + 1 : 0,
  validateImageDimensions: () => ({ valid: true }),
  validateImageSizeForTier: () => ({ valid: true }),
  validateMagicBytes: () => ({ valid: true, detectedMimeType: 'image/jpeg' }),
  IMAGE_VALIDATION: {
    ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
    MAX_REQUEST_BYTES: 16 * 1024 * 1024,
  },
}));

import { POST } from '@/app/api/upscale/route';

function request(): NextRequest {
  return new NextRequest('http://localhost/api/upscale', {
    method: 'POST',
    headers: { 'X-User-Id': 'user-1', 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
}

const profile = {
  subscription_status: null,
  subscription_tier: null,
  subscription_credits_balance: 1,
  purchased_credits_balance: 0,
  is_flagged_freeloader: false,
  region_tier: 'standard',
  signup_country: 'CA',
  created_at: '2026-08-01T00:00:00.000Z',
};

describe('POST /api/upscale failure recording', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockResolvedValue({ success: true, remaining: 4, reset: Date.now() + 60_000 });
    mocks.setupPending.mockReturnValue(false);
    mocks.refundReservation.mockResolvedValue(true);
    mocks.recordDeliverableOutput.mockResolvedValue(true);
    mocks.stageGeminiOutput.mockResolvedValue({
      imageUrl:
        'https://storage.example/object/sign/upscale-inputs/user-1/outputs/result.png?token=abc',
      mimeType: 'image/png',
      expiresAt: 1795737600000,
      storagePath: 'user-1/outputs/11111111-1111-4111-8111-111111111111.png',
    });
    mocks.removeUpscaleInput.mockResolvedValue(undefined);
    mocks.batchRelease.mockResolvedValue(true);
    mocks.providerAvailability.mockResolvedValue({
      available: true,
      status: 'closed',
      retryAt: null,
    });
    mocks.acquireProviderPermit.mockResolvedValue(true);
    mocks.recordProviderFailure.mockResolvedValue(true);
    mocks.recordProviderSuccess.mockResolvedValue(true);
    mocks.track.mockResolvedValue(true);
    mocks.batchCheck.mockResolvedValue({ allowed: true, current: 1, limit: 5 });
    mocks.getModelForTier.mockReturnValue('real-esrgan');
    mocks.getModel.mockReturnValue({
      isEnabled: true,
      supportedScales: [2, 4, 8],
      capabilities: ['upscale'],
      displayName: 'Real-ESRGAN',
    });
    mocks.calculateCredits.mockReturnValue({
      finalCredits: 1,
      effectiveResolution: undefined,
      providerCostUsd: 0,
      pricingModel: 'test',
    });
    mocks.resolveResolution.mockReturnValue(undefined);
    mocks.parseUpscale.mockReturnValue({
      imageData: 'data:image/jpeg;base64,/9j/',
      mimeType: 'image/jpeg',
      config: {
        qualityTier: 'quick',
        scale: 2,
        additionalOptions: { smartAnalysis: false },
      },
      resolvedModel: 'real-esrgan',
    });
    mocks.ensureProfile.mockReturnValue(profile);
    mocks.from.mockImplementation((table: string) => {
      if (table === 'processing_jobs') return { insert: mocks.insert };
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { user_id: 'user-1' }, error: null }),
            single: async () => ({ data: profile, error: null }),
          }),
        }),
      };
    });
    mocks.insert.mockResolvedValue({ error: null });
  });

  it('completes the durable reservation only after a usable output URL exists', async () => {
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
          jobId: '11111111-1111-4111-8111-111111111111',
        });
        return {
          imageUrl: 'https://output.test/result.png',
          mimeType: 'image/png',
          expiresAt: 1795737600000,
          creditsRemaining: 4,
        };
      }
    );

    const response = await POST(request());

    expect(response.status).toBe(200);
    const responseBody = await response.json();
    expect(responseBody).toMatchObject({
      processing: {
        reservationJobId: '11111111-1111-4111-8111-111111111111',
        deliveryToken: expect.any(String),
      },
    });
    expect(responseBody).not.toHaveProperty('imageUrl');
    expect(responseBody).not.toHaveProperty('imageData');
    expect(mocks.recordDeliverableOutput).toHaveBeenCalledWith(
      'user-1',
      '11111111-1111-4111-8111-111111111111',
      {
        imageUrl: 'https://output.test/result.png',
        mimeType: 'image/png',
        expiresAt: 1795737600000,
        deliveryTokenHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      }
    );
    expect(mocks.refundReservation).not.toHaveBeenCalled();
  });

  it('stages Gemini inline image data before recording a durable capability-only success', async () => {
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
          jobId: '11111111-1111-4111-8111-111111111111',
        });
        return {
          imageData: 'data:image/png;base64,iVBORw0KGgo=',
          mimeType: 'image/png',
          creditsRemaining: 4,
        };
      }
    );
    mocks.stageGeminiOutput.mockResolvedValue({
      imageUrl:
        'https://storage.example/object/sign/upscale-inputs/user-1/outputs/11111111-1111-4111-8111-111111111111.png?token=abc',
      mimeType: 'image/png',
      expiresAt: 1795737600000,
      storagePath: 'user-1/outputs/11111111-1111-4111-8111-111111111111.png',
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    const responseBody = await response.json();
    expect(JSON.stringify(responseBody)).not.toContain('iVBORw0KGgo');
    expect(JSON.stringify(responseBody)).not.toContain('storage.example');
    expect(responseBody.processing).toMatchObject({
      reservationJobId: '11111111-1111-4111-8111-111111111111',
      deliveryToken: expect.any(String),
    });
    expect(mocks.stageGeminiOutput).toHaveBeenCalledWith({
      userId: 'user-1',
      jobId: '11111111-1111-4111-8111-111111111111',
      imageData: 'data:image/png;base64,iVBORw0KGgo=',
    });
    expect(mocks.recordDeliverableOutput).toHaveBeenCalledWith(
      'user-1',
      '11111111-1111-4111-8111-111111111111',
      expect.objectContaining({
        imageUrl:
          'https://storage.example/object/sign/upscale-inputs/user-1/outputs/11111111-1111-4111-8111-111111111111.png?token=abc',
        mimeType: 'image/png',
        expiresAt: 1795737600000,
      })
    );
    expect(mocks.refundReservation).not.toHaveBeenCalled();
  });

  it('refunds the v3 reservation when Gemini output staging fails', async () => {
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
          jobId: '33333333-3333-4333-8333-333333333333',
        });
        return {
          imageData: 'data:image/png;base64,iVBORw0KGgo=',
          mimeType: 'image/png',
          creditsRemaining: 4,
        };
      }
    );
    mocks.stageGeminiOutput.mockRejectedValue(new Error('storage unavailable'));

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(mocks.recordDeliverableOutput).not.toHaveBeenCalled();
    expect(mocks.refundReservation).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ jobId: '33333333-3333-4333-8333-333333333333', amount: 1 }),
      expect.stringContaining('durable_result_not_deliverable')
    );
  });

  it('removes staged Gemini output and refunds when recording the deliverable fails', async () => {
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
          jobId: '44444444-4444-4444-8444-444444444444',
        });
        return {
          imageData: 'data:image/png;base64,iVBORw0KGgo=',
          mimeType: 'image/png',
          creditsRemaining: 4,
        };
      }
    );
    mocks.stageGeminiOutput.mockResolvedValue({
      imageUrl:
        'https://storage.example/object/sign/upscale-inputs/user-1/outputs/output.png?token=abc',
      mimeType: 'image/png',
      expiresAt: 1795737600000,
      storagePath: 'user-1/outputs/44444444-4444-4444-8444-444444444444.png',
    });
    mocks.recordDeliverableOutput.mockResolvedValue(false);

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(mocks.removeUpscaleInput).toHaveBeenCalledWith(
      'user-1/outputs/44444444-4444-4444-8444-444444444444.png'
    );
    expect(mocks.refundReservation).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ jobId: '44444444-4444-4444-8444-444444444444', amount: 1 }),
      expect.stringContaining('durable_result_not_deliverable')
    );
  });

  it('removes staged Gemini output and refunds when recording the deliverable throws', async () => {
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
          jobId: '55555555-5555-4555-8555-555555555555',
        });
        return {
          imageData: 'data:image/png;base64,iVBORw0KGgo=',
          mimeType: 'image/png',
          creditsRemaining: 4,
        };
      }
    );
    mocks.stageGeminiOutput.mockResolvedValue({
      imageUrl:
        'https://storage.example/object/sign/upscale-inputs/user-1/outputs/output.png?token=abc',
      mimeType: 'image/png',
      expiresAt: 1795737600000,
      storagePath: 'user-1/outputs/55555555-5555-4555-8555-555555555555.png',
    });
    mocks.recordDeliverableOutput.mockRejectedValue(new Error('record failed'));

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(mocks.removeUpscaleInput).toHaveBeenCalledWith(
      'user-1/outputs/55555555-5555-4555-8555-555555555555.png'
    );
    expect(mocks.refundReservation).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ jobId: '55555555-5555-4555-8555-555555555555', amount: 1 }),
      expect.stringContaining('durable_result_not_deliverable')
    );
  });

  it('refunds and fails when provider completed but the result is not durably deliverable', async () => {
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
          jobId: '22222222-2222-4222-8222-222222222222',
        });
        return {
          imageData: 'data:image/png;base64,result',
          mimeType: 'image/png',
          creditsRemaining: 4,
        };
      }
    );
    mocks.recordDeliverableOutput.mockResolvedValue(false);

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(mocks.refundReservation).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ jobId: '22222222-2222-4222-8222-222222222222', amount: 1 }),
      expect.stringContaining('durable_result_not_deliverable')
    );
  });

  it('should insert a failed processing_jobs row when upscale fails', async () => {
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
          jobId: 'job-timeout',
        });
        throw new mocks.ReplicateError('provider timeout', 'TIMEOUT', 503);
      }
    );

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        status: 'failed',
        error_message: 'replicate_timeout',
        credits_charged: 0,
      })
    );
  });

  it('should still return the original error when row insert throws', async () => {
    mocks.processImage.mockRejectedValue(
      new mocks.ReplicateError('provider timeout', 'TIMEOUT', 503)
    );
    mocks.insert.mockRejectedValue(new Error('database unavailable'));

    const response = await POST(request());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'AI_UNAVAILABLE' },
    });
  });
});
