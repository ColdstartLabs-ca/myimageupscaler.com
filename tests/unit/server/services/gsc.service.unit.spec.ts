import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  normalizePemPrivateKey,
  buildGscDateRange,
  fetchBlogPagePerformance,
  fetchBlogQueryPagePerformance,
} from '@server/services/gsc.service';
import type { IGscDateRange } from '@server/services/gsc.types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRows(count: number, url = 'https://x.com/blog/a') {
  return Array(count).fill({
    keys: [url],
    impressions: 1,
    clicks: 0,
    ctr: 0,
    position: 5,
  });
}

const FAKE_TOKEN = 'fake-access-token';
const FAKE_SITE = 'sc-domain:x.com';
const FAKE_RANGE: IGscDateRange = { startDate: '2025-01-01', endDate: '2025-01-28' };

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('normalizePemPrivateKey', () => {
  it('normalizes PEM keys loaded from env', () => {
    const raw =
      '-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----\\n';
    const normalized = normalizePemPrivateKey(raw);
    expect(normalized).toBe(
      '-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----\n',
    );
  });

  it('is a no-op when the key already has real newlines', () => {
    const key = '-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----\n';
    expect(normalizePemPrivateKey(key)).toBe(key);
  });

  it('unwraps quoted PEM values before normalizing newlines', () => {
    const raw =
      '"-----BEGIN PRIVATE KEY-----\\nABC\\n-----END PRIVATE KEY-----\\n"';

    expect(normalizePemPrivateKey(raw)).toBe(
      '-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----\n',
    );
  });
});

describe('buildGscDateRange', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns a 28-day inclusive window with the correct lag', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-10T20:00:00.000Z'));

    const range = buildGscDateRange(28, 3);

    expect(range).toEqual({
      startDate: '2026-03-11',
      endDate: '2026-04-07',
    });

    const dayDiff =
      (new Date(range.endDate).getTime() - new Date(range.startDate).getTime()) /
      (1000 * 60 * 60 * 24);

    expect(dayDiff + 1).toBe(28);
  });

  it('uses Pacific time when calculating the stable end date', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-10T01:00:00.000Z'));

    const range = buildGscDateRange(28);

    expect(range.endDate).toBe('2026-04-06');
  });
});

describe('fetchBlogPagePerformance', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('paginates until all rows are fetched', async () => {
    const mockFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ rows: makeRows(25000) }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            rows: [
              {
                keys: ['https://x.com/blog/b'],
                impressions: 1,
                clicks: 0,
                ctr: 0,
                position: 6,
              },
            ],
          }),
      });

    global.fetch = mockFetch;

    const rows = await fetchBlogPagePerformance(FAKE_TOKEN, FAKE_SITE, FAKE_RANGE);

    expect(mockFetch).toHaveBeenCalledTimes(2);
    expect(rows).toHaveLength(25001);
  });

  it('sends the expected Search Analytics request body', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ rows: makeRows(1) }),
    });

    global.fetch = mockFetch;

    await fetchBlogPagePerformance(FAKE_TOKEN, FAKE_SITE, FAKE_RANGE);

    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);

    expect(body.dimensions).toEqual(['page']);
    expect(body.dataState).toBe('final');
    expect(body.type).toBe('web');
    expect(body.aggregationType).toBe('byPage');
    expect(body.dimensionFilterGroups).toEqual([
      {
        filters: [
          {
            dimension: 'page',
            operator: 'contains',
            expression: '/blog/',
          },
        ],
      },
    ]);
  });

  it('stops paginating when the first page has fewer rows than the limit', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ rows: makeRows(42) }),
    });

    global.fetch = mockFetch;

    const rows = await fetchBlogPagePerformance(FAKE_TOKEN, FAKE_SITE, FAKE_RANGE);

    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(rows).toHaveLength(42);
  });

  it('handles a response with no rows property gracefully', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({}),
    });

    global.fetch = mockFetch;

    const rows = await fetchBlogPagePerformance(FAKE_TOKEN, FAKE_SITE, FAKE_RANGE);

    expect(rows).toEqual([]);
  });

  it('throws a useful error when GSC responds with an error payload', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: () => Promise.resolve('{"error": {"message": "Forbidden"}}'),
    });

    await expect(
      fetchBlogPagePerformance(FAKE_TOKEN, FAKE_SITE, FAKE_RANGE),
    ).rejects.toThrow(/403|Forbidden/);
  });
});

describe('fetchBlogQueryPagePerformance', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('sends dimensions [query, page] in the request body', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          rows: [
            {
              keys: ['upscale image', 'https://x.com/blog/a'],
              impressions: 10,
              clicks: 1,
              ctr: 0.1,
              position: 7,
            },
          ],
        }),
    });

    global.fetch = mockFetch;

    await fetchBlogQueryPagePerformance(FAKE_TOKEN, FAKE_SITE, FAKE_RANGE);

    const [, init] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(init.body as string);

    expect(body.dimensions).toEqual(['query', 'page']);
    expect(body.aggregationType).toBeUndefined();
  });

  it('throws a useful error when GSC responds with an error payload', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: () => Promise.resolve('{"error": {"message": "Unauthorized"}}'),
    });

    await expect(
      fetchBlogQueryPagePerformance(FAKE_TOKEN, FAKE_SITE, FAKE_RANGE),
    ).rejects.toThrow(/401|Unauthorized/);
  });
});
