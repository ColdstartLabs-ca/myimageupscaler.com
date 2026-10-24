import { describe, expect, it, vi } from 'vitest';
import { readLiveSeoFields, collectSeoDrift } from '@lib/seo/seo-lock-live';
import { extractSeoFields } from '@lib/seo/seo-lock';

const HTML =
  '<html><head><title>Approved</title></head><body><h1>Heading</h1><p>Intro</p></body></html>';

describe('weekly live lock checks', () => {
  it('retries one 5xx response and reads the successful page without following redirects', async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockResolvedValueOnce(new Response(HTML));
    const result = await readLiveSeoFields('https://myimageupscaler.com', '/winner', fetcher);
    expect(result.fields?.title).toBe('Approved');
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher).toHaveBeenCalledWith(
      'https://myimageupscaler.com/winner',
      expect.objectContaining({ redirect: 'manual' })
    );
  });

  it.each([301, 404, 503])('reports unreachable for status %i', async status => {
    const fetcher = vi.fn().mockImplementation(async () => new Response('', { status }));
    const result = await readLiveSeoFields('https://myimageupscaler.com', '/winner', fetcher);
    expect(result.error).toContain(String(status));
    expect(result.fields).toBeUndefined();
    expect(fetcher).toHaveBeenCalledTimes(status >= 500 ? 2 : 1);
  });

  it('contains network errors and refuses paths that escape the site origin', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('network failure'));
    expect(
      (await readLiveSeoFields('https://myimageupscaler.com', '/winner', fetcher)).error
    ).toContain('network failure');
    fetcher.mockClear();
    expect(
      (await readLiveSeoFields('https://myimageupscaler.com', '//attacker.example', fetcher)).error
    ).toBeDefined();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('reports changed fields and unreachable pages, with no rows for matching pages', async () => {
    const fields = await extractSeoFields(HTML);
    const entry = { ...fields, source: 'code' as const, clicks28d: 30 };
    const lock = { '/same': entry, '/changed': entry, '/down': entry };
    const rows = await collectSeoDrift(lock, async path =>
      path === '/down'
        ? { error: 'HTTP 404' }
        : { fields: { ...fields, title: path === '/changed' ? 'Unapproved' : fields.title } }
    );
    expect(rows).toEqual([
      { path: '/changed', field: 'title', expected: 'Approved', actual: 'Unapproved' },
      { path: '/down', field: 'unreachable', expected: '2xx HTML', actual: 'HTTP 404' },
    ]);
  });
});
