import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  getReplay: vi.fn(),
  admit: vi.fn(),
  input: vi.fn(),
  availability: vi.fn(),
  rate: vi.fn(),
  track: vi.fn(),
  env: {
    ENV: 'test',
    AMPLITUDE_API_KEY: '',
    UPSCALE_DURABLE_EXECUTION_ENABLED: true,
    UPSCALE_DURABLE_COHORT_PERCENT: 100,
    UPSCALE_EXECUTOR_BASE_URL: 'https://executor.example',
    UPSCALE_EXECUTOR_SHARED_SECRET: 'dedicated-test-wake-secret',
    UPSCALE_BUILD_ID: 'test-build',
    UPSCALE_EXECUTION_DEADLINE_SECONDS: 900,
    UPSCALE_SUBMISSION_DEADLINE_SECONDS: 900,
  },
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
  ensureAntiFreeloaderProfile: async (_r: unknown, _u: unknown, p: unknown) => p,
}));
vi.mock('@server/services/provider-health.service', () => ({
  providerHealthService: { getAvailability: mocks.availability },
}));
vi.mock('@server/rateLimit', () => ({
  upscaleRateLimit: { limit: mocks.rate },
  rateLimit: { limit: mocks.rate },
}));
vi.mock('@server/analytics', () => ({ trackServerEvent: mocks.track }));
vi.mock('@server/monitoring/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), flush: vi.fn() }),
}));
vi.mock('@shared/config/env', () => ({
  serverEnv: mocks.env,
  clientEnv: {},
  isProduction: () => false,
}));

import { POST } from '@/app/api/upscale/route';
import { POST as estimateCredits } from '@/app/api/credit-estimate/route';
const userId = '22222222-2222-4222-8222-222222222222';
const jobId = '11111111-1111-4111-8111-111111111111';
const payload = {
  jobId,
  storagePath: `${userId}/original.png`,
  mimeType: 'image/png',
  config: { qualityTier: 'quick', scale: 2, additionalOptions: {} },
};
const accepted = {
  jobId,
  stage: 'queued',
  status: 'queued',
  exactCharge: 1,
  creditsRemaining: 99,
  batchLimit: 10,
  httpStatus: 202,
  retryAfterMs: 2000,
  statusUrl: `/api/upscale/jobs?jobId=${jobId}`,
};
function request(headers: Record<string, string> = {}, body: unknown = payload) {
  return new NextRequest('http://localhost/api/upscale', {
    method: 'POST',
    headers: {
      'X-User-Id': userId,
      'X-Upscale-Protocol': '2',
      'Content-Type': 'application/json',
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

describe('durable upscale admission', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.env.UPSCALE_DURABLE_EXECUTION_ENABLED = true;
    mocks.env.UPSCALE_DURABLE_COHORT_PERCENT = 100;
    mocks.getReplay.mockResolvedValue(null);
    mocks.admit.mockResolvedValue(accepted);
    mocks.rate.mockResolvedValue({ success: true, remaining: 4, reset: Date.now() + 60_000 });
    mocks.availability.mockResolvedValue({ available: true, status: 'closed' });
    mocks.track.mockResolvedValue(true);
    mocks.from.mockImplementation((table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { user_id: userId }, error: null }),
          single: async () => ({
            data:
              table === 'profiles'
                ? {
                    subscription_status: 'active',
                    subscription_tier: 'hobby',
                    subscription_credits_balance: 100,
                    purchased_credits_balance: 0,
                    is_flagged_freeloader: false,
                    region_tier: 'standard',
                    signup_country: 'CA',
                    created_at: '2026-01-01T00:00:00Z',
                  }
                : null,
            error: null,
          }),
        }),
      }),
    }));
    mocks.input.mockResolvedValue({
      imageReference: 'https://storage.example/input',
      validationImageData: 'iVBORw0KGgoAAAANSUhEUgAAAEAAAABA',
      sizeBytes: 1024,
      mimeType: 'image/png',
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}')));
  });

  it('rejects an old client before any reservation or account lookup', async () => {
    const response = await POST(request({ 'X-Upscale-Protocol': '1' }));
    expect(response.status).toBe(426);
    expect((await response.json()).error.code).toBe('UPDATE_REQUIRED');
    expect(mocks.admit).not.toHaveBeenCalled();
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it('admits a fixed plan without waiting for a provider or analytics response', async () => {
    mocks.track.mockReturnValue(new Promise(() => {}));
    const response = await Promise.race([
      POST(request()),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('admission waited on external work')), 1000)
      ),
    ]);
    expect(response.status).toBe(202);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(await response.json()).toMatchObject({
      jobId,
      status: 'queued',
      statusUrl: accepted.statusUrl,
    });
    expect(mocks.admit).toHaveBeenCalledOnce();
    expect(mocks.admit.mock.calls[0][0]).toMatchObject({
      userId,
      jobId,
      inputObjectPath: payload.storagePath,
      billingModelId: 'real-esrgan',
      resolvedModelId: 'real-esrgan',
    });
  });

  it('recovers the original admission before changed account, cohort or new-admission limits', async () => {
    mocks.env.UPSCALE_DURABLE_EXECUTION_ENABLED = false;
    mocks.getReplay.mockResolvedValue({ ...accepted, stage: 'processing' });
    mocks.rate.mockResolvedValue({ success: false, remaining: 0, reset: Date.now() + 60_000 });
    const response = await POST(request());
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ jobId, status: 'processing' });
    expect(mocks.from).not.toHaveBeenCalled();
    expect(mocks.input).not.toHaveBeenCalled();
    expect(mocks.admit).not.toHaveBeenCalled();
  });

  it('pauses new admission without charging when the executor cohort is disabled', async () => {
    mocks.env.UPSCALE_DURABLE_EXECUTION_ENABLED = false;
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(mocks.admit).not.toHaveBeenCalled();
    expect(mocks.input).not.toHaveBeenCalled();
  });

  it('preserves recovery when a committed admission response is lost', async () => {
    mocks.admit.mockRejectedValue(new Error('connection lost after commit'));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ error: { details: { jobId, retryable: true } } });
    expect(mocks.admit).toHaveBeenCalledOnce();
  });

  it('reserves the displayed Auto maximum and defers analysis without changing its reservation on retry', async () => {
    const config = { qualityTier: 'auto', scale: 2, additionalOptions: { smartAnalysis: true } };
    const estimate = await estimateCredits(
      request({}, { config, analysisHint: { contentType: 'document' } })
    );
    const quote = await estimate.json();
    expect(estimate.status).toBe(200);
    expect(quote.breakdown.totalCredits).toBe(25);
    const response = await POST(request({}, { ...payload, config }));
    expect(response.status).toBe(202);
    expect(mocks.admit).toHaveBeenCalledWith(
      expect.objectContaining({
        exactCharge: quote.breakdown.totalCredits,
        resolvedProvider: 'deferred',
        selectionMode: 'auto',
        requestConfig: expect.objectContaining({
          executionPlan: expect.objectContaining({
            reservedMaximumCredits: 25,
            deferredAnalysis: true,
          }),
        }),
      })
    );
  });
});
