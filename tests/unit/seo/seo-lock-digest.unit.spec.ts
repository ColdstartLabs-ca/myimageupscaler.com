import { NextRequest } from 'next/server';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { extractSeoFields, type ISeoLock } from '@lib/seo/seo-lock';
vi.unmock('dayjs');

const h = vi.hoisted(() => ({
  lock: {} as ISeoLock,
  proposals: [] as unknown[],
  loadAutoSeoLocks: vi.fn(),
  insertAutoSeoLock: vi.fn(),
  readLiveSeoFields: vi.fn(),
  query: vi.fn(),
  send: vi.fn(),
  createSyncRun: vi.fn(),
  completeSyncRun: vi.fn(),
  commits: vi.fn(),
  token: vi.fn(),
  current: [] as unknown[],
  previous: [] as unknown[],
  after: 50,
}));
vi.mock('@/content/seo-lock.json', () => ({ default: h.lock }));
vi.mock('@/content/seo-lock-proposals.json', () => ({ default: h.proposals }));
vi.mock('@server/services/seo-lock.service', () => ({
  loadAutoSeoLocks: h.loadAutoSeoLocks,
  insertAutoSeoLock: h.insertAutoSeoLock,
}));
vi.mock('@server/services/seo-lock-commits.service', () => ({ listSeoGateCommits: h.commits }));
vi.mock('@lib/seo/seo-lock-live', async original => ({
  ...(await original<object>()),
  readLiveSeoFields: h.readLiveSeoFields,
}));
vi.mock('@server/services/gsc.service', () => ({
  createGscAccessToken: h.token,
  queryAllSearchAnalyticsRows: h.query,
  buildGscDateRange: () => ({ startDate: '2026-09-24', endDate: '2026-10-21' }),
}));
vi.mock('@server/services/email.service', () => ({ getEmailService: () => ({ send: h.send }) }));
vi.mock('@server/services/subscription-sync.service', () => ({
  createSyncRun: h.createSyncRun,
  completeSyncRun: h.completeSyncRun,
}));
vi.mock('@shared/config/env', () => ({
  serverEnv: {
    CRON_SECRET: 'secret',
    ADMIN_EMAIL: 'admin@coldstartlabs.ca',
    GSC_SERVICE_ACCOUNT_EMAIL: 'gsc@example.com',
    GSC_PRIVATE_KEY: 'test-private-key',
    GSC_SITE_URL: 'sc-domain:myimageupscaler.com',
  },
}));

import { POST } from '@/app/api/cron/seo-lock-digest/route';

const row = (path: string, clicks: number) => ({
  keys: [`https://myimageupscaler.com${path}`],
  clicks,
  impressions: 100,
  position: 5,
  ctr: 0.1,
});
const request = (secret = 'secret') =>
  new NextRequest('http://localhost/api/cron/seo-lock-digest', {
    method: 'POST',
    headers: { 'x-cron-secret': secret },
  });

