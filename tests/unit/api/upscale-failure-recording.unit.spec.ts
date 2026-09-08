import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  getReplay: vi.fn(),
  admit: vi.fn(),
  input: vi.fn(),
  removeInput: vi.fn(),
  availability: vi.fn(),
  rate: vi.fn(),
  track: vi.fn(),
  fetch: vi.fn(),
}));
vi.mock('@server/supabase/supabaseAdmin', () => ({ supabaseAdmin: { from: mocks.from } }));
vi.mock('@server/services/upscale-job.service', async importOriginal => ({
  ...(await importOriginal<typeof import('@server/services/upscale-job.service')>()),
  upscaleJobService: { getReplay: mocks.getReplay, admit: mocks.admit },
}));
vi.mock('@server/services/upscale-input-storage.service', () => ({
  resolveUpscaleInput: mocks.input,
  removeUpscaleInput: mocks.removeInput,
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
import { ModelRegistry } from '@server/services/model-registry';
import { UpscaleJobError, type IUpscaleAdmissionInput } from '@server/services/upscale-job.service';

const jobId = '11111111-1111-4111-8111-111111111111';
const payload = {
  jobId,
  storagePath: 'user-1/' + jobId + '.png',
  mimeType: 'image/png',
  config: { qualityTier: 'quick', scale: 2, additionalOptions: { smartAnalysis: false } },
};
function request(body: unknown = payload, headers: Record<string, string> = {}) {
  return new NextRequest('http://localhost/api/upscale', {
    method: 'POST',
    headers: {
      'X-User-Id': 'user-1',
      'X-Upscale-Protocol': '2',
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
function accepted(exactCharge = 1, stage = 'queued') {
  return {
    jobId,
    stage,
    exactCharge,
    creditsRemaining: 100 - exactCharge,
    statusUrl: '/api/upscale/jobs?jobId=' + jobId,
    retryAfterMs: 2000,
    httpStatus: 202,
  };
}

describe('POST /api/upscale failure recording', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getReplay.mockResolvedValue(null);
    mocks.admit.mockImplementation(async (input: IUpscaleAdmissionInput) =>
      accepted(input.exactCharge)
    );
    mocks.rate.mockResolvedValue({ success: true, remaining: 4, reset: Date.now() + 60_000 });
    mocks.availability.mockResolvedValue({ available: true, status: 'closed', retryAt: null });
    mocks.track.mockResolvedValue(true);
    mocks.fetch.mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', mocks.fetch);
    mocks.input.mockResolvedValue({
      imageReference: 'https://storage.example/signed-input?token=private',
      validationImageData: 'iVBORw0KGgoAAAANSUhEUgAAAGQAAABQ',
      sizeBytes: 1024,
      mimeType: 'image/png',
    });
    mocks.from.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { user_id: 'user-1' }, error: null }),
          single: async () => ({
            data: {
              subscription_status: 'active',
              subscription_tier: 'pro',
              subscription_credits_balance: 100,
              purchased_credits_balance: 0,
              is_flagged_freeloader: false,
            },
            error: null,
          }),
        }),
      }),
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it('reserves the Auto maximum and saves eligible models without running analysis during admission', async () => {
    const response = await POST(
      request({
        ...payload,
        config: { qualityTier: 'auto', scale: 2, additionalOptions: { smartAnalysis: true } },
      })
    );

    expect(response.status).toBe(202);
    expect((await response.json()).processing.creditsUsed).toBe(25);
    expect(mocks.admit).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId,
        exactCharge: 25,
        selectionMode: 'auto',
        resolvedProvider: 'deferred',
        requestConfig: expect.objectContaining({
          executionPlan: expect.objectContaining({
            deferredAnalysis: true,
            reservedMaximumCredits: 25,
            allowedModelIds: expect.arrayContaining(['nano-banana', 'real-esrgan']),
          }),
        }),
      })
    );
    expect(mocks.fetch.mock.calls.map(([url]) => url)).toEqual(['https://executor.example/wake']);
  });

  it.each([4, 8])('persists only compatible Auto candidates for a %sx request', async scale => {
    const response = await POST(
      request({
        ...payload,
        config: { qualityTier: 'auto', scale, additionalOptions: {} },
      })
    );

    expect(response.status).toBe(202);
    const admission = mocks.admit.mock.calls[0][0];
    const candidates: string[] = admission.requestConfig.executionPlan.allowedModelIds;
    expect(candidates.length).toBeGreaterThan(0);
    expect(candidates).not.toContain('nano-banana');
    expect(candidates).toContain(admission.resolvedModelId);
    for (const id of candidates) {
      expect(ModelRegistry.getInstance().getModel(id)?.supportedScales).toContain(scale);
    }
    expect(admission).toMatchObject({ scale, exactCharge: 25, resolvedProvider: 'deferred' });
  });

  it('rejects a Tail correlation mismatch before any reservation or account lookup', async () => {
    const response = await POST(
      request(payload, {
        'X-Upscale-Job-Id': '22222222-2222-4222-8222-222222222222',
      })
    );

    expect(response.status).toBe(400);
    expect(mocks.getReplay).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.admit).not.toHaveBeenCalled();
  });

  it('acknowledges the reservation while output is still pending', async () => {
    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body).toMatchObject({ accepted: true, jobId, status: 'queued' });
    expect(body.processing).toEqual({
      reservationJobId: jobId,
      creditsUsed: 1,
      creditsRemaining: 99,
    });
    expect(JSON.stringify(body)).not.toMatch(/imageUrl|imageData|deliveryToken|signed-input/);
    expect(mocks.from.mock.calls.map(([table]) => table)).toEqual([
      'free_credit_grants',
      'profiles',
    ]);
    expect(mocks.removeInput).not.toHaveBeenCalled();
  });

  it('rejects inline image bytes before creating or refunding a reservation', async () => {
    const response = await POST(
      request({
        ...payload,
        imageData: 'data:image/png;base64,iVBORw0KGgo=',
      })
    );

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe('VALIDATION_ERROR');
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.admit).not.toHaveBeenCalled();
    expect(mocks.removeInput).not.toHaveBeenCalled();
  });

  it('fails closed on unverifiable input before admission', async () => {
    mocks.input.mockResolvedValue({
      validationImageData: Buffer.from('not a supported image').toString('base64'),
      sizeBytes: 1024,
      mimeType: 'image/png',
    });

    const response = await POST(request());

    expect(response.status).toBe(400);
    expect(mocks.admit).not.toHaveBeenCalled();
    expect(mocks.removeInput).not.toHaveBeenCalled();
  });

  it('keeps a lost admission response recoverable without inserting a failed job or deleting input', async () => {
    mocks.admit.mockRejectedValueOnce(new Error('database connection lost after commit'));
    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      error: { code: 'INTERNAL_ERROR', details: { jobId, retryable: true } },
    });
    expect(mocks.removeInput).not.toHaveBeenCalled();
    expect(mocks.from.mock.calls.map(([table]) => table)).toEqual([
      'free_credit_grants',
      'profiles',
    ]);
    expect(mocks.track).not.toHaveBeenCalled();

    mocks.getReplay.mockResolvedValueOnce(accepted(1, 'processing'));
    const recovered = await POST(request());
    expect(recovered.status).toBe(202);
    expect(await recovered.json()).toMatchObject({ jobId, status: 'processing' });
    expect(mocks.admit).toHaveBeenCalledOnce();
  });

  it('preserves a confirmed admission when the advisory executor wake fails', async () => {
    mocks.fetch.mockRejectedValue(new Error('wake transport unavailable'));

    const response = await POST(request());

    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ jobId, status: 'queued' });
    expect(mocks.admit).toHaveBeenCalledOnce();
    expect(mocks.removeInput).not.toHaveBeenCalled();
  });

  it('returns a safe retryable error if storage lookup fails before admission', async () => {
    mocks.input.mockRejectedValue(new Error('https://storage.example/input?token=private-secret'));

    const response = await POST(request());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.error.details).toEqual({ jobId, retryable: true });
    expect(JSON.stringify(body)).not.toMatch(/storage.example|private-secret/);
    expect(mocks.admit).not.toHaveBeenCalled();
    expect(mocks.removeInput).not.toHaveBeenCalled();
  });

  it('preserves a typed ledger rejection without replacing its original job identity', async () => {
    mocks.admit.mockRejectedValue(
      new UpscaleJobError(
        'INVALID_REQUEST',
        'This job ID is already associated with different request settings.',
        409,
        { jobId }
      )
    );

    const response = await POST(request());

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: 'INVALID_REQUEST', details: { jobId } },
    });
    expect(mocks.admit).toHaveBeenCalledOnce();
    expect(mocks.removeInput).not.toHaveBeenCalled();
  });

  it('replays a terminal job without creating another reservation', async () => {
    mocks.getReplay.mockResolvedValue({
      ...accepted(),
      stage: 'failed',
      retryAfterMs: 0,
      httpStatus: 200,
      creditsRemaining: 100,
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ jobId, status: 'failed' });
    expect(mocks.admit).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.input).not.toHaveBeenCalled();
  });
});
