import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * PRD-SQR-04 Phase 2 — gallery expiry warning eligibility/dedup unit tests.
 * Synthetic data only. Every Supabase call is mocked; no network or DB is used.
 */

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  queueLifecycleEmail: vi.fn(),
}));

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: { rpc: mocks.rpc, from: mocks.from },
}));

vi.mock('@server/services/email-lifecycle.service', () => ({
  getEmailLifecycleService: () => ({ queueLifecycleEmail: mocks.queueLifecycleEmail }),
}));

import {
  GALLERY_EXPIRY_WARNING_CAMPAIGN_KEY,
  queueGalleryExpiryWarnings,
} from '@server/services/gallery-expiry-warning.service';

interface INotice {
  id: string;
  user_id: string;
  activity_anchor: string;
  queue_id: string | null;
  warning_sent_at: string | null;
}

interface IQueue {
  id: string;
  campaign_key: string;
  user_id: string;
  status: string;
  metadata: Record<string, unknown>;
  sent_at: string | null;
  reason?: string | null;
}

const state: {
  candidates: Array<{ user_id: string; activity_anchor: string }>;
  notices: INotice[];
  queue: IQueue[];
  rpcCalls: Array<{ name: string; args: Record<string, unknown> }>;
} = {
  candidates: [],
  notices: [],
  queue: [],
  rpcCalls: [],
};

const NEW_ANCHOR = '2026-07-01T00:00:00.000Z';
const RAW_ANCHOR = '2026-07-01T00:00:00.123456+00:00';

