import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Regression: the Worker died with `exceededMemory` (~300/day) and Cloudflare
 * returned a non-JSON 503 the client could only report as `edge_error`.
 *
 * An oversized body must be rejected from the Content-Length header alone —
 * reading it is what exhausts the 128MB isolate, so `req.json()` must never be
 * reached for a payload that large.
 */

const mocks = vi.hoisted(() => ({
  rateLimit: vi.fn(),
  batchCheck: vi.fn(),
  batchRelease: vi.fn(),
  from: vi.fn(),
  setupPending: vi.fn(),
  track: vi.fn(),
  parseUpscale: vi.fn(),
  processImage: vi.fn(),
  resolveUpscaleInput: vi.fn(),
  recordDeliverableOutput: vi.fn(),
  calculateFinalProviderAwareCredits: vi.fn(),
  calculateProviderAwareCredits: vi.fn(),
  resolveEffectiveResolution: vi.fn(),
  providerAvailability: vi.fn(),
  acquireProviderPermit: vi.fn(),
}));

vi.mock('@server/analytics', () => ({ trackServerEvent: mocks.track }));
vi.mock('@server/monitoring/logger', () => ({
  createLogger: () => ({ error: vi.fn(), flush: vi.fn(), info: vi.fn(), warn: vi.fn() }),
}));
vi.mock('@server/rateLimit', () => ({ upscaleRateLimit: { limit: mocks.rateLimit } }));
vi.mock('@server/services/batch-limit.service', () => ({
  batchLimitCheck: {
    checkAndIncrement: mocks.batchCheck,
    getUsage: () => ({ current: 1, limit: 5, resetAt: new Date('2026-08-18T00:00:00.000Z') }),
    release: mocks.batchRelease,
  },
}));
vi.mock('@server/services/anti-freeloader.service', () => ({
  ensureAntiFreeloaderProfile: async (
    _request: unknown,
    _userId: string,
    profile: unknown
  ) => profile,
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
      getModel: () => ({ isEnabled: true, supportedScales: [2, 4], capabilities: ['upscale'] }),
      getModelsByTier: () => [],
    }),
  },
}));
vi.mock('@server/services/provider-health.service', () => ({
  providerHealthService: {
    getAvailability: mocks.providerAvailability,
    acquireProcessingPermit: mocks.acquireProviderPermit,
    recordFailure: vi.fn(),
    recordSuccess: vi.fn(),
  },
}));
vi.mock('@server/services/replicate.service', () => ({
  ReplicateError: class ReplicateError extends Error {},
}));
vi.mock('@server/services/scale-preserving-model', () => ({
  getScalePreservingFallbackCandidates: () => ['real-esrgan-large', 'clarity-upscaler'],
  resolveScalePreservingModel: () => ({ usedFallback: false, modelId: 'real-esrgan' }),
}));
vi.mock('@server/services/replicate/utils/credit-manager', () => ({
  creditManager: {
    refundReservation: vi.fn(),
    recordDeliverableOutput: mocks.recordDeliverableOutput,
  },
}));
vi.mock('@server/services/upscale-input-storage.service', () => ({
  resolveUpscaleInput: mocks.resolveUpscaleInput,
  removeUpscaleInput: vi.fn(),
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
  calculateFinalProviderAwareCredits: mocks.calculateFinalProviderAwareCredits,
  calculateProviderAwareCredits: mocks.calculateProviderAwareCredits,
  getModelForTier: () => 'real-esrgan',
  modelIdToTier: vi.fn(),
  resolveEffectiveResolution: mocks.resolveEffectiveResolution,
}));
vi.mock('@/lib/anti-freeloader/check-freeloader', () => ({
  isAccountSetupPending: mocks.setupPending,
  isFreeleaderBlocked: () => false,
}));

import { POST } from '@/app/api/upscale/route';
import { IMAGE_VALIDATION } from '@shared/validation/upscale.schema';

function request(contentLength: number): NextRequest {
  const req = new NextRequest('http://localhost/api/upscale', {
    method: 'POST',
    headers: {
      'X-User-Id': 'user-1',
      'content-type': 'application/json',
      'content-length': String(contentLength),
    },
    body: JSON.stringify({ imageData: 'data:image/jpeg;base64,/9j/', mimeType: 'image/jpeg' }),
  });
  // Reading an oversized body is the failure being prevented, so make it fatal.
  vi.spyOn(req, 'json').mockImplementation(() => {
    throw new Error('req.json() must not be called for an oversized body');
  });
  return req;
}

