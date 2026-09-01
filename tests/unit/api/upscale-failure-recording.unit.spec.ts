import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  batchCheck: vi.fn(),
  batchRelease: vi.fn(),
  ensureProfile: vi.fn(),
  from: vi.fn(),
  insert: vi.fn(),
  analyze: vi.fn(),
  createProcessor: vi.fn(),
  createProcessorForModel: vi.fn(),
  processImage: vi.fn(),
  providerAvailability: vi.fn(),
  acquireProviderPermit: vi.fn(),
  recordProviderFailure: vi.fn(),
  recordProviderSuccess: vi.fn(),
  rateLimit: vi.fn(),
  refundReservation: vi.fn(),
  recordDeliverableOutput: vi.fn(),
  resolveUpscaleInput: vi.fn(),
  removeUpscaleInput: vi.fn(),
  setupPending: vi.fn(),
  track: vi.fn(),
  parseUpscale: vi.fn(),
  getModel: vi.fn(),
  getModelForTier: vi.fn(),
  calculateCredits: vi.fn(),
  resolveResolution: vi.fn(),
  getModelsByTier: vi.fn(),
  modelIdToTier: vi.fn(),
  decodeImageDimensions: vi.fn(),
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
    createProcessorForModel: mocks.createProcessorForModel,
    createProcessor: mocks.createProcessor,
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
      getMaxInputPixels: () => Number.MAX_SAFE_INTEGER,
      getModel: mocks.getModel,
      getModelsByTier: mocks.getModelsByTier,
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
  resolveUpscaleInput: mocks.resolveUpscaleInput,
  removeUpscaleInput: mocks.removeUpscaleInput,
}));
vi.mock('@server/services/replicate.service', () => ({ ReplicateError: mocks.ReplicateError }));
vi.mock('@server/services/scale-preserving-model', () => ({
  getScalePreservingFallbackCandidates: () => ['real-esrgan-large', 'clarity-upscaler'],
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
  upscaleSchema: { parse: mocks.parseUpscale },
  decodeImageDimensions: mocks.decodeImageDimensions,
  getBase64PayloadLength: (value: string) =>
    value.length - (value.startsWith('data:') ? value.indexOf(',') + 1 : 0),
  getBase64PayloadOffset: (value: string) =>
    value.startsWith('data:') ? value.indexOf(',') + 1 : 0,
  validateImageDimensions: () => ({ valid: true }),
  validateImageSizeForTier: () => ({ valid: true }),
  validateMagicBytes: () => ({ valid: true, detectedMimeType: 'image/jpeg' }),
  IMAGE_VALIDATION: {
    ALLOWED_TYPES: ['image/jpeg', 'image/png', 'image/webp', 'image/heic'],
    MAX_REQUEST_BYTES: 64 * 1024,
  },
}));

import { POST } from '@/app/api/upscale/route';