function makeChain(table: string) {
  const filters: Array<[string, string, unknown]> = [];
  let op: 'select' | 'insert' | 'update' = 'select';
  let payload: Record<string, unknown> | null = null;

  const resolve = (): { data: unknown; error: null } => {
    if (table === 'gallery_expiry_notices') {
      if (op === 'insert') {
        const notice: INotice = {
          id: `notice-${state.notices.length + 1}`,
          user_id: String(payload?.user_id),
          activity_anchor: String(payload?.activity_anchor),
          queue_id: null,
          warning_sent_at: null,
        };
        state.notices.push(notice);
        return { data: { id: notice.id }, error: null };
      }
      if (op === 'update') {
        const target = state.notices.find(
          notice =>
            notice.id === filters.find(f => f[1] === 'id')?.[2] &&
            (filters.some(f => f[1] === 'queue_id') ? notice.queue_id === null : true)
        );
        if (target && payload && 'queue_id' in payload) {
          target.queue_id = String(payload.queue_id);
        }
        return { data: null, error: null };
      }
      const userId = filters.find(f => f[1] === 'user_id')?.[2];
      const anchor = filters.find(f => f[1] === 'activity_anchor')?.[2];
      const notice = state.notices.find(
        n => n.user_id === userId && n.activity_anchor === anchor
      );
      return { data: notice ?? null, error: null };
    }

    if (table === 'email_lifecycle_queue') {
      const idFilter = filters.find(f => f[1] === 'id')?.[2];
      if (idFilter !== undefined) {
        return { data: state.queue.find(q => q.id === idFilter) ?? null, error: null };
      }
      const match = state.queue.find(q => {
        const campaign = filters.find(f => f[1] === 'campaign_key')?.[2];
        const user = filters.find(f => f[1] === 'user_id')?.[2];
        const status = filters.find(f => f[1] === 'status')?.[2];
        const noticeId = filters.find(f => f[1] === 'metadata->>notice_id')?.[2];
        const anchor = filters.find(f => f[1] === 'metadata->>activity_anchor')?.[2];
        return (
          q.campaign_key === campaign &&
          q.user_id === user &&
          q.status === status &&
          String(q.metadata.notice_id) === noticeId &&
          q.metadata.activity_anchor === anchor
        );
      });
      return { data: match ? { id: match.id } : null, error: null };
    }

    return { data: null, error: null };
  };

  const chain: Record<string, unknown> = {
    select: vi.fn(() => chain),
    insert: vi.fn((row: Record<string, unknown>) => {
      op = 'insert';
      payload = row;
      return chain;
    }),
    update: vi.fn((row: Record<string, unknown>) => {
      op = 'update';
      payload = row;
      return chain;
    }),
    eq: vi.fn((column: string, value: unknown) => {
      filters.push(['eq', column, value]);
      return chain;
    }),
    is: vi.fn((column: string, value: unknown) => {
      filters.push(['is', column, value]);
      return chain;
    }),
    maybeSingle: vi.fn(() => Promise.resolve(resolve())),
    single: vi.fn(() => Promise.resolve(resolve())),
    then: (onFulfilled: (value: unknown) => unknown, onRejected?: (reason: unknown) => unknown) =>
      Promise.resolve(resolve()).then(onFulfilled, onRejected),
  };
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  state.candidates = [];
  state.notices = [];
  state.queue = [];
  state.rpcCalls = [];

  mocks.from.mockImplementation((table: string) => makeChain(table));

  mocks.rpc.mockImplementation((name: string, args: Record<string, unknown>) => {
    state.rpcCalls.push({ name, args: args ?? {} });
    if (name === 'get_gallery_expiry_warning_candidates') {
      const limit = Number(args.p_limit);
      return Promise.resolve({ data: state.candidates.slice(0, limit), error: null });
    }
    if (name === 'cancel_stale_gallery_expiry_warnings') {
      return Promise.resolve({ data: 0, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  });

  mocks.queueLifecycleEmail.mockResolvedValue({ queued: true, skipped: false, queueId: 'q-new' });
});

describe('queueGalleryExpiryWarnings', () => {
  it('runs the bounded stale-warning cancel once before scanning, with no caller anchor', async () => {
    state.candidates = [
      { user_id: 'u1', activity_anchor: NEW_ANCHOR },
      { user_id: 'u2', activity_anchor: NEW_ANCHOR },
    ];

    await queueGalleryExpiryWarnings();

    const cancels = state.rpcCalls.filter(
      call => call.name === 'cancel_stale_gallery_expiry_warnings'
    );
    expect(cancels).toHaveLength(1);
    expect(cancels[0].args).toEqual({});
    // Cancel runs before the candidate scan.
    expect(state.rpcCalls[0].name).toBe('cancel_stale_gallery_expiry_warnings');
  });

  it('creates one notice and queues one warning with the ctaUrl template prop', async () => {
    state.candidates = [{ user_id: 'u1', activity_anchor: NEW_ANCHOR }];
    state.queue.push({
      id: 'q-new',
      campaign_key: GALLERY_EXPIRY_WARNING_CAMPAIGN_KEY,
      user_id: 'u1',
      status: 'pending',
      metadata: { notice_id: '__pending__', activity_anchor: NEW_ANCHOR },
      sent_at: null,
    });
    mocks.queueLifecycleEmail.mockImplementation(async input => {
      const row = state.queue.find(q => q.id === 'q-new');
      if (row) row.metadata = { ...input.metadata };
      return { queued: true, skipped: false, queueId: 'q-new' };
    });

    const result = await queueGalleryExpiryWarnings();

    expect(result).toMatchObject({ scanned: 1, warned: 1, recovered: 0, failed: 0 });
    expect(state.notices).toHaveLength(1);
    expect(state.notices[0].queue_id).toBe('q-new');
    expect(mocks.queueLifecycleEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignKey: GALLERY_EXPIRY_WARNING_CAMPAIGN_KEY,
        userId: 'u1',
        metadata: expect.objectContaining({
          cta_destination: '/dashboard/gallery',
          activity_anchor: NEW_ANCHOR,
        }),
        templateData: expect.objectContaining({
          ctaUrl: expect.stringContaining('/dashboard/gallery'),
        }),
      })
    );
    const templateData = mocks.queueLifecycleEmail.mock.calls[0][0].templateData;
    expect(templateData).not.toHaveProperty('galleryUrl');
  });

  it('re-enqueues an unsent notice that has no live queue row (crash window)', async () => {
    state.candidates = [{ user_id: 'u1', activity_anchor: NEW_ANCHOR }];
    state.notices.push({
      id: 'notice-1',
      user_id: 'u1',
      activity_anchor: NEW_ANCHOR,
      queue_id: null,
      warning_sent_at: null,
    });
    mocks.queueLifecycleEmail.mockImplementation(async input => {
      state.queue.push({
        id: 'q-recovered',
        campaign_key: GALLERY_EXPIRY_WARNING_CAMPAIGN_KEY,
        user_id: 'u1',
        status: 'pending',
        metadata: { ...input.metadata },
        sent_at: null,
      });
      return { queued: true, skipped: false, queueId: 'q-recovered' };
    });

    const result = await queueGalleryExpiryWarnings();

    expect(result).toMatchObject({ scanned: 1, warned: 1, recovered: 0, failed: 0 });
    expect(state.notices).toHaveLength(1);
    expect(state.notices[0].queue_id).toBe('q-recovered');
    expect(state.queue).toHaveLength(1);
    expect(state.queue[0].metadata.notice_id).toBe('notice-1');
  });

  it('preserves a microsecond anchor exactly through notice, metadata and queue match', async () => {
    state.candidates = [{ user_id: 'u1', activity_anchor: RAW_ANCHOR }];
    mocks.queueLifecycleEmail.mockImplementation(async input => {
      state.queue.push({
        id: 'q-new',
        campaign_key: GALLERY_EXPIRY_WARNING_CAMPAIGN_KEY,
        user_id: 'u1',
        status: 'pending',
        metadata: { ...input.metadata },
        sent_at: null,
      });
      return { queued: true, skipped: false, queueId: 'q-new' };
    });

    const result = await queueGalleryExpiryWarnings();

    expect(result.warned).toBe(1);
    expect(state.notices[0].activity_anchor).toBe(RAW_ANCHOR);
    expect(mocks.queueLifecycleEmail.mock.calls[0][0].metadata.activity_anchor).toBe(RAW_ANCHOR);
    expect(state.queue[0].metadata.activity_anchor).toBe(RAW_ANCHOR);
  });

  it('recovers an existing pending warning when the enqueue response was lost', async () => {
    state.candidates = [{ user_id: 'u1', activity_anchor: NEW_ANCHOR }];
    state.notices.push({
      id: 'notice-1',
      user_id: 'u1',
      activity_anchor: NEW_ANCHOR,
      queue_id: null,
      warning_sent_at: null,
    });
    state.queue.push({
      id: 'q-pending',
      campaign_key: GALLERY_EXPIRY_WARNING_CAMPAIGN_KEY,
      user_id: 'u1',
      status: 'pending',
      metadata: { notice_id: 'notice-1', activity_anchor: NEW_ANCHOR },
      sent_at: null,
    });

    const result = await queueGalleryExpiryWarnings();

    expect(result).toMatchObject({ scanned: 1, warned: 0, recovered: 1, failed: 0 });
    expect(mocks.queueLifecycleEmail).not.toHaveBeenCalled();
    expect(state.notices).toHaveLength(1);
    expect(state.notices[0].queue_id).toBe('q-pending');
    expect(state.queue).toHaveLength(1);
  });

  it('does not warn twice for the same period after the queue row is pruned', async () => {
    state.candidates = [{ user_id: 'u1', activity_anchor: NEW_ANCHOR }];
    state.notices.push({
      id: 'notice-1',
      user_id: 'u1',
      activity_anchor: NEW_ANCHOR,
      queue_id: null,
      warning_sent_at: '2026-07-02T00:00:00.000Z',
    });
    // Queue row already pruned: only the permanent notice remains.

    const result = await queueGalleryExpiryWarnings();

    expect(result).toMatchObject({ scanned: 1, warned: 0, recovered: 0, failed: 0, alreadyDelivered: 1 });
    expect(mocks.queueLifecycleEmail).not.toHaveBeenCalled();
    expect(state.queue).toHaveLength(0);
  });

  it('never relabels a pending row from a different period returned by the uniqueness guard', async () => {
    state.candidates = [{ user_id: 'u1', activity_anchor: NEW_ANCHOR }];
    state.queue.push({
      id: 'q-mismatch',
      campaign_key: GALLERY_EXPIRY_WARNING_CAMPAIGN_KEY,
      user_id: 'u1',
      status: 'pending',
      metadata: { notice_id: 'notice-other', activity_anchor: NEW_ANCHOR },
      sent_at: null,
    });
    mocks.queueLifecycleEmail.mockResolvedValue({ queued: true, skipped: false, queueId: 'q-mismatch' });

    const result = await queueGalleryExpiryWarnings();

    expect(result).toMatchObject({ warned: 0, recovered: 0, failed: 1 });
    expect(state.notices[0]?.queue_id ?? null).toBeNull();
  });

  it('counts a candidate as failed when the recipient email is missing', async () => {
    state.candidates = [{ user_id: 'u1', activity_anchor: NEW_ANCHOR }];
    mocks.queueLifecycleEmail.mockResolvedValue({
      queued: false,
      skipped: true,
      reason: 'missing_recipient_email',
    });

    const result = await queueGalleryExpiryWarnings();

    expect(result).toMatchObject({ scanned: 1, warned: 0, recovered: 0, failed: 1 });
    expect(state.notices).toHaveLength(1);
    expect(state.notices[0].warning_sent_at).toBeNull();
  });

  it('bounds the candidate request to 1..50', async () => {
    await queueGalleryExpiryWarnings({ limit: 999 });
    await queueGalleryExpiryWarnings({ limit: 0 });

    const limits = state.rpcCalls
      .filter(call => call.name === 'get_gallery_expiry_warning_candidates')
      .map(call => call.args.p_limit);
    expect(limits).toEqual([50, 1]);
  });
});
