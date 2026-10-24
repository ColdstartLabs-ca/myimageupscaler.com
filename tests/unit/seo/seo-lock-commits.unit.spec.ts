import { afterEach, describe, expect, it, vi } from 'vitest';
import { listSeoGateCommits } from '@server/services/seo-lock-commits.service';

describe('weekly gate-file commit collection', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('deduplicates gate commits and includes only migrations mentioning seo_lock', async () => {
    const fetcher = vi.fn(async (input: string) => {
      const url = new URL(input);
      const path = url.searchParams.get('path');
      if (url.hostname === 'raw.githubusercontent.com')
        return new Response(
          url.pathname.includes('relevant')
            ? 'CREATE TABLE seo_lock_auto_entries();'
            : 'CREATE TABLE unrelated();'
        );
      if (url.pathname.endsWith('/commits/sql'))
        return Response.json({
          files: [
            { filename: 'supabase/migrations/relevant.sql', status: 'added' },
            { filename: 'supabase/migrations/other.sql', status: 'added' },
          ],
        });
      if (path === 'supabase/migrations')
        return Response.json([
          {
            sha: 'sql',
            html_url: 'https://github.com/commit/sql',
            commit: { message: 'SQL change' },
          },
        ]);
      if (path === 'scripts/seo/seo-lock-gate.ts' || path === 'content/seo-lock.json')
        return Response.json([
          {
            sha: 'gate',
            html_url: 'https://github.com/commit/gate',
            commit: { message: 'Gate change' },
          },
        ]);
      return Response.json([]);
    });
    vi.stubGlobal('fetch', fetcher);
    const result = await listSeoGateCommits(new Date('2026-10-17T00:00:00Z'));
    expect(result).toHaveLength(2);
    expect(result.join('\n')).toContain('Gate change');
    expect(result.join('\n')).toContain('SQL change');
    expect(
      fetcher.mock.calls.some(
        ([input]) => new URL(input).searchParams.get('since') === '2026-10-17T00:00:00.000Z'
      )
    ).toBe(true);
  });

  it('fails visibly when GitHub rejects the request', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('', { status: 403 }))
    );
    await expect(listSeoGateCommits(new Date('2026-10-17'))).rejects.toThrow('403');
  });

  it('reports an unreadable migration instead of silently omitting a gate change', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string) => {
        const url = new URL(input);
        if (url.hostname === 'raw.githubusercontent.com') return new Response('', { status: 403 });
        if (url.pathname.endsWith('/commits/sql'))
          return Response.json({
            files: [{ filename: 'supabase/migrations/change.sql', status: 'added' }],
          });
        if (url.searchParams.get('path') === 'supabase/migrations')
          return Response.json([{ sha: 'sql', html_url: 'commit', commit: { message: 'Change' } }]);
        return Response.json([]);
      })
    );
    await expect(listSeoGateCommits(new Date('2026-10-17'))).rejects.toThrow('403');
  });
});
