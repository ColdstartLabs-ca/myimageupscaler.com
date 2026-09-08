import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  getReplay: vi.fn(),
  admit: vi.fn(),
  input: vi.fn(),
  availability: vi.fn(),
  rate: vi.fn(),
  track: vi.fn(),
}));
vi.mock('@server/supabase/supabaseAdmin', () => ({ supabaseAdmin: { from: mocks.from } }));
vi.mock('@server/services/upscale-job.service', async importOriginal => ({
  ...(await importOriginal<typeof import('@server/services/upscale-job.service')>()),
  upscaleJobService: { getReplay: mocks.getReplay, admit: mocks.admit },
}));
vi.mock('@server/services/upscale-input-storage.service', () => ({
  resolveUpscaleInput: mocks.input,
}));
vi.mock('@server/services/anti-freeloader.service', () => ({
  ensureAntiFreeloaderProfile: async (_req: unknown, _userId: unknown, profile: unknown) => profile,
}));
vi.mock('@server/services/provider-health.service', () => ({
  providerHealthService: { getAvailability: mocks.availability },
}));
vi.mock('@server/rateLimit', () => ({ upscaleRateLimit: { limit: mocks.rate } }));
vi.mock('@server/analytics', () => ({ trackServerEvent: mocks.track }));
vi.mock('@server/monitoring/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), flush: vi.fn() }),
}));
vi.mock('@shared/config/env', () => ({
  serverEnv: {
    ENV: 'test',
    AMPLITUDE_API_KEY: 'test-key',
    ENABLE_PREMIUM_MODELS: true,
    UPSCALE_DURABLE_EXECUTION_ENABLED: true,
    UPSCALE_DURABLE_COHORT_PERCENT: 100,
    UPSCALE_EXECUTOR_BASE_URL: 'https://executor.example',
    UPSCALE_EXECUTOR_SHARED_SECRET: 'test-wake-secret',
    UPSCALE_BUILD_ID: 'test-build',
    UPSCALE_EXECUTION_DEADLINE_SECONDS: 900,
    UPSCALE_SUBMISSION_DEADLINE_SECONDS: 900,
  },
  clientEnv: {},
  isProduction: () => false,
}));

import { POST } from '@/app/api/upscale/route';
import { POST as estimateCredits } from '@/app/api/credit-estimate/route';
import { UpscaleJobError, type IUpscaleAdmissionInput } from '@server/services/upscale-job.service';

