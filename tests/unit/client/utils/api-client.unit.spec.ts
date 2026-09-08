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
  listActiveAsyncUpscaleJobs,
  parseJsonResponse,
  processImage,
  reportUpscaleEdgeFailure,
  resumeAsyncUpscale,
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
    vi.useRealTimers();
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

    await reportUpscaleEdgeFailure(
      { status: 503, rayId: 'abc-123' },
      { qualityTier: config.qualityTier, scale: config.scale }
    );

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

  describe('async admission polling', () => {
    const jobId = '11111111-1111-4111-8111-111111111111';
    const token = 'delivery-token-'.padEnd(43, 'x');
    const startedAt = Date.parse('2026-09-07T12:00:00.000Z');
    const statusUrl = `/api/upscale?jobId=${jobId}`;

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(startedAt);
      vi.spyOn(Math, 'random').mockReturnValue(0);
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true);
      vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('visible');
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      mocks.uploadToSignedUrl.mockResolvedValue({
        data: { path: 'user-1/job-1.png' },
        error: null,
      });
      vi.stubGlobal('crypto', { randomUUID: () => jobId });
    });

    function pending(extra: Record<string, unknown> = {}) {
      return {
        jobId,
        status: 'processing',
        retryAfterMs: 3000,
        executionDeadline: startedAt + 900000,
        ...extra,
      };
    }

    function ready() {
      return {
        jobId,
        status: 'ready',
        success: true,
        mimeType: 'image/png',
        processing: {
          reservationJobId: jobId,
          deliveryToken: token,
          creditsUsed: 1,
          creditsRemaining: 4,
          modelDisplayName: 'Upscale',
          dimensionPreservingFallback: true,
        },
      };
    }

    async function startFixture(
      statusResponse: (index: number) => Response | Promise<Response>,
      initial = pending()
    ) {
      let reads = 0;
      const readTimes: number[] = [];
      let admittedAt = Date.now();
      const progress = vi.fn();
      let completed:
        | { value?: Awaited<ReturnType<typeof processImage>>; error?: unknown }
        | undefined;
      const fetchMock = vi.fn(async (url: string) => {
        if (url === '/api/upscale/upload') {
          return Response.json({ storagePath: 'user-1/job-1.png', uploadToken: 'signed-token' });
        }
        if (url === '/api/upscale') {
          admittedAt = Date.now();
          return Response.json(initial, { status: 202 });
        }
        if (url === statusUrl) {
          readTimes.push(Date.now());
          return statusResponse(reads++);
        }
        if (url === '/api/upscale/output')
          return new Response(new Blob(['image-bytes']), { status: 200 });
        throw new Error(`Unexpected URL: ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);
      const result = processImage(
        new File(['image-bytes'], 'source.png', { type: 'image/png' }),
        config,
        progress
      ).then(
        value => {
          completed = { value };
          return completed;
        },
        error => {
          completed = { error };
          return completed;
        }
      );
      await vi.waitFor(
        () =>
          expect(fetchMock.mock.calls.filter(([url]) => url === '/api/upscale')).toHaveLength(1),
        { interval: 1 }
      );
      await vi.advanceTimersByTimeAsync(0);
      return { fetchMock, progress, result, readTimes, admittedAt, completed: () => completed };
    }

    it('keeps a lost admission response recoverable using its original job ID', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => {
          if (url === '/api/upscale/upload')
            return Response.json({ storagePath: 'user-1/job-1.png', uploadToken: 'signed-token' });
          throw new TypeError('Connection lost after admission');
        })
      );
      await expect(
        processImage(new File(['image'], 'source.png', { type: 'image/png' }), config, vi.fn())
      ).rejects.toMatchObject({ name: 'AsyncUpscalePendingError', jobId });
    });

    it.each([200, 202, 503])(
      'keeps an unreadable admission response recoverable (HTTP %s)',
      async status => {
        vi.stubGlobal(
          'fetch',
          vi.fn(async (url: string) => {
            if (url === '/api/upscale/upload')
              return Response.json({
                storagePath: 'user-1/job-1.png',
                uploadToken: 'signed-token',
              });
            return new Response('upstream disconnected', { status });
          })
        );
        await expect(
          processImage(new File(['image'], 'source.png', { type: 'image/png' }), config, vi.fn())
        ).rejects.toMatchObject({ name: 'AsyncUpscalePendingError', jobId });
      }
    );

    it('treats a refunded billing denial as terminal even when its HTTP status is 503', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => {
          if (url === '/api/upscale/upload')
            return Response.json({ storagePath: 'user-1/job-1.png', uploadToken: 'signed-token' });
          return Response.json(
            {
              jobId,
              status: 'refunded',
              creditsRefunded: true,
              error: {
                code: 'AI_UNAVAILABLE',
                message: 'Provider billing is unavailable',
                details: { creditsRefunded: true },
              },
            },
            { status: 503 }
          );
        })
      );
      await expect(
        processImage(new File(['image'], 'source.png', { type: 'image/png' }), config, vi.fn())
      ).rejects.toMatchObject({ name: 'AsyncUpscaleTerminalError', jobId, refunded: true });
    });

    it('keeps delivery failures recoverable without changing the accepted job', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => {
          if (url === '/api/upscale/upload')
            return Response.json({ storagePath: 'user-1/job-1.png', uploadToken: 'signed-token' });
          if (url === '/api/upscale') return Response.json(ready());
          throw new TypeError('Output connection lost');
        })
      );
      await expect(
        processImage(new File(['image'], 'source.png', { type: 'image/png' }), config, vi.fn())
      ).rejects.toMatchObject({ name: 'AsyncUpscalePendingError', jobId });
    });

    it('recognizes a ready admission replay as durable instead of permitting a new job', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn(async (url: string) => {
          if (url === '/api/upscale/upload')
            return Response.json({ storagePath: 'user-1/job-1.png', uploadToken: 'signed-token' });
          if (url === '/api/upscale') return Response.json(ready());
          if (url === '/api/upscale/output') return new Response(new Blob(['image-bytes']));
          throw new Error(`Unexpected URL: ${url}`);
        })
      );
      const onJobAccepted = vi.fn();
      await expect(
        processImage(new File(['image'], 'source.png', { type: 'image/png' }), config, vi.fn(), {
          onJobAccepted,
        })
      ).resolves.toMatchObject({ durable: true, jobId });
      expect(onJobAccepted).toHaveBeenCalledWith(jobId);
    });

    it('waits for GET ready before finalizing or fetching the original output capability', async () => {
      const fixture = await startFixture(index =>
        Response.json(index === 0 ? pending() : ready(), { status: index === 0 ? 202 : 200 })
      );
      expect(fixture.completed()).toBeUndefined();
      expect(fixture.progress.mock.calls.some(([percent]) => percent >= 95)).toBe(false);
      expect(mocks.track).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(3000);
      expect(fixture.readTimes).toHaveLength(1);
      expect(fixture.completed()).toBeUndefined();
      expect(fixture.progress.mock.calls.some(([percent]) => percent >= 95)).toBe(false);
      expect(fixture.fetchMock.mock.calls.some(([url]) => url === '/api/upscale/output')).toBe(
        false
      );

      await vi.advanceTimersByTimeAsync(5000);
      expect(await fixture.result).toMatchObject({
        value: {
          imageUrl: 'blob:https://app.test/output-1',
          creditsUsed: 1,
          creditsRemaining: 4,
          dimensionPreservingFallback: true,
        },
      });
      expect(fixture.fetchMock.mock.calls.filter(([url]) => url === '/api/upscale')).toHaveLength(
        1
      );
      expect(fixture.fetchMock).toHaveBeenLastCalledWith(
        '/api/upscale/output',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ reservationJobId: jobId, deliveryToken: token }),
        })
      );
      expect(fixture.fetchMock).toHaveBeenCalledWith(
        statusUrl,
        expect.objectContaining({
          headers: { Authorization: 'Bearer token-123' },
          cache: 'no-store',
        })
      );
    });

    it.each([429, 503])(
      'respects Retry-After after HTTP %s and continues the same admitted job',
      async status => {
        const fixture = await startFixture(index =>
          index === 0
            ? Response.json(
                { error: { code: 'AI_UNAVAILABLE', message: 'Temporary status outage' } },
                { status, headers: { 'Retry-After': '11' } }
              )
            : Response.json(ready())
        );
        await vi.advanceTimersByTimeAsync(3000);
        expect(fixture.readTimes).toHaveLength(1);
        expect(fixture.completed()).toBeUndefined();
        await vi.advanceTimersByTimeAsync(fixture.readTimes[0] + 11000 - Date.now() - 1);
        expect(fixture.readTimes).toHaveLength(1);
        await vi.advanceTimersByTimeAsync(1);
        expect((await fixture.result).value?.creditsUsed).toBe(1);
        expect(fixture.readTimes[1] - fixture.readTimes[0]).toBe(11000);
        expect(fixture.fetchMock.mock.calls.filter(([url]) => url === '/api/upscale')).toHaveLength(
          1
        );
      }
    );

    it('respects Retry-After when another tab owns the output delivery lease', async () => {
      let outputAttempts = 0;
      let busyAt = 0;
      const fetchMock = vi.fn(async (url: string) => {
        if (url === '/api/upscale/upload')
          return Response.json({ storagePath: 'user-1/job-1.png', uploadToken: 'signed-token' });
        if (url === '/api/upscale') return Response.json(pending(), { status: 202 });
        if (url === statusUrl) return Response.json(ready());
        if (url === '/api/upscale/output') {
          outputAttempts += 1;
          if (outputAttempts === 1) {
            busyAt = Date.now();
            return Response.json(
              {
                error: {
                  code: 'AI_UNAVAILABLE',
                  message: 'Generated output is being delivered in another request.',
                  details: { outputBusy: true, retryable: true },
                },
              },
              { status: 503, headers: { 'Retry-After': '7' } }
            );
          }
          return new Response(new Blob(['image-bytes']), { status: 200 });
        }
        throw new Error(`Unexpected URL: ${url}`);
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = processImage(
        new File(['image-bytes'], 'source.png', { type: 'image/png' }),
        config,
        vi.fn()
      );
      await vi.waitFor(
        () =>
          expect(fetchMock.mock.calls.filter(([url]) => url === '/api/upscale')).toHaveLength(1),
        { interval: 1 }
      );
      await vi.advanceTimersByTimeAsync(3000);
      await vi.waitFor(() => expect(outputAttempts).toBe(1), { interval: 1 });
      expect(fetchMock.mock.calls.filter(([url]) => url === '/api/upscale')).toHaveLength(1);

      await vi.advanceTimersByTimeAsync(Math.max(0, 7000 - (Date.now() - busyAt) - 1));
      expect(outputAttempts).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      await expect(result).resolves.toMatchObject({ imageUrl: 'blob:https://app.test/output-1' });
      expect(outputAttempts).toBe(2);
      expect(fetchMock.mock.calls.filter(([url]) => url === '/api/upscale')).toHaveLength(1);
    });

    it('stops on a confirmed refunded HTTP 503 without fetching output or submitting again', async () => {
      const fixture = await startFixture(() =>
        Response.json(
          {
            jobId,
            status: 'refunded',
            creditsRefunded: true,
            error: {
              code: 'AI_UNAVAILABLE',
              message: 'The prediction failed and credits were refunded.',
            },
          },
          { status: 503 }
        )
      );
      await vi.advanceTimersByTimeAsync(3000);
      const outcome = await fixture.result;
      expect(outcome.error).toMatchObject({
        message: 'The prediction failed and credits were refunded.',
      });
      await vi.advanceTimersByTimeAsync(30000);
      expect(fixture.readTimes).toHaveLength(1);
      expect(fixture.progress.mock.calls.some(([percent]) => percent >= 95)).toBe(false);
      expect(fixture.fetchMock.mock.calls.some(([url]) => url === '/api/upscale/output')).toBe(
        false
      );
      expect(fixture.fetchMock.mock.calls.filter(([url]) => url === '/api/upscale')).toHaveLength(
        1
      );
    });

    it('retries a lost status response after ten seconds without repeating admission', async () => {
      const fixture = await startFixture(index => {
        if (index === 0) throw new TypeError('status connection lost');
        return Response.json(ready());
      });
      await vi.advanceTimersByTimeAsync(3000);
      expect(fixture.completed()).toBeUndefined();
      await vi.advanceTimersByTimeAsync(10000);
      expect((await fixture.result).value?.creditsRemaining).toBe(4);
      expect(fixture.readTimes[1] - fixture.readTimes[0]).toBe(10000);
      expect(fixture.fetchMock.mock.calls.filter(([url]) => url === '/api/upscale')).toHaveLength(
        1
      );
    });

    it('rejects a foreign ready response and retains the original job identity', async () => {
      const fixture = await startFixture(() => Response.json({ ...ready(), jobId: 'foreign-job' }));
      await vi.advanceTimersByTimeAsync(3000);
      expect((await fixture.result).error).toMatchObject({
        name: 'AsyncUpscalePendingError',
        jobId,
      });
      expect(fixture.fetchMock.mock.calls.some(([url]) => url === '/api/upscale/output')).toBe(
        false
      );
    });

    it('uses at most eight status calls for a thirty-second prediction', async () => {
      const fixture = await startFixture(() =>
        Date.now() - startedAt >= 30000
          ? Response.json(ready())
          : Response.json(pending(), { status: 202 })
      );
      await vi.advanceTimersByTimeAsync(35000);
      expect((await fixture.result).value?.creditsUsed).toBe(1);
      expect(fixture.readTimes.length).toBeLessThanOrEqual(8);
      expect(fixture.readTimes[0] - fixture.admittedAt).toBe(3000);
      expect(fixture.readTimes[1] - fixture.readTimes[0]).toBe(5000);
      expect(fixture.fetchMock.mock.calls.filter(([url]) => url === '/api/upscale')).toHaveLength(
        1
      );
    });

    it('backs off to ten-second status reads after thirty seconds', async () => {
      const fixture = await startFixture(() =>
        Date.now() - startedAt >= 44000
          ? Response.json(ready())
          : Response.json(pending(), { status: 202 })
      );
      await vi.advanceTimersByTimeAsync(55000);
      expect((await fixture.result).value?.creditsUsed).toBe(1);
      const afterThirtySeconds = fixture.readTimes.filter(time => time - startedAt >= 30000);
      expect(afterThirtySeconds).toHaveLength(3);
      expect(afterThirtySeconds[1] - afterThirtySeconds[0]).toBe(10000);
      expect(afterThirtySeconds[2] - afterThirtySeconds[1]).toBe(10000);
    });

    it('ends polling by the fifteen-minute budget even when Retry-After exceeds the remaining time', async () => {
      const fixture = await startFixture(() =>
        Response.json(
          { error: { message: 'Busy' } },
          {
            status: 429,
            headers: { 'Retry-After': '3600' },
          }
        )
      );
      await vi.advanceTimersByTimeAsync(900000);
      expect(fixture.completed()?.error).toMatchObject({
        name: 'AsyncUpscalePendingError',
        jobId,
        reason: 'deadline',
      });
      expect(fixture.readTimes).toHaveLength(1);
      expect(fixture.fetchMock.mock.calls.filter(([url]) => url === '/api/upscale')).toHaveLength(
        1
      );
      expect(fixture.progress.mock.calls.some(([percent]) => percent >= 95)).toBe(false);
    });

    it('stops at an earlier execution deadline with the same recoverable job ID', async () => {
      const fixture = await startFixture(
        () => Response.json(pending(), { status: 202 }),
        pending({ executionDeadline: startedAt + 10000 })
      );
      await vi.advanceTimersByTimeAsync(10000);
      expect(fixture.completed()?.error).toMatchObject({
        name: 'AsyncUpscalePendingError',
        jobId,
        reason: 'deadline',
      });
      expect(fixture.readTimes).toHaveLength(2);
      expect(fixture.fetchMock.mock.calls.some(([url]) => url === '/api/upscale/output')).toBe(
        false
      );
    });

    it('lists only owner recovery metadata through the bounded active query', async () => {
      const fetchMock = vi.fn().mockResolvedValue(
        Response.json({
          success: true,
          jobs: [
            {
              jobId,
              status: 'processing',
              createdAt: startedAt,
              executionDeadline: startedAt + 900000,
              display: { fileName: 'source.png', mimeType: 'image/png' },
            },
          ],
        })
      );
      vi.stubGlobal('fetch', fetchMock);

      await expect(listActiveAsyncUpscaleJobs()).resolves.toMatchObject({
        jobs: [expect.objectContaining({ jobId, status: 'processing' })],
      });
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/upscale?active=1',
        expect.objectContaining({ method: 'GET', cache: 'no-store' })
      );
    });

    it('resumes a ready job with one status read and the original output capability', async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          Response.json({
            success: true,
            jobId,
            status: 'ready',
            mimeType: 'image/png',
            processing: {
              reservationJobId: jobId,
              deliveryToken: token,
              creditsUsed: 1,
              creditsRemaining: 4,
            },
          })
        )
        .mockResolvedValueOnce(new Response(new Blob(['image-bytes']), { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);

      await expect(resumeAsyncUpscale(jobId)).resolves.toMatchObject({
        jobId,
        durable: true,
        imageUrl: 'blob:https://app.test/output-1',
      });
      expect(fetchMock.mock.calls.filter(([url]) => url === '/api/upscale')).toHaveLength(0);
      expect(fetchMock.mock.calls[0][0]).toBe(statusUrl);
      expect(fetchMock.mock.calls[1][1]?.body).toBe(
        JSON.stringify({ reservationJobId: jobId, deliveryToken: token })
      );
    });
  });
});
