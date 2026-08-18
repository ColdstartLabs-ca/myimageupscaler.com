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
  ensureAntiFreeloaderProfile: vi.fn(),
}));
vi.mock('@server/services/image-generation.service', () => ({
  AIGenerationError: class AIGenerationError extends Error {},
  InsufficientCreditsError: class InsufficientCreditsError extends Error {},
}));
vi.mock('@server/services/image-processor.factory', () => ({
  ImageProcessorFactory: {
    createProcessorForModel: () => ({ providerName: 'test', processImage: vi.fn() }),
    createProcessor: () => ({ providerName: 'test', processImage: vi.fn() }),
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
  resolveScalePreservingModel: () => ({ usedFallback: false, modelId: 'real-esrgan' }),
}));
vi.mock('@server/services/replicate/utils/credit-manager', () => ({
  creditManager: { refundCredits: vi.fn() },
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
  calculateFinalProviderAwareCredits: vi.fn(),
  calculateProviderAwareCredits: vi.fn(),
  getModelForTier: () => 'real-esrgan',
  modelIdToTier: vi.fn(),
  resolveEffectiveResolution: vi.fn(),
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

describe('POST /api/upscale request body size guard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.rateLimit.mockResolvedValue({ success: true, remaining: 4, reset: Date.now() + 60_000 });
    mocks.batchCheck.mockResolvedValue({ allowed: true, current: 1, limit: 5 });
    mocks.batchRelease.mockResolvedValue(true);
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
});
