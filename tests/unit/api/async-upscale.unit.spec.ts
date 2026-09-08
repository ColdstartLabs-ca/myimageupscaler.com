import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.unmock('dayjs');
vi.unmock('dayjs/plugin/utc');

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn(),
  fetch: vi.fn(),
  track: vi.fn(),
  processImage: vi.fn(),
  rateLimit: vi.fn(),
  batchCheck: vi.fn(),
  batchRelease: vi.fn(),
  providerAvailability: vi.fn(),
  providerPermit: vi.fn(),
  providerSuccess: vi.fn(),
  providerFailure: vi.fn(),
  resolveInput: vi.fn(),
  removeInput: vi.fn(),
  refund: vi.fn(),
  recordOutput: vi.fn(),
  lifecycleCancel: vi.fn(),
  lifecycleFollowup: vi.fn(),
  lifecycleLowCredit: vi.fn(),
  recordCost: vi.fn(),
  createProcessor: vi.fn(),
  analyze: vi.fn(),
  env: {
    ENV: 'test',
    REPLICATE_API_TOKEN: 'provider-test-secret',
    AMPLITUDE_API_KEY: 'analytics-test-secret',
    ENABLE_PREMIUM_MODELS: true,
  },
}));

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: { from: mocks.from, rpc: mocks.rpc },
}));
vi.mock('@server/analytics', () => ({ trackServerEvent: mocks.track }));
vi.mock('@server/monitoring/logger', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), flush: vi.fn() }),
}));
vi.mock('@server/rateLimit', () => ({ upscaleRateLimit: { limit: mocks.rateLimit } }));
vi.mock('@server/services/anti-freeloader.service', () => ({
  ensureAntiFreeloaderProfile: (_request: unknown, _owner: string, profile: unknown) => profile,
}));
vi.mock('@server/services/batch-limit.service', () => ({
  batchLimitCheck: {
    checkAndIncrement: mocks.batchCheck,
    release: mocks.batchRelease,
    getUsage: () => ({ current: 1, limit: 50, resetAt: new Date(Date.now() + 3600000) }),
  },
}));
vi.mock('@server/services/provider-health.service', () => ({
  providerHealthService: {
    getAvailability: mocks.providerAvailability,
    acquireProcessingPermit: mocks.providerPermit,
    recordSuccess: mocks.providerSuccess,
    recordFailure: mocks.providerFailure,
  },
}));
vi.mock('@server/services/upscale-input-storage.service', () => ({
  resolveUpscaleInput: mocks.resolveInput,
  removeUpscaleInput: mocks.removeInput,
}));
vi.mock('@server/services/replicate/utils/credit-manager', () => ({
  creditManager: { refundReservation: mocks.refund, recordDeliverableOutput: mocks.recordOutput },
}));
vi.mock('@server/services/image-processor.factory', () => ({
  ImageProcessorFactory: {
    createProcessorForModel: mocks.createProcessor,
    createProcessor: mocks.createProcessor,
  },
}));
vi.mock('@server/services/email-lifecycle.service', () => ({
  getEmailLifecycleService: () => ({
    cancelPendingForUser: mocks.lifecycleCancel,
    queueFirstResultFollowup: mocks.lifecycleFollowup,
    queueLowCreditAlert: mocks.lifecycleLowCredit,
  }),
}));
vi.mock('@server/services/cost-telemetry.service', () => ({
  recordProcessingCostTelemetry: mocks.recordCost,
}));
vi.mock('@server/services/llm-image-analyzer', () => ({
  LLMImageAnalyzer: class {
    analyze = mocks.analyze;
  },
}));
vi.mock('@shared/config/env', () => ({
  isProduction: () => false,
  serverEnv: mocks.env,
  clientEnv: { NEXT_PUBLIC_BASE_URL: 'http://localhost' },
}));

import * as route from '@/app/api/upscale/route';
import { ModelRegistry } from '@server/services/model-registry';
import { IMAGE_VALIDATION } from '@shared/validation/upscale.schema';

const OWNER = '11111111-1111-4111-8111-111111111111';
const JOB_ID = '22222222-2222-4222-8222-222222222222';
const INPUT_URL = 'https://input.example/signed?token=private-input-token';
const OUTPUT_URL = 'https://replicate.delivery/pbxt/result.png';
const PREDICTION_ID = 'prediction-1';
const ATTEMPT_ID = '33333333-3333-4333-8333-333333333333';
const OBSERVATION_ID = '44444444-4444-4444-8444-444444444444';
const CLOCK = Date.parse('2026-09-07T12:00:00.000Z');

function payload(overrides: Record<string, unknown> = {}) {
  return {
    storagePath: `${OWNER}/${JOB_ID}.png`,
    jobId: JOB_ID,
    mimeType: 'image/png',
    config: { qualityTier: 'quick', scale: 2 },
    ...overrides,
  };
}

