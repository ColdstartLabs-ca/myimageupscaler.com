import { beforeEach, describe, expect, it, vi } from 'vitest';

const { from, select, order, filterIn, range, upsert } = vi.hoisted(() => ({
  from: vi.fn(),
  select: vi.fn(),
  order: vi.fn(),
  filterIn: vi.fn(),
  range: vi.fn(),
  upsert: vi.fn(),
}));
vi.mock('@server/supabase/supabaseAdmin', () => ({ supabaseAdmin: { from } }));

import { loadAutoSeoLocks, insertAutoSeoLock } from '@server/services/seo-lock.service';

const ROW = {
  path: '/blog/winner',
  title: 'Winner',
  description: 'Winner description',
  h1: 'Winner',
  intro_hash: 'a'.repeat(64),
  canonical: 'https://myimageupscaler.com/blog/winner',
  robots: 'index, follow',
  hreflang: [],
  json_ld_types: ['BlogPosting'],
  clicks_28d: 25,
};

describe('append-only SEO lock store', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    const query = { select, order, in: filterIn, range, upsert };
    from.mockReturnValue(query);
    select.mockReturnValue(query);
    order.mockReturnValue(query);
    filterIn.mockReturnValue(query);
    upsert.mockReturnValue(query);
    range.mockResolvedValue({ data: [ROW], error: null });
  });

  it('loads indexed paths and maps stored rendered fields', async () => {
    const result = await loadAutoSeoLocks(['/blog/winner']);
    expect(filterIn).toHaveBeenCalledWith('path', ['/blog/winner']);
    expect(result['/blog/winner']).toMatchObject({
      title: 'Winner',
      source: 'db',
      introHash: ROW.intro_hash,
      jsonLdTypes: ['BlogPosting'],
      clicks28d: 25,
    });
  });

  it('reads beyond the PostgREST page limit', async () => {
    range
      .mockResolvedValueOnce({
        data: Array.from({ length: 1000 }, (_, i) => ({ ...ROW, path: `/page-${i}` })),
        error: null,
      })
      .mockResolvedValueOnce({ data: [{ ...ROW, path: '/last-page' }], error: null });
    expect(Object.keys(await loadAutoSeoLocks())).toHaveLength(1001);
    expect(range).toHaveBeenNthCalledWith(2, 1000, 1999);
  });

  it('fails closed on read errors', async () => {
    range.mockResolvedValue({ data: null, error: { message: 'table unavailable' } });
    await expect(loadAutoSeoLocks()).rejects.toThrow('table unavailable');
  });

  it('ignores conflicts instead of updating a frozen row', async () => {
    select.mockResolvedValue({ data: [{ path: ROW.path }], error: null });
    const { path, intro_hash, json_ld_types, clicks_28d, ...fields } = ROW;
    const entry = {
      ...fields,
      introHash: intro_hash,
      jsonLdTypes: json_ld_types,
      clicks28d: clicks_28d,
      source: 'db' as const,
    };
    expect(await insertAutoSeoLock(path, entry)).toBe(true);
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ path, intro_hash, json_ld_types, clicks_28d }),
      { onConflict: 'path', ignoreDuplicates: true }
    );
    select.mockResolvedValue({ data: [], error: null });
    expect(await insertAutoSeoLock(path, entry)).toBe(false);
  });
});
