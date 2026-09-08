import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_ENHANCEMENT_SETTINGS, type IUpscaleConfig } from '@/shared/types/coreflow.types';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  track: vi.fn(),
  storageFrom: vi.fn(),
  uploadToSignedUrl: vi.fn(),
}));

vi.mock('@shared/utils/supabase/client', () => ({
  createClient: vi.fn(() => ({
    auth: {
      getSession: mocks.getSession,
    },
    storage: {
      from: mocks.storageFrom.mockImplementation(() => ({
        uploadToSignedUrl: mocks.uploadToSignedUrl,
      })),
    },
  })),
}));

vi.mock('@client/analytics', () => ({
  analytics: {
    track: mocks.track,
  },
}));

import {
  parseJsonResponse,
  processImage,
  reportUpscaleEdgeFailure,
  UpscaleEdgeError,
} from '@client/utils/api-client';

const config: IUpscaleConfig = {
  qualityTier: 'quick',
  scale: 4,
  additionalOptions: DEFAULT_ENHANCEMENT_SETTINGS,
};

describe('upscale API response handling', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getSession.mockResolvedValue({
      data: { session: { access_token: 'token-123' } },
    });
    class LoadingImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) {
        queueMicrotask(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', LoadingImage);
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: vi.fn(() => 'blob:https://app.test/output-1'),
      revokeObjectURL: vi.fn(),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('uploads image bytes directly to storage before dispatching the upscale job', async () => {
    mocks.uploadToSignedUrl.mockResolvedValue({ data: { path: 'user-1/job-1.png' }, error: null });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ storagePath: 'user-1/job-1.png', uploadToken: 'signed-token' })
      )
      .mockResolvedValueOnce(
        Response.json({
          mimeType: 'image/png',
          processing: {
            creditsRemaining: 4,
            creditsUsed: 1,
            reservationJobId: '11111111-1111-4111-8111-111111111111',
            deliveryToken: 'delivery-token-'.padEnd(43, 'x'),
          },
        })
      )
      .mockResolvedValueOnce(new Response(new Blob(['image-bytes']), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID: () => '11111111-1111-4111-8111-111111111111' });

    const file = new File(['image-bytes'], 'source.png', { type: 'image/png' });
    await expect(processImage(file, config, vi.fn())).resolves.toMatchObject({
      imageUrl: 'blob:https://app.test/output-1',
      creditsRemaining: 4,
      creditsUsed: 1,
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      '/api/upscale/upload',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          filename: 'source.png',
          mimeType: 'image/png',
          sizeBytes: file.size,
          jobId: '11111111-1111-4111-8111-111111111111',
        }),
      })
    );
    expect(mocks.uploadToSignedUrl).toHaveBeenCalledWith(
      'user-1/job-1.png',
      'signed-token',
      file,
      expect.objectContaining({ contentType: 'image/png', upsert: false })
    );
    expect(mocks.storageFrom).toHaveBeenCalledWith('upscale-inputs');

    const upscaleBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(upscaleBody).toMatchObject({
      storagePath: 'user-1/job-1.png',
      mimeType: 'image/png',
      jobId: '11111111-1111-4111-8111-111111111111',
      config,
    });
    expect(upscaleBody).not.toHaveProperty('imageData');
    expect(fetchMock.mock.calls[1][1]?.headers).toMatchObject({
      'X-Upscale-Job-Id': '11111111-1111-4111-8111-111111111111',
    });
  });

  it('retries the same grant idempotently after a lost upload response', async () => {
    mocks.uploadToSignedUrl
      .mockRejectedValueOnce(new Error('upload response lost after storage commit'))
      .mockResolvedValueOnce({ data: { path: 'user-1/job-1.png' }, error: null });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ storagePath: 'user-1/job-1.png', uploadToken: 'signed-token' })
      )
      .mockResolvedValueOnce(
        Response.json({
          mimeType: 'image/png',
          processing: {
            creditsRemaining: 4,
            creditsUsed: 1,
            reservationJobId: '11111111-1111-4111-8111-111111111111',
            deliveryToken: 'delivery-token-'.padEnd(43, 'x'),
          },
        })
      )
      .mockResolvedValueOnce(new Response(new Blob(['image-bytes']), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID: () => '11111111-1111-4111-8111-111111111111' });

    const file = new File(['image-bytes'], 'source.png', { type: 'image/png' });
    await expect(processImage(file, config, vi.fn())).resolves.toMatchObject({
      imageUrl: 'blob:https://app.test/output-1',
    });

    expect(mocks.uploadToSignedUrl).toHaveBeenCalledTimes(2);
    expect(mocks.uploadToSignedUrl).toHaveBeenNthCalledWith(
      1,
      'user-1/job-1.png',
      'signed-token',
      file,
      expect.objectContaining({ contentType: 'image/png', upsert: false })
    );
    expect(mocks.uploadToSignedUrl).toHaveBeenNthCalledWith(
      2,
      'user-1/job-1.png',
      'signed-token',
      file,
      expect.objectContaining({ contentType: 'image/png', upsert: false })
    );
    expect(fetchMock.mock.calls.filter(call => call[0] === '/api/upscale')).toHaveLength(1);
  });

  it('continues after an immutable upload reports the committed object conflict', async () => {
    mocks.uploadToSignedUrl.mockResolvedValueOnce({
      data: null,
      error: { statusCode: 409, message: 'The resource already exists' },
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ storagePath: 'user-1/job-1.png', uploadToken: 'signed-token' })
      )
      .mockResolvedValueOnce(
        Response.json({
          mimeType: 'image/png',
          processing: {
            creditsRemaining: 4,
            creditsUsed: 1,
            reservationJobId: '11111111-1111-4111-8111-111111111111',
            deliveryToken: 'delivery-token-'.padEnd(43, 'x'),
          },
        })
      )
      .mockResolvedValueOnce(new Response(new Blob(['image-bytes']), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID: () => '11111111-1111-4111-8111-111111111111' });

    const file = new File(['image-bytes'], 'source.png', { type: 'image/png' });
    await expect(processImage(file, config, vi.fn())).resolves.toMatchObject({
      imageUrl: 'blob:https://app.test/output-1',
    });

    expect(mocks.uploadToSignedUrl).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls.filter(call => call[0] === '/api/upscale')).toHaveLength(1);
  });

  it('downloads staged output through the same job/token capability without exposing raw provider URLs', async () => {
    mocks.uploadToSignedUrl.mockResolvedValue({ data: { path: 'user-1/job-1.png' }, error: null });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ storagePath: 'user-1/job-1.png', uploadToken: 'signed-token' })
      )
      .mockResolvedValueOnce(
        Response.json({
          mimeType: 'image/png',
          processing: {
            creditsRemaining: 4,
            creditsUsed: 1,
            reservationJobId: '11111111-1111-4111-8111-111111111111',
            deliveryToken: 'delivery-token-'.padEnd(43, 'x'),
          },
        })
      )
      .mockResolvedValueOnce(new Response(new Blob(['image-bytes']), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID: () => '11111111-1111-4111-8111-111111111111' });

    const file = new File(['image-bytes'], 'source.png', { type: 'image/png' });
    await expect(processImage(file, config, vi.fn())).resolves.toMatchObject({
      imageUrl: 'blob:https://app.test/output-1',
    });

    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      '/api/upscale/output',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({
          reservationJobId: '11111111-1111-4111-8111-111111111111',
          deliveryToken: 'delivery-token-'.padEnd(43, 'x'),
        }),
      })
    );
    expect(JSON.stringify(fetchMock.mock.calls[1][1]?.body)).not.toContain('replicate.delivery');
  });

  it('retries the same output capability after a transient stream/blob failure without another upscale call', async () => {
    mocks.uploadToSignedUrl.mockResolvedValue({ data: { path: 'user-1/job-1.png' }, error: null });
    const abortingResponse = new Response(
      new ReadableStream({
        pull(controller) {
          controller.error(new Error('stream aborted'));
        },
      }),
      { status: 200 }
    );
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ storagePath: 'user-1/job-1.png', uploadToken: 'signed-token' })
      )
      .mockResolvedValueOnce(
        Response.json({
          mimeType: 'image/png',
          processing: {
            creditsRemaining: 4,
            creditsUsed: 1,
            reservationJobId: '11111111-1111-4111-8111-111111111111',
            deliveryToken: 'delivery-token-'.padEnd(43, 'x'),
          },
        })
      )
      .mockResolvedValueOnce(abortingResponse)
      .mockResolvedValueOnce(new Response(new Blob(['image-bytes']), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID: () => '11111111-1111-4111-8111-111111111111' });

    const file = new File(['image-bytes'], 'source.png', { type: 'image/png' });

    await expect(processImage(file, config, vi.fn())).resolves.toMatchObject({
      imageUrl: 'blob:https://app.test/output-1',
    });

    expect(fetchMock.mock.calls.filter(call => call[0] === '/api/upscale')).toHaveLength(1);
    expect(fetchMock.mock.calls.filter(call => call[0] === '/api/upscale/output')).toHaveLength(2);
    expect(fetchMock.mock.calls[2][1]?.body).toBe(fetchMock.mock.calls[3][1]?.body);
  });

  it('uses exactCharge from durable status as creditsUsed when a ready job is delivered', async () => {
    mocks.uploadToSignedUrl.mockResolvedValue({ data: { path: 'user-1/job-1.png' }, error: null });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ storagePath: 'user-1/job-1.png', uploadToken: 'signed-token' })
      )
      .mockResolvedValueOnce(
        Response.json(
          {
            success: true,
            accepted: true,
            jobId: '11111111-1111-4111-8111-111111111111',
            status: 'queued',
            processing: {
              creditsRemaining: 8,
              creditsUsed: 2,
            },
          },
          { status: 202 }
        )
      )
      .mockResolvedValueOnce(
        Response.json({
          success: true,
          jobId: '11111111-1111-4111-8111-111111111111',
          status: 'ready',
          exactCharge: 2,
          deliveryToken: 'delivery-token-'.padEnd(43, 'x'),
        })
      )
      .mockResolvedValueOnce(new Response(new Blob(['image-bytes']), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID: () => '11111111-1111-4111-8111-111111111111' });

    const file = new File(['image-bytes'], 'source.png', { type: 'image/png' });

    await expect(processImage(file, config, vi.fn())).resolves.toMatchObject({
      durable: true,
      creditsUsed: 2,
      creditsRemaining: 8,
      imageUrl: 'blob:https://app.test/output-1',
    });
  });

  it('does not retry 4xx output capability failures', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.uploadToSignedUrl.mockResolvedValue({ data: { path: 'user-1/job-1.png' }, error: null });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({ storagePath: 'user-1/job-1.png', uploadToken: 'signed-token' })
      )
      .mockResolvedValueOnce(
        Response.json({
          mimeType: 'image/png',
          processing: {
            creditsRemaining: 4,
            creditsUsed: 1,
            reservationJobId: '11111111-1111-4111-8111-111111111111',
            deliveryToken: 'delivery-token-'.padEnd(43, 'x'),
          },
        })
      )
      .mockResolvedValueOnce(
        Response.json({ error: { message: 'Output capability was not found' } }, { status: 404 })
      );
    vi.stubGlobal('fetch', fetchMock);
    vi.stubGlobal('crypto', { randomUUID: () => '11111111-1111-4111-8111-111111111111' });

    const file = new File(['image-bytes'], 'source.png', { type: 'image/png' });

    await expect(processImage(file, config, vi.fn())).rejects.toThrow(
      'Output capability was not found'
    );
    expect(fetchMock.mock.calls.filter(call => call[0] === '/api/upscale/output')).toHaveLength(1);
  });

  it('should throw UpscaleEdgeError when response is HTML', async () => {
    const response = new Response('<!DOCTYPE html><html>edge failure</html>', {
      status: 503,
      headers: {
        'content-type': 'text/html',
        'cf-ray': 'abc-123',
      },
    });

    await expect(parseJsonResponse(response)).rejects.toBeInstanceOf(UpscaleEdgeError);
  });

  it('should include cf-ray and status when edge returns HTML', async () => {
    const response = new Response('<!DOCTYPE html>'.padEnd(240, 'x'), {
      status: 503,
      headers: {
        'content-type': 'text/html',
        'cf-ray': 'abc-123',
      },
    });

    const error = await parseJsonResponse(response).catch(value => value as UpscaleEdgeError);

    expect(error).toBeInstanceOf(UpscaleEdgeError);
    expect(error.status).toBe(503);
    expect(error.rayId).toBe('abc-123');
    expect(error.bodyPreview).toHaveLength(200);
  });

  it('should use the typed edge error when the upscale response is HTML', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response('<!DOCTYPE html><title>Worker failed</title>', {
          status: 503,
          headers: {
            'content-type': 'text/html',
            'cf-ray': 'abc-123',
          },
        })
      )
    );

    const file = new File(['image'], 'large.png', { type: 'image/png' });

    await expect(processImage(file, config, vi.fn())).rejects.toMatchObject({
      name: 'UpscaleEdgeError',
      status: 503,
      rayId: 'abc-123',
      message: 'Upscale failed (HTTP 503, ref: abc-123). Please retry.',
    });
  });

  it('should report only bounded edge metadata to the authenticated observer', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 202 }));
    vi.stubGlobal('fetch', fetchMock);

    const metadata = {
      qualityTier: config.qualityTier,
      scale: config.scale,
      jobId: '11111111-1111-4111-8111-111111111111',
    };
    await reportUpscaleEdgeFailure({ status: 503, rayId: 'abc-123' }, metadata);

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/upscale/failure-observation',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({ Authorization: 'Bearer token-123' }),
        body: JSON.stringify({
          status: 503,
          rayId: 'abc-123',
          qualityTier: 'quick',
          scale: 4,
          jobId: metadata.jobId,
        }),
      })
    );
    expect(JSON.stringify(fetchMock.mock.calls[0][1])).not.toContain('html');
  });

  it('should keep observer delivery best-effort when the observer request fails', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('observer unavailable')));

    await expect(
      reportUpscaleEdgeFailure(
        { status: 503, rayId: 'abc-123' },
        { qualityTier: config.qualityTier, scale: config.scale }
      )
    ).resolves.toBeUndefined();
  });
});