function request(body: unknown = payload(), owner: string | null = OWNER): NextRequest {
  return new NextRequest('http://localhost/api/upscale', {
    method: 'POST',
    headers: { ...(owner ? { 'X-User-Id': owner } : {}), 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });
}

function statusRequest(jobId = JOB_ID, owner: string | null = OWNER): NextRequest {
  return new NextRequest(`http://localhost/api/upscale?jobId=${encodeURIComponent(jobId)}`, {
    headers: owner ? { 'X-User-Id': owner } : {},
  });
}

function activeRequest(owner: string | null = OWNER, suffix = ''): NextRequest {
  return new NextRequest(`http://localhost/api/upscale?active=1${suffix}`, {
    headers: owner ? { 'X-User-Id': owner } : {},
  });
}

function pngHeader(width = 1024, height = 1024): string {
  const bytes = Buffer.alloc(32);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes.toString('base64');
}

interface IReservation extends Record<string, unknown> {
  user_id: string;
  job_id: string;
  status: string;
  provider_phase: string;
  request_fingerprint: string;
  provider_prediction_id: string | null;
  resolved_model: string;
  amount: number;
  subscription_amount: number;
  purchased_amount: number;
  result_context: Record<string, unknown>;
  async_delivery_token: string;
  execution_deadline_at: string;
  delivery_deadline_at: string | null;
  next_observation_at: string;
}

let reservation: IReservation | undefined;
let profile: Record<string, unknown>;
let batchExhausted: boolean;
let admissionOutcome: string | undefined;
let terminalEffectsClaimed: boolean;
let reservationDebits: number;
let refunds: number;
let activeJobs: Record<string, unknown>[];

function balance() {
  const subscription = Number(profile.subscription_credits_balance);
  const purchased = Number(profile.purchased_credits_balance);
  return { subscription, purchased, total: subscription + purchased };
}

function storedResult(extra: Record<string, unknown> = {}) {
  return structuredClone({ outcome: 'found', reservation, balance: balance(), ...extra });
}

// This boundary fixture checks application protocol decisions. Real SQL locking,
// health counters, pool arithmetic and refund races are proven in Phase 3.
function databaseRpc(name: string, args: Record<string, unknown>) {
  if (name === 'list_active_async_upscale_jobs') {
    return activeJobs.slice(0, Number(args.p_limit ?? 20));
  }
  if (name === 'read_async_upscale_job') {
    if (!reservation) return { outcome: args.p_request_fingerprint ? 'new' : 'not_found' };
    if (args.p_user_id !== reservation.user_id || args.p_job_id !== reservation.job_id) {
      return { outcome: 'not_found' };
    }
    if (
      args.p_request_fingerprint &&
      args.p_request_fingerprint !== reservation.request_fingerprint
    ) {
      return { outcome: 'conflict' };
    }
    return storedResult();
  }
  if (name === 'admit_async_upscale_job') {
    if (admissionOutcome || batchExhausted)
      return {
        outcome: admissionOutcome ?? 'batch_limit',
        balance: balance(),
        current_count: 250,
        batch_limit: 250,
        retry_at: new Date(CLOCK + 3600000).toISOString(),
      };
    if (reservation) return storedResult({ outcome: 'replay' });
    const amount = Number(args.p_amount);
    if (amount > balance().total) return { outcome: 'insufficient_credits', balance: balance() };
    const subscription = Math.min(balance().subscription, amount);
    const purchased = amount - subscription;
    profile.subscription_credits_balance = balance().subscription - subscription;
    profile.purchased_credits_balance = balance().purchased - purchased;
    reservationDebits += 1;
    reservation = {
      user_id: String(args.p_user_id),
      job_id: String(args.p_job_id),
      status: 'processing',
      execution_mode: 'replicate_async_v1',
      request_fingerprint: String(args.p_request_fingerprint),
      input_storage_path: args.p_input_storage_path,
      resolved_model: String(args.p_resolved_model),
      resolved_provider: 'replicate',
      quality_tier: args.p_quality_tier,
      result_context: args.p_result_context as Record<string, unknown>,
      attempt_id: ATTEMPT_ID,
      attempt_started_at: new Date().toISOString(),
      provider_phase: 'submitting',
      provider_prediction_id: null,
      amount,
      subscription_amount: subscription,
      purchased_amount: purchased,
      async_delivery_token: String(args.p_delivery_token),
      delivery_token_hash: args.p_delivery_token_hash,
      execution_deadline_at: new Date(Date.now() + 900000).toISOString(),
      delivery_deadline_at: null,
      next_observation_at: new Date().toISOString(),
      output_url: null,
      output_mime_type: null,
      output_expires_at: null,
      terminal_at: null,
      provider_health_recorded_at: null,
      terminal_effects_claimed_at: null,
    };
    return storedResult({ outcome: 'admitted' });
  }
  if (!reservation || args.p_user_id !== OWNER || args.p_job_id !== JOB_ID) {
    return { outcome: 'not_found' };
  }
  if (name === 'record_async_upscale_prediction') {
    if (args.p_attempt_id !== ATTEMPT_ID) return false;
    reservation.provider_prediction_id = String(args.p_prediction_id);
    reservation.provider_phase = 'processing';
    return true;
  }
  if (name === 'claim_async_upscale_observation') {
    const claimed =
      reservation.status === 'processing' &&
      reservation.provider_phase !== 'succeeded' &&
      Date.parse(reservation.next_observation_at) <= Date.now();
    if (claimed) reservation.next_observation_at = new Date(Date.now() + 5000).toISOString();
    return storedResult({ claimed, observation_token: claimed ? OBSERVATION_ID : undefined });
  }
  if (name === 'apply_async_upscale_observation') {
    if (reservation.status !== 'processing' || reservation.provider_phase === 'succeeded') {
      return storedResult({ transitioned: false });
    }
    if (args.p_failure_code || Date.parse(reservation.execution_deadline_at) <= Date.now()) {
      reservation.status = 'refunded';
      reservation.provider_phase = args.p_provider_status === 'canceled' ? 'canceled' : 'failed';
      reservation.failure_code = args.p_failure_code || 'TIMEOUT';
      reservation.failure_reason = args.p_failure_message;
      profile.subscription_credits_balance =
        balance().subscription + reservation.subscription_amount;
      profile.purchased_credits_balance = balance().purchased + reservation.purchased_amount;
      refunds += 1;
    } else if (args.p_provider_status === 'succeeded') {
      reservation.provider_phase = 'succeeded';
      reservation.output_url = args.p_output_url;
      reservation.output_mime_type = args.p_output_mime_type;
      reservation.provider_completed_at = args.p_provider_completed_at;
      const providerExpiry = args.p_provider_expires_at
        ? Date.parse(String(args.p_provider_expires_at))
        : Date.parse(String(args.p_provider_completed_at)) + 3600000;
      reservation.delivery_deadline_at = new Date(
        Math.min(providerExpiry - 300000, Date.now() + 1800000)
      ).toISOString();
      reservation.output_expires_at = reservation.delivery_deadline_at;
    } else return storedResult({ transitioned: false });
    reservation.terminal_at = new Date().toISOString();
    reservation.provider_health_recorded_at = new Date().toISOString();
    return storedResult({ transitioned: true });
  }
  if (name === 'claim_async_upscale_terminal_effects') {
    if (terminalEffectsClaimed) return false;
    terminalEffectsClaimed = true;
    reservation.terminal_effects_claimed_at = new Date().toISOString();
    return true;
  }
  throw new Error(`Unimplemented database boundary: ${name}`);
}

function providerResponse(body: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function oversizedProviderResponse(status: number, declared: boolean) {
  const cancel = vi.fn();
  let chunksSent = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      chunksSent += 1;
      if (chunksSent > 20) controller.close();
      else controller.enqueue(new Uint8Array(64 * 1024).fill(97));
    },
    cancel,
  });
  const response = new Response(stream, {
    status,
    headers: declared ? { 'Content-Length': String(1024 * 1024 + 1) } : {},
  });
  const json = vi.spyOn(response, 'json');
  const text = vi.spyOn(response, 'text');
  const arrayBuffer = vi.spyOn(response, 'arrayBuffer');
  return { response, cancel, json, text, arrayBuffer, chunksSent: () => chunksSent };
}

function succeeded(overrides: Record<string, unknown> = {}) {
  return {
    id: PREDICTION_ID,
    status: 'succeeded',
    output: [OUTPUT_URL],
    completed_at: new Date().toISOString(),
    ...overrides,
  };
}

function rpcCalls(name: string): Record<string, unknown>[] {
  return mocks.rpc.mock.calls.filter(([call]) => call === name).map(([, args]) => args);
}

function terminalEvents() {
  return mocks.track.mock.calls.filter(([event]) =>
    ['upscale_completed', 'image_upscaled', 'processing_failed'].includes(event)
  );
}

