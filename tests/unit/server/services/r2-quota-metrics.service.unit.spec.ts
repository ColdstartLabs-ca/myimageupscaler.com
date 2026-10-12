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
const BASE = `https://api.cloudflare.com/client/v4/accounts/${'a'.repeat(32)}/r2/buckets`;

function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function usage(result: unknown, success = true) {
  return { success, errors: [], result };
}

function bucketUsage(sizes: Record<string, unknown>) {
  fetchMock.mockImplementation(async (url: string) => {
    const bucket = url.slice(BASE.length + 1).split('/')[0];
    const size = sizes[bucket];
    return jsonResponse(usage({ payloadSize: size, infrequentAccessPayloadSize: '0' }));
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.env.CLOUDFLARE_API_TOKEN = 'cf-token';
  mocks.env.CLOUDFLARE_ACCOUNT_ID = 'a'.repeat(32);
});

describe('measureR2AccountPayloadBytes', () => {
  it('sums only the MIU buckets, never the account-wide total that includes the cache bucket', async () => {
    bucketUsage({ 'miu-private': '8018554945', 'miu-public': '5308000' });

    await expect(measureR2AccountPayloadBytes()).resolves.toBe(8_023_862_945);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const urls = fetchMock.mock.calls.map(([url]) => url).sort();
    expect(urls).toEqual([`${BASE}/miu-private/usage`, `${BASE}/miu-public/usage`]);
    for (const [, options] of fetchMock.mock.calls) {
      expect(options).toMatchObject({
        method: 'GET',
        headers: { Authorization: 'Bearer cf-token' },
        redirect: 'manual',
        cache: 'no-store',
      });
      expect(options.signal).toBeInstanceOf(AbortSignal);
    }
  });

  it('adds infrequent-access payload and accepts real zeros', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(usage({ payloadSize: '0', infrequentAccessPayloadSize: '7' }))
    );
    await expect(measureR2AccountPayloadBytes()).resolves.toBe(14);
  });

  it('returns null when any bucket payloadSize is missing or invalid', async () => {
    for (const bad of [undefined, null, '', '-1', '1.5', 'abc', '99999999999999999999']) {
      vi.clearAllMocks();
      bucketUsage({ 'miu-private': '10', 'miu-public': bad });
      await expect(measureR2AccountPayloadBytes()).resolves.toBeNull();
    }
  });

  it('returns null on HTTP errors, redirects, malformed bodies, or success:false', async () => {
    fetchMock.mockResolvedValue(jsonResponse({}, 403));
    await expect(measureR2AccountPayloadBytes()).resolves.toBeNull();

    fetchMock.mockResolvedValue({ ok: false, status: 0, json: async () => ({}) });
    await expect(measureR2AccountPayloadBytes()).resolves.toBeNull();

    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new Error('bad json');
      },
    });
    await expect(measureR2AccountPayloadBytes()).resolves.toBeNull();

    fetchMock.mockResolvedValue(jsonResponse(usage({ payloadSize: '1' }, false)));
    await expect(measureR2AccountPayloadBytes()).resolves.toBeNull();

    fetchMock.mockResolvedValue(jsonResponse(usage(null)));
    await expect(measureR2AccountPayloadBytes()).resolves.toBeNull();
  });

  it('returns null without a request when credentials are missing or the account id is bad', async () => {
    mocks.env.CLOUDFLARE_API_TOKEN = '';
    await expect(measureR2AccountPayloadBytes()).resolves.toBeNull();

    mocks.env.CLOUDFLARE_API_TOKEN = 'cf-token';
    mocks.env.CLOUDFLARE_ACCOUNT_ID = 'not-an-account';
    await expect(measureR2AccountPayloadBytes()).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('returns null when a request throws or times out', async () => {
    fetchMock.mockRejectedValue(new DOMException('timeout', 'TimeoutError'));
    await expect(measureR2AccountPayloadBytes()).resolves.toBeNull();
  });
});