describe('weekly SEO digest through its cron route', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-24T12:00:00Z'));
    for (const key of Object.keys(h.lock)) delete h.lock[key];
    h.proposals.length = 0;
    const fields = await extractSeoFields(
      '<html><head><title>Approved</title></head><body><h1>Heading</h1><p>Intro</p></body></html>'
    );
    h.lock['/locked'] = { ...fields, source: 'code', clicks28d: 50 };
    h.current = [row('/locked', 50)];
    h.previous = [row('/locked', 50)];
    h.after = 50;
    h.loadAutoSeoLocks.mockResolvedValue({});
    h.insertAutoSeoLock.mockResolvedValue(true);
    h.readLiveSeoFields.mockResolvedValue({ fields });
    h.commits.mockResolvedValue([]);
    h.token.mockResolvedValue('token');
    h.createSyncRun.mockResolvedValue('run');
    h.completeSyncRun.mockResolvedValue(undefined);
    h.send.mockResolvedValue({ success: true });
    h.query.mockImplementation(async (_token, _site, body) => {
      if (body.dimensions[0] === 'page')
        return body.endDate === '2026-10-21' ? h.current : h.previous;
      const pageFilter = body.dimensionFilterGroups?.[0]?.filters.some(
        (filter: { dimension: string }) => filter.dimension === 'page'
      );
      return [
        { keys: [], clicks: pageFilter ? h.after : body.endDate === '2026-09-17' ? 1000 : 500 },
      ];
    });
  });
  afterEach(() => vi.useRealTimers());

  it('rejects an incorrect secret before doing work', async () => {
    expect((await POST(request('wrong'))).status).toBe(401);
    expect(h.createSyncRun).not.toHaveBeenCalled();
  });

  it('sends no email when every section is empty', async () => {
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      checked: 1,
      autoAdded: 0,
      alertCount: 0,
      emailSent: false,
    });
    expect(h.send).not.toHaveBeenCalled();
  });

  it('reports drift and a new winner in one email to ADMIN_EMAIL', async () => {
    h.current = [row('/locked', 50), row('/new-winner', 21), row('/at-threshold', 20)];
    h.readLiveSeoFields.mockImplementation(async (_base, path) => ({
      fields: { ...h.lock['/locked'], title: path === '/locked' ? 'Unapproved' : 'New winner' },
    }));
    const response = await POST(request());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ checked: 1, autoAdded: 1, emailSent: true });
    expect(h.insertAutoSeoLock).toHaveBeenCalledTimes(1);
    expect(h.insertAutoSeoLock).toHaveBeenCalledWith(
      '/new-winner',
      expect.objectContaining({ clicks28d: 21, title: 'New winner' })
    );
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'admin@coldstartlabs.ca',
        type: 'transactional',
        template: 'seo-weekly-digest',
      })
    );
    expect(JSON.stringify(h.send.mock.calls[0][0].data)).toContain('Unapproved');
  });

  it('includes database locks and skips paths already protected by either source', async () => {
    h.loadAutoSeoLocks.mockResolvedValue({ '/auto': h.lock['/locked'] });
    h.current = [row('/auto', 30), row('/locked', 50)];
    const response = await POST(request());
    expect(await response.json()).toMatchObject({ checked: 2, autoAdded: 0 });
    expect(h.insertAutoSeoLock).not.toHaveBeenCalled();
  });

  it('reports an unchanged winner losing at least 30 percent as diagnosis only', async () => {
    h.current = [row('/locked', 35)];
    await POST(request());
    const text = JSON.stringify(h.send.mock.calls[0][0].data);
    expect(text).toContain('Diagnosis');
    expect(text).toContain('/locked');
    expect(text).not.toContain('seo:lock:restore');
  });

  it.each([
    [50, 'FLAT'],
    [20, 'LOSS'],
    [80, 'WIN'],
  ])(
    'evaluates page %i against matching non-brand control windows as %s',
    async (after, verdict) => {
      h.after = after;
      h.lock['/locked'].change = {
        approvedAt: '2026-09-20',
        baselineClicks28d: 100,
        baselineEndDate: '2026-09-17',
        readbackDate: '2026-10-10',
        previousLockCommit: 'a'.repeat(40),
      };
      await POST(request());
      const text = JSON.stringify(h.send.mock.calls[0][0].data);
      expect(text).toContain(verdict);
      if (verdict === 'LOSS') expect(text).toContain('seo:lock:restore');
      const calls = h.query.mock.calls.map(call => call[2]);
      expect(calls).toContainEqual(
        expect.objectContaining({ startDate: '2026-08-21', endDate: '2026-09-17' })
      );
      expect(calls).toContainEqual(
        expect.objectContaining({ startDate: '2026-09-21', endDate: '2026-10-18' })
      );
      expect(
        calls.some(body =>
          body.dimensionFilterGroups?.[0]?.filters.some(
            (filter: { operator: string; expression: string }) =>
              filter.operator === 'notEquals' && filter.expression === 'myimageupscaler'
          )
        )
      ).toBe(true);
    }
  );

  it('holds changes until 14 complete GSC days are available', async () => {
    h.lock['/locked'].change = {
      approvedAt: '2026-10-10',
      baselineClicks28d: 100,
      baselineEndDate: '2026-10-07',
      readbackDate: '2026-10-24',
      previousLockCommit: 'a'.repeat(40),
    };
    await POST(request());
    expect(h.send).not.toHaveBeenCalled();
  });

  it('includes recent proposals and gate commits', async () => {
    h.proposals.push({
      path: '/locked',
      source: 'three-kings-manager',
      proposedAt: '2026-10-23',
      field: 'title',
      proposedValue: 'Proposed title',
      evidence: 'Query evidence',
    });
    h.commits.mockResolvedValue(['https://github.com/org/repo/commit/abc gate update']);
    await POST(request());
    const text = JSON.stringify(h.send.mock.calls[0][0].data);
    expect(text).toContain('Proposed title');
    expect(text).toContain('Query evidence');
    expect(text).toContain('gate update');
  });

  it('reports delivery failure instead of marking the run successful', async () => {
    h.current = [row('/locked', 1)];
    h.send.mockResolvedValue({ success: false, error: 'provider unavailable' });
    expect((await POST(request())).status).toBe(500);
    expect(h.completeSyncRun).toHaveBeenCalledWith(
      'run',
      expect.objectContaining({ status: 'failed' })
    );
  });

  it('does not announce an auto-lock insert skipped by a concurrent run', async () => {
    h.current = [row('/locked', 50), row('/new-winner', 21)];
    h.insertAutoSeoLock.mockResolvedValue(false);
    const response = await POST(request());
    expect(await response.json()).toMatchObject({ autoAdded: 0, emailSent: false });
    expect(h.send).not.toHaveBeenCalled();
  });

  it('surfaces missing commit evidence in the digest', async () => {
    h.commits.mockRejectedValue(new Error('GitHub HTTP 403'));
    await POST(request());
    expect(JSON.stringify(h.send.mock.calls[0][0].data)).toContain('GitHub HTTP 403');
  });

  it('rejects malformed change metadata instead of producing a verdict', async () => {
    h.lock['/locked'].change = {
      approvedAt: '2026-09-20',
      baselineClicks28d: 100,
      baselineEndDate: '2026-02-31',
      readbackDate: '2026-10-10',
      previousLockCommit: 'a'.repeat(40),
    };
    await POST(request());
    expect(JSON.stringify(h.send.mock.calls[0][0].data)).toContain(
      'invalid signed change metadata'
    );
    expect(JSON.stringify(h.send.mock.calls[0][0].data)).not.toContain('seo:lock:restore');
  });
});