function requestWithBody(body: unknown, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest('http://localhost/api/upscale', {
    method: 'POST',
    headers: {
      'X-User-Id': 'user-1',
      'content-type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

function streamedRequest(chunks: Uint8Array[]): NextRequest {
  let nextChunk = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[nextChunk++];
      if (chunk) controller.enqueue(chunk);
      else controller.close();
    },
  });

  return new NextRequest('http://localhost/api/upscale', {
    method: 'POST',
    headers: {
      'X-User-Id': 'user-1',
      'content-type': 'application/json',
    },
    body,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' });
}

describe('POST /api/upscale request body size guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockResolvedValue({ success: true, remaining: 4, reset: Date.now() + 60_000 });
    mocks.batchCheck.mockResolvedValue({ allowed: true, current: 1, limit: 5 });
    mocks.batchRelease.mockResolvedValue(true);
    mocks.recordDeliverableOutput.mockResolvedValue(true);
    mocks.calculateFinalProviderAwareCredits.mockReturnValue({
      finalCredits: 1,
      effectiveResolution: undefined,
      providerCostUsd: 0.0017,
      pricingModel: 'test',
    });
    mocks.calculateProviderAwareCredits.mockReturnValue({
      finalCredits: 1,
      effectiveResolution: undefined,
      providerCostUsd: 0.0017,
      pricingModel: 'test',
    });
    mocks.resolveUpscaleInput.mockResolvedValue({
      imageReference: 'https://storage.example/signed-input',
      validationImageData: 'iVBORw0KGgoAAAANSUhEUgAAAEAAAABA',
      sizeBytes: 1024,
      mimeType: 'image/png',
    });
    mocks.processImage.mockImplementation(async (_userId, _input, options) => {
      options?.onCreditsDeducted?.({
        amount: 1,
        newBalance: 4,
        jobId: '11111111-1111-4111-8111-111111111111',
        subscriptionAmount: 1,
        purchasedAmount: 0,
      });
      return {
        imageUrl: 'https://replicate.delivery/result.png',
        mimeType: 'image/png',
        expiresAt: Date.now() + 60_000,
        creditsRemaining: 4,
      };
    });
    mocks.setupPending.mockReturnValue(false);
    mocks.track.mockResolvedValue(true);
    mocks.providerAvailability.mockResolvedValue({
      available: true,
      status: 'closed',
      retryAt: null,
    });
    mocks.acquireProviderPermit.mockResolvedValue(true);
    mocks.from.mockReturnValue({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { user_id: 'user-1' }, error: null }),
          single: async () => ({
            data: {
              subscription_status: null,
              subscription_tier: null,
              subscription_credits_balance: 5,
              purchased_credits_balance: 0,
              is_flagged_freeloader: false,
              region_tier: 'standard',
              signup_country: 'CA',
              created_at: '2026-08-01T00:00:00.000Z',
            },
            error: null,
          }),
        }),
      }),
      insert: async () => ({ error: null }),
      update: () => ({ eq: async () => ({ error: null }) }),
    });
  });

  it('rejects an oversized body with 413 without reading it', async () => {
    const res = await POST(request(IMAGE_VALIDATION.MAX_REQUEST_BYTES + 1));

    expect(res.status).toBe(413);
    const body = await res.json();
    expect(JSON.stringify(body)).toMatch(/too large/i);
  });

  it('releases the batch slot so an oversized retry is not locked out', async () => {
    await POST(request(IMAGE_VALIDATION.MAX_REQUEST_BYTES + 1));

    expect(mocks.batchRelease).toHaveBeenCalled();
  });

  it('rejects inline image data before processing', async () => {
    const res = await POST(
      requestWithBody({
        imageData: 'data:image/jpeg;base64,/9j/',
        mimeType: 'image/jpeg',
        config: { qualityTier: 'quick', scale: 2 },
      })
    );

    expect(res.status).toBe(400);
    expect(mocks.resolveUpscaleInput).not.toHaveBeenCalled();
    expect(mocks.processImage).not.toHaveBeenCalled();
    expect(mocks.batchRelease).toHaveBeenCalled();
  });

  it('rejects a chunked body above 64 KiB without processing it', async () => {
    const firstChunk = new Uint8Array(64 * 1024);
    const secondChunk = new Uint8Array([0x7b]);

    const res = await POST(streamedRequest([firstChunk, secondChunk]));

    expect(res.status).toBe(413);
    expect(mocks.processImage).not.toHaveBeenCalled();
    expect(mocks.batchRelease).toHaveBeenCalled();
  });

  it('accepts the current storage metadata payload and reaches input resolution', async () => {
    const payload = {
      storagePath: 'user-1/11111111-1111-4111-8111-111111111111.png',
      jobId: '11111111-1111-4111-8111-111111111111',
      mimeType: 'image/png',
      resolvedModel: 'real-esrgan',
      config: { qualityTier: 'quick', scale: 2 },
    };

    const res = await POST(requestWithBody(payload));

    expect(res.status).toBe(200);
    expect(mocks.resolveUpscaleInput).toHaveBeenCalledWith({
      userId: 'user-1',
      storagePath: payload.storagePath,
      claimedMimeType: payload.mimeType,
      isPaidUser: false,
    });
    expect(mocks.processImage).toHaveBeenCalled();
  });
});