async function startAndSucceed(overrides: Record<string, unknown> = {}) {
  const admission = await route.POST(request());
  expect(admission.status).toBe(202);
  await vi.advanceTimersByTimeAsync(5000);
  mocks.fetch.mockResolvedValueOnce(providerResponse(succeeded(overrides)));
  return route.GET(statusRequest());
}

describe('authenticated async upscale contract', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(CLOCK);
    reservation = undefined;
    batchExhausted = false;
    admissionOutcome = undefined;
    terminalEffectsClaimed = false;
    reservationDebits = 0;
    refunds = 0;
    activeJobs = [];
    mocks.env.ENABLE_PREMIUM_MODELS = true;
    ModelRegistry.getInstance().reset();
    profile = {
      subscription_status: 'active',
      subscription_tier: 'pro',
      subscription_credits_balance: 100,
      purchased_credits_balance: 0,
      is_flagged_freeloader: false,
      region_tier: 'standard',
      signup_country: 'CA',
      created_at: '2026-01-01T00:00:00.000Z',
    };
    mocks.from.mockImplementation(() => ({
      select: () => ({
        eq: () => ({
          single: async () => ({
            data: structuredClone(profile),
            error: null,
          }),
          maybeSingle: async () => ({ data: { user_id: OWNER }, error: null }),
        }),
      }),
      insert: async () => ({ error: null }),
    }));
    mocks.rateLimit.mockResolvedValue({ success: true, remaining: 4, reset: Date.now() + 60000 });
    mocks.batchCheck.mockResolvedValue({
      allowed: true,
      current: 1,
      limit: 50,
      resetAt: new Date(Date.now() + 3600000),
    });
    mocks.batchRelease.mockResolvedValue(true);
    mocks.providerAvailability.mockResolvedValue({
      available: true,
      status: 'closed',
      retryAt: null,
    });
    mocks.providerPermit.mockResolvedValue(true);
    mocks.providerSuccess.mockResolvedValue(true);
    mocks.providerFailure.mockResolvedValue(true);
    mocks.refund.mockResolvedValue(true);
    mocks.recordOutput.mockResolvedValue(true);
    mocks.resolveInput.mockResolvedValue({
      imageReference: INPUT_URL,
      validationImageData: pngHeader(),
      sizeBytes: 1024,
      mimeType: 'image/png',
    });
    mocks.removeInput.mockResolvedValue(undefined);
    mocks.createProcessor.mockReturnValue({
      providerName: 'Replicate',
      processImage: mocks.processImage,
    });
    mocks.track.mockResolvedValue(undefined);
    mocks.lifecycleCancel.mockResolvedValue(undefined);
    mocks.lifecycleFollowup.mockResolvedValue(undefined);
    mocks.lifecycleLowCredit.mockResolvedValue(undefined);
    mocks.recordCost.mockResolvedValue(undefined);
    mocks.rpc.mockImplementation(async (name, args) => ({
      data: databaseRpc(name, args),
      error: null,
    }));
    mocks.fetch.mockImplementation(async (_url, init) =>
      providerResponse({
        id: PREDICTION_ID,
        status: init?.method === 'POST' ? 'starting' : 'processing',
      })
    );
    vi.stubGlobal('fetch', mocks.fetch);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('records server started telemetry once for the admitted winner before completion', async () => {
    expect((await route.POST(request())).status).toBe(202);
    expect((await route.POST(request())).status).toBe(202);
    const starts = mocks.track.mock.calls.filter(([event]) => event === 'image_upscale_started');
    expect(starts).toEqual([
      [
        'image_upscale_started',
        {
          telemetrySource: 'server',
          inputWidth: 1024,
          inputHeight: 1024,
          scaleFactor: 2,
          qualityTier: 'quick',
          modelUsed: 'real-esrgan',
        },
        { apiKey: mocks.env.AMPLITUDE_API_KEY, userId: OWNER },
      ],
    ]);
    expect(terminalEvents()).toEqual([]);
  });

  it.each([1, 3, 4])(
    'queues low-credit lifecycle once for a newly admitted balance from %i credits',
    async credits => {
      profile.subscription_credits_balance = credits;
      expect((await route.POST(request())).status).toBe(202);
      expect((await route.POST(request())).status).toBe(202);
      expect(mocks.lifecycleLowCredit).toHaveBeenCalledExactlyOnceWith({
        userId: OWNER,
        creditsRemaining: credits - 1,
        reason: credits === 1 ? 'zero' : 'low',
      });
    }
  );

  it('keeps normal balances and rejected admissions out of low-credit alerts', async () => {
    profile.subscription_credits_balance = 5;
    expect((await route.POST(request())).status).toBe(202);
    expect(mocks.lifecycleLowCredit).not.toHaveBeenCalled();
    reservation = undefined;
    admissionOutcome = 'batch_limit';
    mocks.track.mockClear();
    expect((await route.POST(request())).status).toBe(429);
    expect(mocks.lifecycleLowCredit).not.toHaveBeenCalled();
    expect(mocks.track).not.toHaveBeenCalled();
  });

  it('creates the prediction when admission analytics and low-credit alerts fail', async () => {
    profile.subscription_credits_balance = 1;
    mocks.track.mockRejectedValue(new Error('analytics unavailable'));
    mocks.lifecycleLowCredit.mockRejectedValue(new Error('lifecycle unavailable'));
    expect((await route.POST(request())).status).toBe(202);
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(reservationDebits).toBe(1);
    expect(refunds).toBe(0);
    expect(mocks.refund).not.toHaveBeenCalled();
  });

  it('preserves atomic batch rejection details and quota headers', async () => {
    batchExhausted = true;
    const response = await route.POST(request());
    expect(response.status).toBe(429);
    const resetAt = new Date(CLOCK + 3600000).toISOString();
    expect(await response.json()).toMatchObject({
      error: {
        code: 'BATCH_LIMIT_EXCEEDED',
        details: { current: 250, limit: 250, resetAt, upgradeUrl: '/pricing' },
      },
    });
    expect(response.headers.get('X-Batch-Limit')).toBe('250');
    expect(response.headers.get('X-Batch-Current')).toBe('250');
    expect(response.headers.get('X-Batch-Reset')).toBe(resetAt);
    expect(response.headers.get('Retry-After')).toBe('3600');
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(reservationDebits).toBe(0);
  });

  it('should return 202 before a thirty-second prediction finishes', async () => {
    vi.useFakeTimers();
    let predictionFinished = false;
    let beginProvider!: () => void;
    const providerStarted = new Promise<void>(resolve => {
      beginProvider = resolve;
    });
    const completed = new Promise(resolve => {
      setTimeout(() => {
        predictionFinished = true;
        resolve(undefined);
      }, 30000);
    });
    mocks.processImage.mockImplementation(async () => {
      beginProvider();
      await completed;
      return { imageUrl: 'https://replicate.delivery/result.png', mimeType: 'image/png' };
    });
    mocks.fetch.mockImplementation(async () => {
      beginProvider();
      return providerResponse({ id: PREDICTION_ID, status: 'starting' });
    });
    let response: Response | undefined;
    const admission = route.POST(request()).then(value => {
      response = value;
    });
    await Promise.race([providerStarted, admission]);
    await vi.advanceTimersByTimeAsync(8000);

    expect(
      response?.status,
      'POST must return 202 while provider completion is still pending'
    ).toBe(202);
    expect(predictionFinished).toBe(false);
    await admission;
    expect(mocks.processImage).not.toHaveBeenCalled();
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(reservationDebits).toBe(1);
    expect(terminalEvents()).toEqual([]);
    expect(mocks.lifecycleCancel).not.toHaveBeenCalled();
    expect(mocks.recordCost).not.toHaveBeenCalled();
    expect(mocks.providerSuccess).not.toHaveBeenCalled();
    expect(mocks.providerPermit).not.toHaveBeenCalled();
    expect(mocks.batchCheck).not.toHaveBeenCalled();
    expect(mocks.batchRelease).not.toHaveBeenCalled();
    expect(mocks.removeInput).not.toHaveBeenCalled();
    expect(rpcCalls('apply_async_upscale_observation')).toEqual([
      expect.objectContaining({ p_provider_status: 'processing' }),
    ]);
  });

  it('should reject foreign job reads', async () => {
    expect((await route.POST(request())).status).toBe(202);
    mocks.fetch.mockClear();
    const response = await route.GET(statusRequest(JOB_ID, '55555555-5555-4555-8555-555555555555'));
    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({ error: { code: 'NOT_FOUND' } });
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(rpcCalls('claim_async_upscale_observation').at(-1)).toEqual({
      p_user_id: '55555555-5555-4555-8555-555555555555',
      p_job_id: JOB_ID,
    });
  });

  it('returns a bounded owner-scoped active list without observing providers or exposing capabilities', async () => {
    await route.POST(request());
    activeJobs = Array.from({ length: 25 }, (_, index) => ({
      job_id: index === 0 ? JOB_ID : `66666666-6666-4666-8666-${String(index).padStart(12, '0')}`,
      status: 'processing',
      provider_phase: index === 0 ? 'submitting' : 'processing',
      created_at: new Date(CLOCK - index * 1000).toISOString(),
      execution_deadline_at: new Date(CLOCK + 900000).toISOString(),
      delivery_deadline_at: null,
      display: {
        fileName: index === 0 ? 'source.png' : `source-${index}.png`,
        mimeType: 'image/png',
        modelDisplayName: 'Upscale',
      },
      async_delivery_token: 'must-not-leak',
    }));
    mocks.fetch.mockClear();

    const response = await route.GET(activeRequest());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      jobs: expect.arrayContaining([
        expect.objectContaining({ jobId: JOB_ID, status: 'submitting' }),
      ]),
    });
    const body = await route.GET(activeRequest());
    const listed = await body.json();
    expect(listed.jobs).toHaveLength(20);
    expect(JSON.stringify(listed)).not.toContain('must-not-leak');
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(rpcCalls('list_active_async_upscale_jobs')).toHaveLength(2);
    expect(rpcCalls('list_active_async_upscale_jobs')[0]).toEqual({
      p_user_id: OWNER,
      p_limit: 20,
    });
  });

  it.each(['?active=1&jobId=' + JOB_ID, '?active=0', '?active=1&active=1'])(
    'rejects mixed or unsupported active query mode %s',
    async suffix => {
      const response = await route.GET(activeRequest(OWNER, suffix));
      expect(response.status).toBe(400);
      expect(mocks.rpc).not.toHaveBeenCalled();
    }
  );

  it('should show the same output when prediction status becomes succeeded', async () => {
    const response = await startAndSucceed({
      logs: 'private-provider-log',
      input: { image: INPUT_URL },
    });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      success: true,
      jobId: JOB_ID,
      status: 'ready',
      mimeType: 'image/png',
      expiresAt: CLOCK + 1805000,
      processing: {
        modelUsed: 'real-esrgan',
        modelDisplayName: 'Upscale',
        creditsUsed: 1,
        creditsRemaining: 99,
        reservationJobId: JOB_ID,
        deliveryToken: expect.any(String),
        processingTimeMs: expect.any(Number),
      },
      analysis: { modelRecommendation: 'real-esrgan' },
      dimensions: {
        input: { width: 1024, height: 1024 },
        output: { width: 2048, height: 2048 },
        actualScale: 2,
      },
    });
    expect(body.processing.deliveryToken.length).toBeGreaterThanOrEqual(32);
    expect(response.headers.get('Cache-Control')).toBe('no-store');
    expect(response.headers.get('Referrer-Policy')).toBe('no-referrer');
    expect(JSON.stringify(body)).not.toMatch(
      /replicate\.delivery|private-input-token|private-provider-log|provider-test-secret|output_url|imageData/
    );
    expect(reservation?.status).toBe('processing');
    expect(reservation?.output_url).toBe(OUTPUT_URL);
    expect(await (await route.GET(statusRequest())).json()).toEqual(body);
    expect(await (await route.POST(request())).json()).toEqual(body);
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(reservationDebits).toBe(1);
    expect(mocks.recordOutput).not.toHaveBeenCalled();
  });

  it.each([
    { premium: true, model: 'real-esrgan-large', inputKey: 'upscale' },
    { premium: false, model: 'real-esrgan-large', inputKey: 'upscale' },
  ])(
    'should preserve the large paid Quick fallback model and price ($model)',
    async ({ premium, model, inputKey }) => {
      mocks.env.ENABLE_PREMIUM_MODELS = premium;
      ModelRegistry.getInstance().reset();
      mocks.resolveInput.mockResolvedValue({
        imageReference: INPUT_URL,
        validationImageData: pngHeader(2048, 2048),
        sizeBytes: IMAGE_VALIDATION.MAX_SIZE_PAID,
        mimeType: 'image/png',
      });
      const response = await startAndSucceed();
      const body = await response.json();
      expect(body.processing).toMatchObject({
        modelUsed: model,
        creditsUsed: 1,
        dimensionPreservingFallback: true,
      });
      expect(body.dimensions).toEqual({
        input: { width: 2048, height: 2048 },
        output: { width: 4096, height: 4096 },
        actualScale: 2,
      });
      expect(rpcCalls('admit_async_upscale_job')[0]).toMatchObject({
        p_resolved_model: model,
        p_quality_tier: 'quick',
        p_amount: 1,
        p_input_storage_path: `${OWNER}/${JOB_ID}.png`,
      });
      const [url, init] = mocks.fetch.mock.calls[0];
      expect(String(url)).toBe('https://api.replicate.com/v1/predictions');
      expect(JSON.parse(init.body)).toMatchObject({
        version: expect.stringMatching(/^[a-f0-9]{64}$/),
        input: { image: INPUT_URL, [inputKey]: 2 },
      });
      expect(mocks.recordCost).toHaveBeenCalledWith(
        expect.objectContaining({
          attribution: expect.objectContaining({
            modelId: model,
            qualityTier: 'quick',
            scale: 2,
            creditsCharged: 1,
          }),
        })
      );
    }
  );

  it('keeps the largest accepted Quick 4x input on its existing model and one-credit price', async () => {
    mocks.resolveInput.mockResolvedValue({
      imageReference: INPUT_URL,
      validationImageData: pngHeader(1224, 1224),
      sizeBytes: IMAGE_VALIDATION.MAX_SIZE_PAID,
      mimeType: 'image/png',
    });
    const response = await route.POST(
      request(payload({ config: { qualityTier: 'quick', scale: 4 } }))
    );
    expect(response.status).toBe(202);
    expect(rpcCalls('admit_async_upscale_job')[0]).toMatchObject({
      p_resolved_model: 'real-esrgan',
      p_amount: 1,
    });
    const [url, init] = mocks.fetch.mock.calls[0];
    expect(String(url)).toBe('https://api.replicate.com/v1/predictions');
    expect(JSON.parse(init.body)).toEqual({
      version: ModelRegistry.getInstance().getModel('real-esrgan')!.modelVersion.split(':')[1],
      input: { image: INPUT_URL, scale: 4, face_enhance: false },
    });
  });

  it('preserves the rejection for oversized Quick 4x without reducing input dimensions', async () => {
    mocks.resolveInput.mockResolvedValue({
      imageReference: INPUT_URL,
      validationImageData: pngHeader(2048, 2048),
      sizeBytes: 1024,
      mimeType: 'image/png',
    });
    const response = await route.POST(
      request(payload({ config: { qualityTier: 'quick', scale: 4 } }))
    );
    expect(response.status).toBe(422);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(reservationDebits).toBe(0);
  });

  it('rejects a forged model hint before async admission', async () => {
    expect((await route.POST(request(payload({ resolvedModel: 'nano-banana-pro' })))).status).toBe(
      400
    );
    expect(rpcCalls('admit_async_upscale_job')).toHaveLength(0);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it.each(['processing', 'ready', 'refunded'])(
    'replays a %s job with zero credits and an exhausted batch allowance',
    async state => {
      if (state === 'ready') await startAndSucceed();
      else await route.POST(request());
      if (state === 'refunded' && reservation) {
        reservation.status = 'refunded';
        reservation.provider_phase = 'failed';
        reservation.failure_code = 'TIMEOUT';
      }
      profile.subscription_credits_balance = 0;
      profile.purchased_credits_balance = 0;
      batchExhausted = true;
      mocks.batchCheck.mockResolvedValue({
        allowed: false,
        current: 50,
        limit: 50,
        resetAt: new Date(CLOCK + 3600000),
      });
      mocks.resolveInput.mockClear();
      const creates = mocks.fetch.mock.calls.length;
      const response = await route.POST(request());
      const body = await response.json();
      expect(body.jobId).toBe(JOB_ID);
      expect(body.status).toBe(state);
      expect(body.error?.code).not.toBe('INSUFFICIENT_CREDITS');
      expect(body.error?.code).not.toBe('BATCH_LIMIT_EXCEEDED');
      expect(mocks.fetch).toHaveBeenCalledTimes(creates);
      expect(rpcCalls('admit_async_upscale_job')).toHaveLength(1);
      expect(reservationDebits).toBe(1);
      expect(mocks.resolveInput).not.toHaveBeenCalled();
    }
  );

  it('rejects changed settings for an existing job with a fingerprint conflict', async () => {
    await route.POST(request());
    const response = await route.POST(
      request(payload({ config: { qualityTier: 'quick', scale: 4 } }))
    );
    expect(response.status).toBe(409);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(reservationDebits).toBe(1);
  });

  it('canonicalizes accepted defaults and keeps signed input URLs out of the replay identity', async () => {
    await route.POST(request());
    const firstFingerprint = reservation?.request_fingerprint;
    mocks.resolveInput.mockResolvedValue({
      imageReference: `${INPUT_URL}-new`,
      validationImageData: pngHeader(),
      sizeBytes: 1024,
      mimeType: 'image/png',
    });
    const response = await route.POST(
      request(
        payload({
          config: {
            scale: 2,
            qualityTier: 'quick',
            additionalOptions: {
              preserveText: false,
              enhanceFaces: false,
              smartAnalysis: false,
              enhance: false,
            },
          },
        })
      )
    );
    expect(response.status).toBe(202);
    expect(firstFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(reservation?.request_fingerprint).toBe(firstFingerprint);
    expect(mocks.resolveInput).toHaveBeenCalledTimes(1);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it('rejects a foreign replay without admitting another prediction', async () => {
    await route.POST(request());
    expect(
      (await route.POST(request(payload(), '55555555-5555-4555-8555-555555555555'))).status
    ).toBe(404);
    expect(reservationDebits).toBe(1);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    { label: 'malformed JSON', body: '{', owner: OWNER, status: 400 },
    { label: 'missing input', body: {}, owner: OWNER, status: 400 },
    { label: 'invalid job ID', body: payload({ jobId: 'bad-id' }), owner: OWNER, status: 400 },
    { label: 'unauthenticated', body: payload(), owner: null, status: 401 },
  ])('rejects $label before provider creation', async ({ body, owner, status }) => {
    expect((await route.POST(request(body, owner))).status).toBe(status);
    expect(rpcCalls('admit_async_upscale_job')).toEqual([]);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it.each([
    { jobId: 'malformed', owner: OWNER, status: 400 },
    { jobId: JOB_ID, owner: null, status: 401 },
    { jobId: JOB_ID, owner: OWNER, status: 404 },
  ])(
    'returns $status for an invalid, unauthenticated or unknown status read',
    async ({ jobId, owner, status }) => {
      expect((await route.GET(statusRequest(jobId, owner))).status).toBe(status);
      expect(mocks.fetch).not.toHaveBeenCalled();
    }
  );

  it('retains premium tier protection for a free account', async () => {
    profile.subscription_status = null;
    profile.subscription_tier = null;
    const response = await route.POST(
      request(payload({ config: { qualityTier: 'ultra', scale: 2 } }))
    );
    expect(response.status).toBe(403);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(reservationDebits).toBe(0);
  });

  it('returns the existing credit error when a new job has no balance', async () => {
    profile.subscription_credits_balance = 0;
    const response = await route.POST(request());
    expect(response.status).toBe(402);
    expect(await response.json()).toMatchObject({ error: { code: 'INSUFFICIENT_CREDITS' } });
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it('returns Retry-After when a new admission is rate limited', async () => {
    mocks.rateLimit.mockResolvedValue({ success: false, remaining: 0, reset: CLOCK + 60000 });
    const response = await route.POST(request());
    expect(response.status).toBe(429);
    expect(Number(response.headers.get('Retry-After'))).toBeGreaterThan(0);
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(rpcCalls('admit_async_upscale_job')).toEqual([]);
  });

  it.each([
    { outcome: 'batch_limit', status: 429 },
    { outcome: 'insufficient_credits', status: 402 },
    { outcome: 'provider_unavailable', status: 503 },
  ])(
    'honors atomic admission rejection $outcome without provider work',
    async ({ outcome, status }) => {
      admissionOutcome = outcome;
      expect((await route.POST(request())).status).toBe(status);
      expect(mocks.fetch).not.toHaveBeenCalled();
      expect(reservationDebits).toBe(0);
      expect(mocks.batchCheck).not.toHaveBeenCalled();
      expect(mocks.providerPermit).not.toHaveBeenCalled();
    }
  );

  it('should avoid another create when submission outcome is unknown', async () => {
    mocks.fetch.mockRejectedValueOnce(new TypeError('connection lost after provider accepted'));
    const response = await route.POST(request());
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      jobId: JOB_ID,
      status: 'submitting',
      checking: true,
    });
    expect((await route.POST(request())).status).toBe(202);
    expect((await route.GET(statusRequest())).status).toBe(202);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(reservationDebits).toBe(1);
    expect(refunds).toBe(0);
    expect(mocks.refund).not.toHaveBeenCalled();
    expect(terminalEvents()).toEqual([]);
  });

  it('does not retry a provider create or turn a server error into a definite failure', async () => {
    mocks.fetch.mockResolvedValueOnce(providerResponse({ detail: 'provider unavailable' }, 503));
    expect((await route.POST(request())).status).toBe(202);
    expect((await route.POST(request())).status).toBe(202);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(refunds).toBe(0);
    expect(mocks.providerFailure).not.toHaveBeenCalled();
  });

  it.each([
    { status: 402, detail: 'payment required', failureKind: 'billing' },
    { status: 401, detail: 'authentication failed', failureKind: 'authentication' },
    { status: 429, detail: 'rate limit exceeded', failureKind: 'rate_limited' },
  ])(
    'maps definitive provider $status rejection through one terminal refund transition',
    async ({ status, detail, failureKind }) => {
      mocks.fetch.mockResolvedValueOnce(
        providerResponse(
          { detail: `${detail}; secret https://replicate.com/account/billing` },
          status
        )
      );
      const response = await route.POST(request());
      const body = await response.json();
      expect(response.status).toBe(503);
      expect(body).toMatchObject({ status: 'refunded', error: { code: 'AI_UNAVAILABLE' } });
      expect(JSON.stringify(body)).not.toMatch(/replicate|https?:\/\/|provider-test-secret/);
      expect(rpcCalls('apply_async_upscale_observation')).toEqual([
        expect.objectContaining({ p_failure_kind: failureKind }),
      ]);
      expect(mocks.providerFailure).not.toHaveBeenCalled();
      expect(refunds).toBe(1);
      expect(mocks.refund).not.toHaveBeenCalled();
      expect(mocks.batchRelease).not.toHaveBeenCalled();
      expect(terminalEvents().filter(([event]) => event === 'processing_failed')).toHaveLength(1);
      await route.POST(request());
      expect(mocks.fetch).toHaveBeenCalledTimes(1);
      expect(refunds).toBe(1);
    }
  );

  it.each([429, 503])(
    'keeps a known prediction recoverable after a provider status $status',
    async status => {
      await route.POST(request());
      await vi.advanceTimersByTimeAsync(5000);
      mocks.fetch.mockResolvedValueOnce(
        providerResponse({ detail: 'transient status outage' }, status, { 'Retry-After': '7' })
      );
      const response = await route.GET(statusRequest());
      expect(response.status).toBe(503);
      expect(Number(response.headers.get('Retry-After'))).toBeGreaterThan(0);
      expect(reservation?.status).toBe('processing');
      expect(reservation?.provider_prediction_id).toBe(PREDICTION_ID);
      expect(refunds).toBe(0);
      expect(terminalEvents()).toEqual([]);
      expect(mocks.fetch).toHaveBeenCalledTimes(2);
    }
  );

  it('returns a retryable database observation error without refunding the reservation', async () => {
    await route.POST(request());
    mocks.rpc.mockResolvedValueOnce({
      data: null,
      error: { message: 'db unavailable: private detail' },
    });
    const response = await route.GET(statusRequest());
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('private detail');
    expect(refunds).toBe(0);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
  });

  it('sends one bounded provider create without Prefer wait or a completion request', async () => {
    await route.POST(request());
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    const [, init] = mocks.fetch.mock.calls[0];
    const headers = new Headers(init.headers);
    expect(init.method).toBe('POST');
    expect(headers.get('Authorization')).toMatch(/provider-test-secret$/);
    expect(headers.has('Prefer')).toBe(false);
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.redirect).toBe('manual');
  });

  it('rejects provider redirects without following or refunding the accepted job', async () => {
    mocks.fetch.mockResolvedValueOnce(
      providerResponse({ detail: 'redirect to an unexpected provider endpoint' }, 302, {
        Location: 'https://attacker.example/provider',
      })
    );
    const response = await route.POST(request());
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({
      jobId: JOB_ID,
      status: 'submitting',
      checking: true,
    });
    expect(mocks.fetch).toHaveBeenCalledOnce();
    expect(mocks.fetch.mock.calls[0][1].redirect).toBe('manual');
    expect(reservation?.provider_prediction_id).toBeNull();
    expect(refunds).toBe(0);
  });

  it('uses the dedicated terminal transition and emits completion helpers once for winning observers', async () => {
    await route.POST(request());
    await vi.advanceTimersByTimeAsync(5000);
    mocks.fetch.mockResolvedValueOnce(providerResponse(succeeded()));
    await Promise.all([route.GET(statusRequest()), route.GET(statusRequest())]);
    await route.GET(statusRequest());
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
    expect(mocks.lifecycleCancel).toHaveBeenCalledOnce();
    expect(mocks.lifecycleCancel).toHaveBeenCalledWith(OWNER, 'user_processed_image', [
      'signup-no-upload-2h',
      'signup-no-upload-24h',
      'signup-no-upload-3d-blog',
      'winback-never-uploaded-14d',
    ]);
    expect(mocks.lifecycleFollowup).toHaveBeenCalledOnce();
    expect(mocks.lifecycleFollowup).toHaveBeenCalledWith(OWNER);
    expect(mocks.recordCost).toHaveBeenCalledOnce();
    expect(mocks.recordCost).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: OWNER,
        jobId: JOB_ID,
        outputImagePath: OUTPUT_URL,
        attribution: expect.objectContaining({
          modelId: 'real-esrgan',
          creditsCharged: 1,
          scale: 2,
          qualityTier: 'quick',
        }),
      })
    );
    expect(
      terminalEvents()
        .map(([event]) => event)
        .sort()
    ).toEqual(['image_upscaled', 'upscale_completed']);
    expect(
      rpcCalls('apply_async_upscale_observation').filter(
        call => call.p_provider_status === 'succeeded'
      )
    ).toEqual([
      expect.objectContaining({
        p_provider_status: 'succeeded',
        p_output_url: OUTPUT_URL,
        p_observation_token: OBSERVATION_ID,
      }),
    ]);
    expect(mocks.providerSuccess).not.toHaveBeenCalled();
    expect(rpcCalls('record_provider_health_outcome')).toEqual([]);
    expect(reservation?.provider_health_recorded_at).toBeTruthy();
    expect(refunds).toBe(0);
  });

  it('does not run remote completion helpers when another observer already claimed them', async () => {
    terminalEffectsClaimed = true;
    expect((await startAndSucceed()).status).toBe(200);
    expect(mocks.recordCost).not.toHaveBeenCalled();
    expect(mocks.lifecycleCancel).not.toHaveBeenCalled();
    expect(terminalEvents()).toEqual([]);
  });

  it.each(['analytics', 'lifecycle', 'cost'])(
    'keeps ready output deliverable when %s helpers throw',
    async helper => {
      if (helper === 'analytics')
        mocks.track.mockImplementation(async event => {
          if (['upscale_completed', 'image_upscaled'].includes(event))
            throw new Error('analytics offline');
        });
      if (helper === 'lifecycle')
        mocks.lifecycleCancel.mockRejectedValue(new Error('email offline'));
      if (helper === 'cost')
        mocks.recordCost.mockRejectedValue(new Error('cost telemetry offline'));
      expect((await startAndSucceed()).status).toBe(200);
      expect((await route.GET(statusRequest())).status).toBe(200);
      expect(reservation?.status).toBe('processing');
      expect(reservation?.provider_phase).toBe('succeeded');
      expect(refunds).toBe(0);
      expect(mocks.refund).not.toHaveBeenCalled();
      expect(terminalEvents().filter(([event]) => event === 'processing_failed')).toEqual([]);
    }
  );

  it.each([
    { completedAt: CLOCK - 50 * 60000, explicitExpiry: undefined },
    { completedAt: CLOCK, explicitExpiry: CLOCK + 10 * 60000 },
  ])(
    'uses the real provider completion or expiry time without extending output retention',
    async ({ completedAt, explicitExpiry }) => {
      const response = await startAndSucceed({
        completed_at: new Date(completedAt).toISOString(),
        ...(explicitExpiry ? { expires_at: new Date(explicitExpiry).toISOString() } : {}),
      });
      const body = await response.json();
      expect(body.expiresAt).toBe(CLOCK + 5 * 60000);
      expect(rpcCalls('apply_async_upscale_observation').at(-1)).toMatchObject({
        p_provider_completed_at: new Date(completedAt).toISOString(),
      });
      await vi.advanceTimersByTimeAsync(60000);
      expect((await (await route.GET(statusRequest())).json()).expiresAt).toBe(body.expiresAt);
    }
  );

  it.each([
    'https://attacker.example/result.png',
    'https://replicate.delivery.attacker.example/result.png',
    'http://replicate.delivery/result.png',
    'data:image/png;base64,AAAA',
  ])('never stores unapproved output %s', async output => {
    const response = await startAndSucceed({ output });
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain(output);
    expect(reservation?.output_url).toBeNull();
    expect(
      rpcCalls('apply_async_upscale_observation').some(call => call.p_output_url === output)
    ).toBe(false);
  });

  it.each([
    { lane: 'create', providerStatus: 200, declared: false },
    { lane: 'create', providerStatus: 400, declared: false },
    { lane: 'create', providerStatus: 400, declared: true },
    { lane: 'status', providerStatus: 200, declared: false },
    { lane: 'status', providerStatus: 503, declared: false },
    { lane: 'status', providerStatus: 503, declared: true },
  ])(
    'caps $lane metadata and $providerStatus error bodies at 1 MiB before parsing (declared $declared)',
    async ({ lane, providerStatus, declared }) => {
      if (lane === 'status') {
        await route.POST(request());
        await vi.advanceTimersByTimeAsync(5000);
      }
      const provider = oversizedProviderResponse(providerStatus, declared);
      mocks.fetch.mockResolvedValueOnce(provider.response);
      const parse = vi.spyOn(JSON, 'parse');
      const response =
        lane === 'create' ? await route.POST(request()) : await route.GET(statusRequest());
      expect(response.status).toBe(lane === 'create' ? 202 : 503);
      expect(provider.cancel).toHaveBeenCalledOnce();
      expect(provider.chunksSent()).toBeLessThanOrEqual(declared ? 2 : 18);
      expect(provider.json).not.toHaveBeenCalled();
      expect(provider.text).not.toHaveBeenCalled();
      expect(provider.arrayBuffer).not.toHaveBeenCalled();
      expect(
        parse.mock.calls.some(([value]) => typeof value === 'string' && value.length > 1024 * 1024)
      ).toBe(false);
      expect(refunds).toBe(0);
      expect(terminalEvents()).toEqual([]);
      await route.POST(request());
      expect(mocks.fetch).toHaveBeenCalledTimes(lane === 'create' ? 1 : 2);
    }
  );

  it('accepts bounded large provider metadata and strips the provider logs from the result', async () => {
    const response = await startAndSucceed({ logs: 'private-log '.repeat(75000) });
    expect(response.status).toBe(200);
    expect(await response.text()).not.toContain('private-log');
    expect(mocks.fetch).toHaveBeenCalledTimes(2);
  });

  it.each([
    { lane: 'create', stage: 'fetch', deadline: 8000 },
    { lane: 'create', stage: 'body', deadline: 8000 },
    { lane: 'status', stage: 'fetch', deadline: 5000 },
    { lane: 'status', stage: 'body', deadline: 5000 },
  ])(
    'aborts stalled $lane $stage work at its $deadline ms deadline',
    async ({ lane, stage, deadline }) => {
      if (lane === 'status') {
        await route.POST(request());
        await vi.advanceTimersByTimeAsync(5000);
      }
      const cancel = vi.fn();
      let providerStarted!: () => void;
      let signal: AbortSignal | undefined;
      const started = new Promise<void>(resolve => {
        providerStarted = resolve;
      });
      mocks.fetch.mockImplementationOnce(async (_url, init) => {
        signal = init.signal;
        providerStarted();
        if (stage === 'fetch') return new Promise<Response>(() => undefined);
        return new Response(new ReadableStream<Uint8Array>({ cancel }));
      });
      let response: Response | undefined;
      const pending = (lane === 'create' ? route.POST(request()) : route.GET(statusRequest())).then(
        value => {
          response = value;
        }
      );
      await Promise.race([started, pending]);
      await vi.advanceTimersByTimeAsync(deadline - 1);
      expect(response).toBeUndefined();
      await vi.advanceTimersByTimeAsync(1);
      await pending;
      expect(response?.status).toBe(lane === 'create' ? 202 : 503);
      expect(signal?.aborted).toBe(true);
      if (stage === 'body') expect(cancel).toHaveBeenCalledOnce();
      expect(refunds).toBe(0);
      expect(reservation?.status).toBe('processing');
      expect(terminalEvents()).toEqual([]);
      await route.POST(request());
      expect(mocks.fetch).toHaveBeenCalledTimes(lane === 'create' ? 1 : 2);
    }
  );

  it('does not issue another create after acceptance when prediction identity persistence fails', async () => {
    mocks.rpc.mockImplementation(async (name, args) =>
      name === 'record_async_upscale_prediction'
        ? { data: null, error: { message: 'database unavailable' } }
        : { data: databaseRpc(name, args), error: null }
    );
    const first = await route.POST(request());
    expect(first.status).toBe(503);
    const replay = await route.POST(request());
    expect(replay.status).toBe(202);
    expect(await replay.json()).toMatchObject({
      jobId: JOB_ID,
      status: 'submitting',
      checking: true,
    });
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(refunds).toBe(0);
  });

  it('keeps a malformed create response ambiguous without retrying or refunding', async () => {
    mocks.fetch.mockResolvedValueOnce(
      providerResponse({ status: 'starting', logs: 'provider-secret' })
    );
    expect((await route.POST(request())).status).toBe(202);
    expect((await route.POST(request())).status).toBe(202);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(refunds).toBe(0);
    expect(reservation?.provider_prediction_id).toBeNull();
  });

  it('does not accept a status response for a different provider prediction', async () => {
    const response = await startAndSucceed({ id: 'foreign-prediction' });
    expect(response.status).toBe(503);
    expect(reservation?.provider_prediction_id).toBe(PREDICTION_ID);
    expect(reservation?.output_url).toBeNull();
    expect(refunds).toBe(0);
  });

  it.each([
    { status: 'failed', error: 'NSFW safety rejection', failureCode: 'SAFETY', httpStatus: 422 },
    {
      status: 'failed',
      error: 'input greater than the max size',
      failureCode: 'IMAGE_TOO_LARGE',
      httpStatus: 422,
    },
    {
      status: 'failed',
      error: 'CUDA out of memory',
      failureCode: 'PROVIDER_UNAVAILABLE',
      httpStatus: 503,
    },
    { status: 'failed', error: 'provider timed out', failureCode: 'TIMEOUT', httpStatus: 503 },
    {
      status: 'canceled',
      error: 'prediction canceled',
      failureCode: 'PROCESSING_FAILED',
      httpStatus: 503,
    },
  ])(
    'settles definitive provider $status/$failureCode once with the existing failure classification',
    async ({ status, error, failureCode, httpStatus }) => {
      await route.POST(request());
      // Jobs admitted before durable recovery was introduced have no pinned
      // fallback request; they still settle safely using the original policy.
      if (reservation) delete reservation.result_context.recovery;
      await vi.advanceTimersByTimeAsync(5000);
      mocks.fetch.mockResolvedValueOnce(providerResponse({ id: PREDICTION_ID, status, error }));
      const response = await route.GET(statusRequest());
      expect(response.status).toBe(httpStatus);
      expect(await response.json()).toMatchObject({
        status: 'refunded',
        creditsRefunded: true,
        creditsRemaining: 100,
      });
      expect(rpcCalls('apply_async_upscale_observation').at(-1)).toMatchObject({
        p_provider_status: status,
        p_failure_code: failureCode,
      });
      if (['SAFETY', 'IMAGE_TOO_LARGE'].includes(failureCode)) {
        expect(rpcCalls('apply_async_upscale_observation').at(-1)?.p_failure_kind).toBeNull();
      }
      await route.GET(statusRequest());
      expect(refunds).toBe(1);
      expect(mocks.fetch).toHaveBeenCalledTimes(2);
      expect(mocks.lifecycleCancel).not.toHaveBeenCalled();
      expect(mocks.recordCost).not.toHaveBeenCalled();
      expect(terminalEvents().filter(([event]) => event === 'processing_failed')).toHaveLength(1);
    }
  );

  it('checks execution expiry through the dedicated transition for an unknown create outcome', async () => {
    mocks.fetch.mockRejectedValueOnce(new TypeError('provider response lost'));
    await route.POST(request());
    await vi.advanceTimersByTimeAsync(900000);
    const response = await route.GET(statusRequest());
    expect(await response.json()).toMatchObject({ status: 'refunded', creditsRefunded: true });
    expect(rpcCalls('apply_async_upscale_observation').at(-1)).toMatchObject({
      p_user_id: OWNER,
      p_job_id: JOB_ID,
      p_attempt_id: ATTEMPT_ID,
    });
    expect(refunds).toBe(1);
    expect(mocks.fetch).toHaveBeenCalledTimes(1);
    expect(mocks.refund).not.toHaveBeenCalled();
  });

  it('retains the synchronous Gemini call lane and existing success payload', async () => {
    const registry = ModelRegistry.getInstance();
    // Current registry entries all use Replicate; this fixture selects the
    // retained Gemini branch without replacing pricing or processing logic.
    const originalModel = registry.getModel.bind(registry);
    vi.spyOn(registry, 'getModel').mockImplementation(modelId => {
      const model = originalModel(modelId);
      return modelId === 'real-esrgan' && model ? { ...model, provider: 'gemini' } : model;
    });
    mocks.createProcessor.mockReturnValue({
      providerName: 'Gemini',
      processImage: mocks.processImage,
    });
    mocks.processImage.mockImplementation(async (_owner, _input, options) => {
      options.onCreditsDeducted({
        jobId: JOB_ID,
        amount: 1,
        newBalance: 99,
        subscriptionAmount: 1,
        purchasedAmount: 0,
      });
      return {
        imageUrl: 'https://replicate.delivery/gemini.png',
        mimeType: 'image/png',
        creditsRemaining: 99,
      };
    });
    const response = await route.POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      success: true,
      processing: {
        reservationJobId: JOB_ID,
        creditsUsed: 1,
        creditsRemaining: 99,
        deliveryToken: expect.any(String),
      },
    });
    expect(mocks.processImage).toHaveBeenCalledOnce();
    expect(mocks.fetch).not.toHaveBeenCalled();
    expect(rpcCalls('admit_async_upscale_job')).toEqual([]);
    expect(mocks.recordOutput).toHaveBeenCalledOnce();
  });
});
