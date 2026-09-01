import { beforeEach, describe, expect, it, vi } from 'vitest';
import worker, {
  classifyHardWorkerFailure,
  type IEnv,
  type ITraceItem,
} from '../../../workers/upscale-refund-tail/index';

const jobId = '11111111-1111-4111-8111-111111111111';
const env: IEnv = {
  API_BASE_URL: 'https://myimageupscaler.com',
  CRON_SECRET: 'tail-secret',
};

function trace(
  outcome: ITraceItem['outcome'],
  options: { path?: string; jobId?: string; rayId?: string } = {}
): ITraceItem {
  return {
    scriptName: 'myimageupscaler',
    outcome,
    eventTimestamp: Date.now(),
    event: {
      request: {
        url: `https://myimageupscaler.com${options.path ?? '/api/upscale'}`,
        method: 'POST',
        headers: {
          'x-upscale-job-id': options.jobId ?? jobId,
          'cf-ray': options.rayId ?? 'abc-123',
        },
      },
    },
  };
}

describe('upscale refund Tail Worker', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('logs one redacted route attribution for a hard Worker outcome', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    await worker.tail(
      [
        trace('exceededMemory', {
          path: '/api/upscale?email=secret@example.com&jobId=not-safe-to-log',
        }),
      ],
      env
    );

    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError.mock.calls[0]).toEqual([
      'Cloudflare hard Worker outcome',
      {
        scriptName: 'myimageupscaler',
        outcome: 'exceededMemory',
        method: 'POST',
        pathname: '/api/upscale',
        rayId: 'abc-123',
      },
    ]);
    expect(JSON.stringify(consoleError.mock.calls[0])).not.toContain('secret@example.com');
    expect(JSON.stringify(consoleError.mock.calls[0])).not.toContain('not-safe-to-log');
    expect(JSON.stringify(consoleError.mock.calls[0])).not.toContain(jobId);
  });

  it('classifies malformed URLs without logging the raw URL', () => {
    const rawUrl = 'not a URL?email=secret@example.com';
    const result = classifyHardWorkerFailure({
      scriptName: 'myimageupscaler',
      outcome: 'exception',
      eventTimestamp: Date.now(),
      event: {
        request: {
          url: rawUrl,
          method: 'get',
          headers: { 'cf-ray': 'ray-456' },
        },
      },
    });

    expect(result).toEqual({
      scriptName: 'myimageupscaler',
      outcome: 'exception',
      method: 'GET',
      pathname: '[redacted-path]',
      rayId: 'ray-456',
    });
    expect(JSON.stringify(result)).not.toContain(rawUrl);
  });

  it.each(['ok', 'canceled', 'responseStreamDisconnected'] as const)(
    'does not log non-hard outcome %s',
    async outcome => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      await worker.tail([trace(outcome)], env);

      expect(consoleError).not.toHaveBeenCalled();
    }
  );

  it.each(['exceededMemory', 'exceededCpu', 'exception'] as const)(
    'forwards server-observed %s failures with the exact reservation capability',
    async outcome => {
      const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
      vi.stubGlobal('fetch', fetchMock);

      await worker.tail([trace(outcome)], env);

      expect(fetchMock).toHaveBeenCalledWith(
        'https://myimageupscaler.com/api/cron/upscale-tail-refund',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-cron-secret': 'tail-secret',
          },
          body: JSON.stringify({ jobId, outcome, rayId: 'abc-123' }),
        })
      );
    }
  );

  it.each(['ok', 'canceled', 'responseStreamDisconnected'] as const)(
    'does not refund user-controlled or successful outcome %s',
    async outcome => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);

      await worker.tail([trace(outcome)], env);

      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it('ignores failures outside POST /api/upscale and malformed client job ids', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await worker.tail(
      [
        trace('exceededMemory', { path: '/api/account' }),
        trace('exception', { jobId: 'not-a-uuid' }),
        trace('exception', { jobId: '77777777-7777-7777-7777-777777777777' }),
      ],
      env
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('logs hard failures for non-upscale routes without refunding them', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await worker.tail([trace('exceededCpu', { path: '/api/account?userId=secret' })], env);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalledTimes(1);
    expect(consoleError.mock.calls[0][1]).toMatchObject({
      outcome: 'exceededCpu',
      method: 'POST',
      pathname: '/api/account',
    });
    expect(JSON.stringify(consoleError.mock.calls[0])).not.toContain('secret');
  });

  it('redacts dynamic pathname segments from hard-failure logs', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const secretId = '33333333-3333-4333-8333-333333333333';
    const secretFilename = 'private-photo-original.png';

    await worker.tail(
      [
        trace('exceededMemory', { path: `/api/gallery/${secretId}?filename=${secretFilename}` }),
        trace('exceededCpu', { path: `/api/blog/posts/${secretFilename}` }),
      ],
      env
    );

    expect(consoleError).toHaveBeenCalledTimes(2);
    expect(consoleError.mock.calls[0][1]).toMatchObject({
      pathname: '/api/gallery/[redacted]',
    });
    expect(consoleError.mock.calls[1][1]).toMatchObject({
      pathname: '/api/blog/[redacted]',
    });
    const logs = JSON.stringify(consoleError.mock.calls);
    expect(logs).not.toContain(secretId);
    expect(logs).not.toContain(secretFilename);
  });
});