describe('durable upscale recovery protocol', () => {
  const jobId = '11111111-1111-4111-8111-111111111111';
  const file = new File(['input'], 'source.png', { type: 'image/png' });
  const ready = (token = 'first-capability') =>
    Response.json({
      jobId,
      status: 'ready',
      deliveryToken: token,
      exactCharge: 2,
      creditsRemaining: 8,
    });
  const accepted = () =>
    Response.json({ jobId, status: 'queued', accepted: true }, { status: 202 });
  const grant = () => Response.json({ storagePath: `user-1/${jobId}.png`, uploadToken: 'grant' });
  const output = () =>
    new Response(new Blob(['output']), { headers: { 'content-type': 'image/png' } });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    mocks.getSession.mockResolvedValue({ data: { session: { access_token: 'token-123' } } });
    mocks.uploadToSignedUrl.mockResolvedValue({ error: null });
    Object.defineProperty(document, 'visibilityState', { configurable: true, value: 'visible' });
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    class LoadingImage {
      onload: (() => void) | null = null;
      set src(_value: string) {
        Promise.resolve().then(() => this.onload?.());
      }
    }
    vi.stubGlobal('Image', LoadingImage);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:original-output');
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('looks up the original ID through unavailable status responses before retrying admission', async () => {
    let lookups = 0;
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/upload')) return grant();
      if (url === '/api/upscale') return Response.json({ error: 'unavailable' }, { status: 503 });
      if (url.includes('/jobs?'))
        return ++lookups === 1 ? new Response(null, { status: 503 }) : ready();
      return output();
    });
    vi.stubGlobal('fetch', fetchMock);
    const pending = processImage(file, config, vi.fn(), { jobId });
    await vi.advanceTimersByTimeAsync(15_000);
    await expect(pending).resolves.toMatchObject({ jobId, durable: true });
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/upscale')).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/upscale/failure-observation',
      expect.objectContaining({
        body: JSON.stringify({ status: 503, rayId: null, qualityTier: 'quick', scale: 4, jobId }),
      })
    );
    expect(
      fetchMock.mock.calls
        .filter(([url]) => url.includes('/jobs?'))
        .every(([url]) => url.includes(jobId))
    ).toBe(true);
  });

  it('recovers malformed JSON acceptance and advertises durable protocol support', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/upload')) return grant();
      if (url === '/api/upscale')
        return new Response('{', { status: 202, headers: { 'content-type': 'application/json' } });
      if (url.includes('/jobs?')) return ready();
      return output();
    });
    vi.stubGlobal('fetch', fetchMock);
    const pending = processImage(file, config, vi.fn(), { jobId }).catch(error => error);
    await vi.advanceTimersByTimeAsync(5_000);
    expect(await pending).toMatchObject({ jobId, durable: true });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/upscale',
      expect.objectContaining({
        headers: expect.objectContaining({ 'X-Upscale-Protocol': '2' }),
      })
    );
  });

  it('retries identical admission only after a confirmed 404 at 2, 5 and 10 seconds', async () => {
    const submissions: { time: number; body: unknown }[] = [];
    const startedAt = Date.now();
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      if (url.endsWith('/upload')) return grant();
      if (url === '/api/upscale') {
        submissions.push({ time: Date.now() - startedAt, body: init?.body });
        return submissions.length < 4 ? new Response('gateway', { status: 503 }) : accepted();
      }
      if (url.includes('/jobs?'))
        return submissions.length < 4 ? new Response(null, { status: 404 }) : ready();
      return output();
    });
    vi.stubGlobal('fetch', fetchMock);
    const pending = processImage(file, config, vi.fn(), { jobId });
    await vi.advanceTimersByTimeAsync(20_000);
    await expect(pending).resolves.toMatchObject({ jobId });
    expect(submissions.map(value => value.time)).toEqual([0, 2000, 7000, 17000]);
    expect(new Set(submissions.map(value => value.body)).size).toBe(1);
  });

  it('waits two seconds before polling and caps every jittered interval at ten seconds', async () => {
    const { resumeDurableUpscale } = await import('@client/utils/api-client');
    const controller = new AbortController();
    const polls: number[] = [];
    vi.spyOn(Math, 'random').mockReturnValue(1);
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (url.endsWith('/upload')) return grant();
        if (url === '/api/upscale') return accepted();
        polls.push(Date.now());
        return Response.json({ jobId, status: 'processing' });
      })
    );
    const pending = processImage(file, config, vi.fn(), { jobId, signal: controller.signal }).catch(
      error => error
    );
    await vi.advanceTimersByTimeAsync(1999);
    expect(polls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(polls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(120_000);
    expect(polls.slice(1).every((time, index) => time - polls[index] <= 10_000)).toBe(true);
    controller.abort();
    await pending;
    expect(resumeDurableUpscale).toBeTypeOf('function');
  });

  it('pauses while offline and resumes immediately on reconnect without a new admission', async () => {
    const { resumeDurableUpscale } = await import('@client/utils/api-client');
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
    const fetchMock = vi.fn(async (url: string) => (url.includes('/jobs?') ? ready() : output()));
    vi.stubGlobal('fetch', fetchMock);
    const pending = resumeDurableUpscale(jobId);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(fetchMock).not.toHaveBeenCalled();
    Object.defineProperty(navigator, 'onLine', { configurable: true, value: true });
    window.dispatchEvent(new Event('online'));
    await vi.advanceTimersByTimeAsync(0);
    await expect(pending).resolves.toMatchObject({ jobId, imageUrl: 'blob:original-output' });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/upscale/output',
      expect.objectContaining({
        headers: expect.objectContaining({ 'Content-Type': 'application/json' }),
      })
    );
  });

  it('keeps an admitted job recoverable after thirty minutes of failed polling', async () => {
    const { resumeDurableUpscale } = await import('@client/utils/api-client');
    const controller = new AbortController();
    let settled = false;
    let restored = false;
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => {
        if (!restored) throw new TypeError('Failed to fetch');
        return url.includes('/jobs?') ? ready() : output();
      })
    );
    const pending = resumeDurableUpscale(jobId, vi.fn(), { signal: controller.signal });
    const observed = pending.then(
      value => {
        settled = true;
        return value;
      },
      error => {
        settled = true;
        return error;
      }
    );
    await vi.advanceTimersByTimeAsync(31 * 60_000);
    expect(settled).toBe(false);
    restored = true;
    window.dispatchEvent(new Event('focus'));
    await vi.advanceTimersByTimeAsync(10_000);
    expect(await observed).toMatchObject({ jobId, durable: true });
  });

  it('refreshes an expired ready capability and downloads the same job', async () => {
    const { resumeDurableUpscale } = await import('@client/utils/api-client');
    let lookups = 0;
    const tokens: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init?: RequestInit) => {
        if (url.includes('/jobs?')) return ready(++lookups === 1 ? 'expired-token' : 'fresh-token');
        tokens.push(JSON.parse(String(init?.body)).deliveryToken);
        return tokens.length === 1
          ? Response.json({ error: 'expired' }, { status: 404 })
          : output();
      })
    );
    const pending = resumeDurableUpscale(jobId);
    await vi.advanceTimersByTimeAsync(15_000);
    await expect(pending).resolves.toMatchObject({ jobId });
    expect(tokens).toEqual(['expired-token', 'fresh-token']);
  });

  it('exposes a confirmed refund as terminal metadata instead of a transport failure', async () => {
    const { resumeDurableUpscale } = await import('@client/utils/api-client');
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ jobId, status: 'failed', refunded: true, retryable: true }))
    );
    await expect(resumeDurableUpscale(jobId)).rejects.toMatchObject({
      jobId,
      refunded: true,
      retryable: true,
      status: 'failed',
    });
  });

  it('stops before admission when the account changes during a direct upload', async () => {
    const controller = new AbortController();
    let finishUpload!: (value: unknown) => void;
    mocks.uploadToSignedUrl.mockImplementation(
      () =>
        new Promise(resolve => {
          finishUpload = resolve;
        })
    );
    const fetchMock = vi.fn(async () => grant());
    vi.stubGlobal('fetch', fetchMock);
    const pending = processImage(file, config, vi.fn(), { jobId, signal: controller.signal }).catch(
      error => error
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(mocks.uploadToSignedUrl).toHaveBeenCalledOnce();
    controller.abort();
    await vi.advanceTimersByTimeAsync(0);
    finishUpload({ error: null });
    expect(await pending).toMatchObject({ name: 'AbortError' });
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/upscale')).toHaveLength(0);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/upscale/upload',
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    );
  });

  it('returns a confirmed provider outage after lookup proves there was no admission', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('/upload')) return grant();
      if (url === '/api/upscale')
        return Response.json(
          {
            error: {
              code: 'AI_UNAVAILABLE',
              message: 'Provider paused',
              details: { suppressPurchaseCtas: true },
            },
          },
          { status: 503 }
        );
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal('fetch', fetchMock);
    const pending = processImage(file, config, vi.fn(), { jobId }).catch(error => error);
    await vi.advanceTimersByTimeAsync(0);
    await expect(Promise.race([pending, Promise.resolve('still pending')])).resolves.toMatchObject({
      name: 'ProviderUnavailableError',
    });
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/upscale')).toHaveLength(1);
  });

  it('reads every server page and deduplicates jobs after local state loss', async () => {
    const { listDurableUpscaleJobs } = await import('@client/utils/api-client');
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          success: true,
          jobs: [{ jobId, status: 'processing' }],
          nextCursor: 'next/page',
        })
      )
      .mockResolvedValueOnce(
        Response.json({
          success: true,
          jobs: [
            { jobId, status: 'processing' },
            { jobId: '22222222-2222-4222-8222-222222222222', status: 'ready' },
          ],
          nextCursor: null,
        })
      );
    vi.stubGlobal('fetch', fetchMock);
    const result = await listDurableUpscaleJobs();
    expect(result.jobs).toHaveLength(2);
    expect(fetchMock).toHaveBeenLastCalledWith(
      '/api/upscale/jobs?limit=50&cursor=next%2Fpage',
      expect.anything()
    );
  });
});