function request(tailJobId?: string): NextRequest {
  return new NextRequest('http://localhost/api/upscale', {
    method: 'POST',
    headers: {
      'X-User-Id': 'user-1',
      'content-type': 'application/json',
      ...(tailJobId ? { 'X-Upscale-Job-Id': tailJobId } : {}),
    },
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
    mocks.resolveUpscaleInput.mockResolvedValue({
      imageReference: 'https://storage.example/signed-input?token=abc',
      validationImageData: 'iVBORw0KGgoAAAANSUhEUg==',
      sizeBytes: 1024,
      mimeType: 'image/png',
    });
    mocks.removeUpscaleInput.mockResolvedValue(undefined);
    mocks.batchRelease.mockResolvedValue(true);
    mocks.providerAvailability.mockResolvedValue({
      available: true,
      status: 'closed',
      retryAt: null,
    });
    mocks.acquireProviderPermit.mockResolvedValue(true);
    mocks.analyze.mockResolvedValue({
      recommendedModel: 'real-esrgan',
      issues: [],
      enhancementPrompt: undefined,
    });
    mocks.createProcessor.mockReturnValue({
      providerName: 'Replicate',
      processImage: mocks.processImage,
    });
    mocks.createProcessorForModel.mockImplementation((modelId: string) => ({
      providerName: modelId === 'nano-banana' ? 'Replicate' : 'Gemini',
      processImage: mocks.processImage,
    }));
    mocks.getModelsByTier.mockReturnValue([]);
    mocks.decodeImageDimensions.mockReturnValue(null);
    mocks.modelIdToTier.mockReturnValue('quick');
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
      creditMultiplier: 1,
    });
    mocks.calculateCredits.mockReturnValue({
      finalCredits: 1,
      effectiveResolution: undefined,
      providerCostUsd: 0,
      pricingModel: 'test',
    });
    mocks.resolveResolution.mockReturnValue(undefined);
    mocks.parseUpscale.mockReturnValue({
      storagePath: 'user-1/11111111-1111-4111-8111-111111111111.png',
      jobId: '11111111-1111-4111-8111-111111111111',
      mimeType: 'image/png',
      config: {
        qualityTier: 'quick',
        scale: 2,
        additionalOptions: { smartAnalysis: false },
      },
      resolvedModel: 'real-esrgan',
    });
    mocks.processImage.mockResolvedValue({
      imageUrl: 'https://replicate.delivery/result.png',
      mimeType: 'image/png',
      expiresAt: 1795737600000,
      creditsRemaining: 4,
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

  it('dispatches Auto Nano Banana and charges its configured credits', async () => {
    const jobId = '66666666-6666-4666-8666-666666666666';
    const storagePath = `user-1/${jobId}.png`;
    const imageReference = 'https://storage.example/signed-input?token=abc';

    mocks.parseUpscale.mockReturnValue({
      storagePath,
      jobId,
      mimeType: 'image/png',
      config: {
        qualityTier: 'auto',
        scale: 2,
        additionalOptions: {
          // Auto performs analysis itself; switching from an explicit tier can
          // leave this UI flag true, but it must not add a second analysis credit.
          smartAnalysis: true,
          enhance: false,
          enhanceFaces: false,
          preserveText: false,
        },
      },
      resolvedModel: 'auto',
    });
    mocks.getModelsByTier.mockReturnValue([
      { id: 'real-esrgan', creditMultiplier: 1, supportedScales: [2, 4] },
      { id: 'nano-banana', creditMultiplier: 2, supportedScales: [] },
    ]);
    mocks.getModel.mockReturnValue({
      isEnabled: true,
      supportedScales: [],
      capabilities: ['text-preservation', 'enhance'],
      displayName: 'Text Preserve',
      creditMultiplier: 2,
    });
    mocks.ensureProfile.mockReturnValue({
      ...profile,
      subscription_credits_balance: 2,
    });
    mocks.decodeImageDimensions.mockReturnValue({ width: 100, height: 80 });
    mocks.calculateCredits.mockReturnValue({
      finalCredits: 2,
      scaleMultiplier: 1,
      resolutionMultiplier: 1,
      effectiveResolution: undefined,
      providerCostUsd: 0.039,
      pricingModel: 'flat',
    });
    mocks.analyze.mockResolvedValue({
      recommendedModel: 'nano-banana',
      issues: [{ type: 'text', severity: 'high' }],
      enhancementPrompt: 'Preserve text and logos.',
    });
    let deductedCredits: number | undefined;
    mocks.processImage.mockImplementation(
      async (
        _userId: string,
        _input: unknown,
        options: {
          creditCost: number;
          onCreditsDeducted?: (deduction: Record<string, unknown>) => void;
        }
      ) => {
        deductedCredits = options.creditCost;
        options.onCreditsDeducted?.({
          amount: options.creditCost,
          subscriptionAmount: options.creditCost,
          purchasedAmount: 0,
          jobId,
        });
        return {
          imageUrl: 'https://replicate.delivery/nano-banana.png',
          mimeType: 'image/png',
          expiresAt: 1795737600000,
          creditsRemaining: 4,
        };
      }
    );

    vi.useFakeTimers();
    try {
      const responsePromise = POST(request());
      await vi.advanceTimersByTimeAsync(5000);
      const response = await responsePromise;

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        dimensions: {
          input: { width: 100, height: 80 },
          output: { width: 100, height: 80 },
          actualScale: 1,
        },
      });
      expect(mocks.analyze).toHaveBeenCalledWith(
        imageReference,
        'image/jpeg',
        ['real-esrgan', 'nano-banana'],
        true
      );
      expect(mocks.createProcessorForModel).toHaveBeenCalledWith('nano-banana');
      expect(mocks.createProcessorForModel).not.toHaveBeenCalledWith('real-esrgan');
      expect(mocks.createProcessorForModel.mock.results[0]?.value).toMatchObject({
        providerName: 'Replicate',
      });
      expect(mocks.calculateCredits).toHaveBeenCalledWith(
        expect.objectContaining({
          modelId: 'nano-banana',
          qualityTier: 'quick',
          scale: 2,
        })
      );
      expect(mocks.processImage).toHaveBeenCalledWith(
        'user-1',
        expect.objectContaining({ imageData: imageReference }),
        expect.objectContaining({ reservationJobId: jobId, creditCost: 2 })
      );
      expect(deductedCredits).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    {
      scale: 4 as const,
      jobId: '44444444-4444-4444-8444-444444444444',
      compatibleModelId: 'clarity-upscaler',
      candidates: [
        { id: 'real-esrgan', creditMultiplier: 1, supportedScales: [2] },
        { id: 'nano-banana', creditMultiplier: 2, supportedScales: [] },
        { id: 'clarity-upscaler', creditMultiplier: 4, supportedScales: [2, 4] },
      ],
    },
    {
      scale: 8 as const,
      jobId: '88888888-8888-4888-8888-888888888888',
      compatibleModelId: 'clarity-pro-upscaler',
      candidates: [
        { id: 'real-esrgan', creditMultiplier: 1, supportedScales: [2, 4] },
        { id: 'nano-banana', creditMultiplier: 2, supportedScales: [] },
        { id: 'clarity-pro-upscaler', creditMultiplier: 7, supportedScales: [2, 4, 8] },
      ],
    },
  ])(
    'filters Auto recommendations to models that support $scale x and uses a compatible fallback',
    async ({ scale, jobId, compatibleModelId, candidates }) => {
      const storagePath = `user-1/${jobId}.png`;
      const imageReference = 'https://storage.example/signed-input?token=abc';

      mocks.parseUpscale.mockReturnValue({
        storagePath,
        jobId,
        mimeType: 'image/png',
        config: {
          qualityTier: 'auto',
          scale,
          additionalOptions: { smartAnalysis: false },
        },
        resolvedModel: 'auto',
      });
      mocks.getModelsByTier.mockReturnValue(candidates);
      mocks.getModel.mockReturnValue({
        isEnabled: true,
        supportedScales: [2, 4, 8],
        capabilities: ['upscale'],
        displayName: compatibleModelId,
        creditMultiplier: 1,
      });
      mocks.analyze.mockResolvedValue({
        // Deliberately return an incompatible model. The route must use the
        // compatible candidate retained by the scale filter instead.
        recommendedModel: 'real-esrgan',
        issues: [],
        enhancementPrompt: undefined,
      });
      mocks.processImage.mockImplementation(async (_userId, _input, options) => {
        options?.onCreditsDeducted?.({
          amount: 1,
          subscriptionAmount: 1,
          purchasedAmount: 0,
          jobId,
        });
        return {
          imageUrl: 'https://replicate.delivery/result.png',
          mimeType: 'image/png',
          expiresAt: 1795737600000,
          creditsRemaining: 4,
        };
      });

      vi.useFakeTimers();
      try {
        const responsePromise = POST(request());
        await vi.advanceTimersByTimeAsync(5000);
        const response = await responsePromise;
        expect(response.status).toBe(200);
        expect(mocks.analyze).toHaveBeenCalledWith(
          imageReference,
          'image/jpeg',
          [compatibleModelId],
          true
        );
        expect(mocks.createProcessorForModel).toHaveBeenCalledWith(compatibleModelId);
        expect(mocks.processImage).toHaveBeenCalledWith(
          'user-1',
          expect.objectContaining({ imageData: imageReference }),
          expect.objectContaining({ reservationJobId: jobId })
        );
      } finally {
        vi.useRealTimers();
      }
    }
  );

  it('rejects a Tail correlation header that does not match the validated reservation id', async () => {
    mocks.parseUpscale.mockReturnValue({
      storagePath: 'user-1/11111111-1111-4111-8111-111111111111.png',
      mimeType: 'image/jpeg',
      jobId: '11111111-1111-4111-8111-111111111111',
      config: {
        qualityTier: 'quick',
        scale: 2,
        additionalOptions: { smartAnalysis: false },
      },
      resolvedModel: 'real-esrgan',
    });

    const response = await POST(request('22222222-2222-4222-8222-222222222222'));

    expect(response.status).toBe(400);
    expect(mocks.processImage).not.toHaveBeenCalled();
    expect(mocks.batchRelease).toHaveBeenCalled();
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

  it('rejects inline image data, refunds the reservation, and records the failure', async () => {
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
    const response = await POST(request());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: 'AI_UNAVAILABLE' },
    });
    expect(mocks.recordDeliverableOutput).not.toHaveBeenCalled();
    expect(mocks.refundReservation).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ jobId: '11111111-1111-4111-8111-111111111111', amount: 1 }),
      expect.stringContaining('inline_provider_output_rejected')
    );
    expect(mocks.insert).toHaveBeenCalledWith(
      expect.objectContaining({ error_message: 'inline_provider_output_rejected' })
    );
  });

  it('fails closed when a processor returns an inline result without a URL', async () => {
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
    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(mocks.recordDeliverableOutput).not.toHaveBeenCalled();
    expect(mocks.refundReservation).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ jobId: '33333333-3333-4333-8333-333333333333', amount: 1 }),
      expect.stringContaining('inline_provider_output_rejected')
    );
  });

  it('refunds when recording the provider URL deliverable fails', async () => {
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
          imageUrl: 'https://replicate.delivery/result.png',
          mimeType: 'image/png',
          expiresAt: 1795737600000,
          creditsRemaining: 4,
        };
      }
    );
    mocks.recordDeliverableOutput.mockResolvedValue(false);

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(mocks.removeUpscaleInput).toHaveBeenCalledWith(
      'user-1/11111111-1111-4111-8111-111111111111.png'
    );
    expect(mocks.refundReservation).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ jobId: '44444444-4444-4444-8444-444444444444', amount: 1 }),
      expect.stringContaining('durable_result_not_deliverable')
    );
  });

  it('refunds when recording the provider URL deliverable throws', async () => {
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
          imageUrl: 'https://replicate.delivery/result.png',
          mimeType: 'image/png',
          expiresAt: 1795737600000,
          creditsRemaining: 4,
        };
      }
    );
    mocks.recordDeliverableOutput.mockRejectedValue(new Error('record failed'));

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(mocks.removeUpscaleInput).toHaveBeenCalledWith(
      'user-1/11111111-1111-4111-8111-111111111111.png'
    );
    expect(mocks.refundReservation).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ jobId: '55555555-5555-4555-8555-555555555555', amount: 1 }),
      expect.stringContaining('durable_result_not_deliverable')
    );
  });

  it('refunds and fails when a provider result has no HTTPS URL', async () => {
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
    expect(mocks.recordDeliverableOutput).not.toHaveBeenCalled();
    expect(mocks.refundReservation).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ jobId: '22222222-2222-4222-8222-222222222222', amount: 1 }),
      expect.stringContaining('inline_provider_output_rejected')
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
