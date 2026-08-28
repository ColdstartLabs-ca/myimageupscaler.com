import { beforeEach, describe, expect, it, vi } from 'vitest';
import worker, { type IEnv, type ITraceItem } from '../../../workers/upscale-refund-tail/index';

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
      ],
      env
    );

    expect(fetchMock).not.toHaveBeenCalled();
  });
});
