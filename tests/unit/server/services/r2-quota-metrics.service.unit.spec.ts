import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  env: {
    CLOUDFLARE_API_TOKEN: 'cf-token',
    CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32),
  },
}));

vi.mock('@shared/config/env', () => ({ serverEnv: mocks.env }));

import { measureR2AccountPayloadBytes } from '@server/services/r2-quota-metrics.service';

const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function metrics(result: unknown, success = true) {
  return { success, errors: [], result };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.env.CLOUDFLARE_API_TOKEN = 'cf-token';
  mocks.env.CLOUDFLARE_ACCOUNT_ID = 'a'.repeat(32);
});

describe('measureR2AccountPayloadBytes', () => {
  it('sums every present class/state payloadSize in one account request', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        metrics({
          standard: {
            published: { payloadSize: 101_000_000_000 },
            uploaded: { payloadSize: 3_000_000_000 },
          },
          infrequentAccess: {
            published: { payloadSize: 5_000_000_000 },
            uploaded: { payloadSize: 1_000_000_000 },
          },
        })
      )
    );

    await expect(measureR2AccountPayloadBytes()).resolves.toBe(110_000_000_000);
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe(
      `https://api.cloudflare.com/client/v4/accounts/${'a'.repeat(32)}/r2/metrics`
    );
    expect(options).toMatchObject({
      method: 'GET',
      headers: { Authorization: 'Bearer cf-token' },
      redirect: 'error',
      cache: 'no-store',
    });
    expect(options.signal).toBeInstanceOf(AbortSignal);
  });

  it('treats absent optional classes and states as zero', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(metrics({ standard: { published: { payloadSize: 7 } } }))
    );
    await expect(measureR2AccountPayloadBytes()).resolves.toBe(7);

    fetchMock.mockResolvedValue(jsonResponse(metrics({ infrequentAccess: {} })));
    await expect(measureR2AccountPayloadBytes()).resolves.toBeNull();
  });

  it('accepts explicit all-zero states as a real measurement', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        metrics({
          standard: { published: { payloadSize: 0 }, uploaded: { payloadSize: 0 } },
        })
      )
    );
    await expect(measureR2AccountPayloadBytes()).resolves.toBe(0);
  });

  it('returns null for an empty result instead of a fabricated zero', async () => {
    fetchMock.mockResolvedValue(jsonResponse(metrics({})));
    await expect(measureR2AccountPayloadBytes()).resolves.toBeNull();

    fetchMock.mockResolvedValue(jsonResponse(metrics(null)));
    await expect(measureR2AccountPayloadBytes()).resolves.toBeNull();
  });

  it('returns null when a present state has no valid payloadSize', async () => {
    const badPayloads = [
      metrics({ standard: { published: { payloadSize: '10' } } }),
      metrics({ standard: { published: { payloadSize: -1 } } }),
      metrics({ standard: { published: { payloadSize: 1.5 } } }),
      metrics({ standard: { published: { payloadSize: Number.MAX_SAFE_INTEGER + 1 } } }),
      metrics({ standard: { published: {} } }),
      metrics({ standard: { published: null } }),
    ];

    for (const body of badPayloads) {
      fetchMock.mockResolvedValue(jsonResponse(body));
      await expect(measureR2AccountPayloadBytes()).resolves.toBeNull();
    }
  });

  it('returns null on HTTP errors, malformed bodies, or success:false', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 403));
    await expect(measureR2AccountPayloadBytes()).resolves.toBeNull();

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('not json');
      },
    });
    await expect(measureR2AccountPayloadBytes()).resolves.toBeNull();

    fetchMock.mockResolvedValue(jsonResponse(metrics({ standard: {} }, false)));
    await expect(measureR2AccountPayloadBytes()).resolves.toBeNull();
  });

  it('returns null without a request when credentials are missing or the account id is bad', async () => {
    mocks.env.CLOUDFLARE_API_TOKEN = '';
    await expect(measureR2AccountPayloadBytes()).resolves.toBeNull();

    mocks.env.CLOUDFLARE_API_TOKEN = 'cf-token';
    mocks.env.CLOUDFLARE_ACCOUNT_ID = 'not-hex';
    await expect(measureR2AccountPayloadBytes()).resolves.toBeNull();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null when the request throws or times out', async () => {
    fetchMock.mockRejectedValue(new DOMException('timeout', 'TimeoutError'));
    await expect(measureR2AccountPayloadBytes()).resolves.toBeNull();
  });
});