const jobId = '11111111-1111-4111-8111-111111111111';
const payload = {
  jobId,
  storagePath: 'user-1/' + jobId + '.png',
  mimeType: 'image/png',
  config: { qualityTier: 'quick', scale: 2, additionalOptions: {} },
};
function request(body: unknown = payload, path = '/api/upscale') {
  return new NextRequest('http://localhost' + path, {
    method: 'POST',
    headers: {
      'X-User-Id': 'user-1',
      'X-Upscale-Protocol': '2',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
}
function profile(overrides: Record<string, unknown> = {}) {
  return {
    subscription_status: null,
    subscription_tier: null,
    subscription_credits_balance: 0,
    purchased_credits_balance: 0,
    credits_balance: 0,
    is_flagged_freeloader: false,
    region_tier: 'standard',
    signup_country: 'CA',
    created_at: '2026-07-17T00:00:00.000Z',
    ...overrides,
  };
}
let currentProfile = profile();
let grantDecision: { user_id: string } | null;

function storedInput(width = 100, height = 80) {
  const prefix = Buffer.from('89504e470d0a1a0a0000000d494844520000006400000050', 'hex');
  prefix.writeUInt32BE(width, 16);
  prefix.writeUInt32BE(height, 20);
  return {
    imageReference: 'https://storage.example/signed-input?token=private',
    validationImageData: prefix.toString('base64'),
    sizeBytes: 1024,
    mimeType: 'image/png',
  };
}

describe('POST /api/upscale free limit errors', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    currentProfile = profile();
    grantDecision = { user_id: 'user-1' };
    mocks.getReplay.mockResolvedValue(null);
    mocks.rate.mockResolvedValue({ success: true, remaining: 4, reset: Date.now() + 60_000 });
    mocks.availability.mockResolvedValue({ available: true, status: 'closed', retryAt: null });
    mocks.track.mockResolvedValue(true);
    mocks.input.mockResolvedValue(storedInput());
    mocks.from.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: grantDecision, error: null }),
          single: async () => ({ data: currentProfile, error: null }),
        }),
      }),
    }));
    mocks.admit.mockImplementation(async (input: IUpscaleAdmissionInput) => ({
      jobId: input.jobId,
      stage: 'queued',
      exactCharge: input.exactCharge,
      creditsRemaining:
        Number(currentProfile.subscription_credits_balance) +
        Number(currentProfile.purchased_credits_balance) -
        input.exactCharge,
      statusUrl: '/api/upscale/jobs?jobId=' + input.jobId,
      retryAfterMs: 2000,
      httpStatus: 202,
    }));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')));
  });
  afterEach(() => vi.unstubAllGlobals());

  it.each([
    {
      label: 'paid',
      balances: { purchased_credits_balance: 50 },
      modelId: 'clarity-upscaler',
      batchLimit: 40,
    },
    {
      label: 'free',
      balances: { subscription_credits_balance: 1 },
      modelId: 'real-esrgan-large',
      batchLimit: 5,
    },
  ])(
    'saves the oversized Quick 2x $label fallback at the original Quick charge',
    async ({ balances, modelId, batchLimit }) => {
      currentProfile = profile(balances);
      mocks.input.mockResolvedValue(storedInput(1800, 1800));

      const response = await POST(request());

      expect(response.status).toBe(202);
      expect(mocks.admit).toHaveBeenCalledWith(
        expect.objectContaining({
          resolvedModelId: modelId,
          billingModelId: 'real-esrgan',
          exactCharge: 1,
          inputWidth: 1800,
          inputHeight: 1800,
          scale: 2,
          batchLimit,
        })
      );
    }
  );

  it.each([
    { smartAnalysis: false, credits: 25 },
    { smartAnalysis: true, credits: 26 },
  ])(
    'quotes and reserves $credits credits for the same Ultra 4K request',
    async ({ smartAnalysis, credits }) => {
      currentProfile = profile({
        subscription_status: 'active',
        subscription_tier: 'pro',
        subscription_credits_balance: 100,
        credits_balance: 100,
      });
      const body = {
        ...payload,
        config: {
          qualityTier: 'ultra',
          scale: 2,
          additionalOptions: { smartAnalysis },
          nanoBananaProConfig: { resolution: '4K' },
        },
      };

      const estimateResponse = await estimateCredits(request(body, '/api/credit-estimate'));
      const response = await POST(request(body));
      const estimate = await estimateResponse.json();
      const accepted = await response.json();

      expect(estimateResponse.status).toBe(200);
      expect(response.status).toBe(202);
      expect(estimate.breakdown.totalCredits).toBe(credits);
      expect(accepted.processing.creditsUsed).toBe(credits);
      expect(mocks.admit).toHaveBeenCalledWith(
        expect.objectContaining({
          billingModelId: 'nano-banana-pro',
          exactCharge: credits,
          batchLimit: 200,
          requestConfig: expect.objectContaining({
            nanoBananaProConfig: expect.objectContaining({ resolution: '4K' }),
            executionPlan: expect.objectContaining({
              deferredAnalysis: smartAnalysis,
              reservedMaximumCredits: credits,
            }),
          }),
        })
      );
    }
  );

  it('keeps the explicit Nano Banana quote while advertising and reserving the Auto maximum', async () => {
    currentProfile = profile({
      subscription_status: 'active',
      subscription_tier: 'hobby',
      subscription_credits_balance: 100,
      credits_balance: 100,
    });
    const explicitResponse = await estimateCredits(
      request(
        {
          config: { mode: 'both', scale: 2, selectedModel: 'nano-banana' },
        },
        '/api/credit-estimate'
      )
    );
    const autoConfig = {
      qualityTier: 'auto',
      scale: 2,
      additionalOptions: { smartAnalysis: true },
    };
    const autoResponse = await estimateCredits(
      request(
        {
          config: autoConfig,
          analysisHint: { contentType: 'document' },
        },
        '/api/credit-estimate'
      )
    );
    const response = await POST(request({ ...payload, config: autoConfig }));

    expect(explicitResponse.status).toBe(200);
    expect((await explicitResponse.json()).breakdown.totalCredits).toBe(2);
    expect(autoResponse.status).toBe(200);
    expect((await autoResponse.json()).breakdown).toMatchObject({
      totalCredits: 25,
      reservationMaximum: 25,
      finalChargePending: true,
    });
    expect(response.status).toBe(202);
    expect((await response.json()).processing.creditsUsed).toBe(25);
    expect(mocks.admit).toHaveBeenCalledWith(
      expect.objectContaining({
        exactCharge: 25,
        selectionMode: 'auto',
        resolvedProvider: 'deferred',
      })
    );
  });

  it('rejects scale 8 for Seedream before reserving credits', async () => {
    currentProfile = profile({
      subscription_status: 'active',
      subscription_tier: 'hobby',
      subscription_credits_balance: 100,
    });

    const response = await POST(
      request({
        ...payload,
        config: { qualityTier: 'seedream-edit', scale: 8, additionalOptions: {} },
      })
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('VALIDATION_ERROR');
    expect(mocks.admit).not.toHaveBeenCalled();
  });

  it('returns account setup pending for a provisional zero profile before consuming limits', async () => {
    grantDecision = null;

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect((await response.json()).error.code).toBe('ACCOUNT_SETUP_PENDING');
    expect(mocks.rate).not.toHaveBeenCalled();
    expect(mocks.admit).not.toHaveBeenCalled();
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it('reads the grant decision before the credit profile', async () => {
    grantDecision = null;

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(mocks.from.mock.calls.map(([table]) => table)).toEqual([
      'free_credit_grants',
      'profiles',
    ]);
  });

  it.each([
    { label: 'free', overrides: {} },
    { label: 'paid', overrides: { subscription_status: 'active', subscription_tier: 'hobby' } },
    {
      label: 'former paid',
      overrides: { subscription_status: 'canceled', subscription_tier: 'hobby' },
    },
  ])(
    'returns INSUFFICIENT_CREDITS for a $label account with zero balance',
    async ({ overrides }) => {
      currentProfile = profile(overrides);

      const response = await POST(request());

      expect(response.status).toBe(402);
      expect(await response.json()).toMatchObject({
        error: { code: 'INSUFFICIENT_CREDITS', details: { required: 1, available: 0 } },
      });
      expect(mocks.admit).not.toHaveBeenCalled();
      expect(mocks.track).toHaveBeenCalledWith(
        'credit_wall_shown',
        { source: 'server_402', requiredCredits: 1, currentBalance: 0, deficit: 1 },
        { apiKey: 'test-key', userId: 'user-1' }
      );
    }
  );

  it('preserves the atomic reservation rejection after a stale balance precheck', async () => {
    currentProfile = profile({ subscription_credits_balance: 1 });
    mocks.admit.mockRejectedValue(
      new UpscaleJobError(
        'INSUFFICIENT_CREDITS',
        'You do not have enough credits for this image.',
        402,
        { required: 1, available: 0 }
      )
    );

    const response = await POST(request());

    expect(response.status).toBe(402);
    expect(await response.json()).toMatchObject({
      error: { code: 'INSUFFICIENT_CREDITS', details: { required: 1, available: 0 } },
    });
    expect(mocks.admit).toHaveBeenCalledOnce();
  });

  it.each(['billing', 'authentication', 'rate_limited'])(
    'serves a vendor-neutral %s outage before admission or input lookup',
    async failureKind => {
      mocks.availability.mockResolvedValue({
        available: false,
        status: 'open',
        failureKind,
        retryAt: new Date('2026-07-26T20:00:00Z'),
        error: 'Buy credits at https://replicate.com/account/billing.',
      });

      const response = await POST(request());
      const body = await response.json();

      expect(response.status).toBe(503);
      expect(body).toMatchObject({
        success: false,
        error: {
          code: 'AI_UNAVAILABLE',
          details: {
            providerUnavailable: true,
            suppressPurchaseCtas: true,
            retryAt: '2026-07-26T20:00:00.000Z',
          },
        },
      });
      expect(JSON.stringify(body)).not.toMatch(/replicate|https?:\/\/|billing/i);
      expect(body.error.message).not.toMatch(/buy|purchase/i);
      expect(mocks.input).not.toHaveBeenCalled();
      expect(mocks.admit).not.toHaveBeenCalled();
      expect(mocks.track).not.toHaveBeenCalled();
    }
  );

  it('preserves the hourly quota rejection from atomic admission', async () => {
    currentProfile = profile({ subscription_credits_balance: 1 });
    mocks.admit.mockRejectedValue(
      new UpscaleJobError(
        'BATCH_LIMIT_EXCEEDED',
        'Your processing limit has been reached. Please try again later.',
        429
      )
    );

    const response = await POST(request());

    expect(response.status).toBe(429);
    expect((await response.json()).error.code).toBe('BATCH_LIMIT_EXCEEDED');
    expect(mocks.admit).toHaveBeenCalledWith(
      expect.objectContaining({ batchLimit: 5, exactCharge: 1 })
    );
    expect(mocks.admit).toHaveBeenCalledOnce();
  });
});
