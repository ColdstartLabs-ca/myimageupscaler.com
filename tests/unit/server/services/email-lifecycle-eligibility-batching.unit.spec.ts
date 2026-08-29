import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailLifecycleService } from '@server/services/email-lifecycle.service';

/**
 * The daily eligibility scan runs inside a Cloudflare Worker. Every Supabase call is a
 * subrequest, and they were previously issued one user at a time, so the scan cost grew
 * as O(profiles) round-trips and a 500-profile scan took ~117s in production before the
 * Worker hit its resource limits. These tests pin the batched query shape.
 */

const PROFILE_COUNT = 40;
/** Must track EMAIL_LOOKUP_CONCURRENCY in the service. */
const EMAIL_LOOKUP_CONCURRENCY = 8;

interface ITableCall {
  table: string;
  columns: string;
  filters: Record<string, unknown>;
}

let tableCalls: ITableCall[] = [];
let getUserByIdCalls: string[] = [];
let profileRows: Array<Record<string, unknown>> = [];
let inFlightGetUserById = 0;
let maxInFlightGetUserById = 0;
let completedJobRows: Array<Record<string, unknown>> = [];
let purchaseRows: Array<Record<string, unknown>> = [];
let cancelingSubscriptionRows: Array<Record<string, unknown>> = [];

function makeProfiles(count: number): Array<Record<string, unknown>> {
  // Staggered around 10 days old: old enough for the "no upload in 3 days" campaign,
  // young enough to stay out of the 14-day win-back branch. Distinct timestamps make
  // scan ordering and paging observable. Index 0 is the oldest.
  return Array.from({ length: count }, (_, index) => ({
    id: `user_${index}`,
    created_at: new Date(Date.now() - (10 * 24 + count - index) * 60 * 60 * 1000).toISOString(),
    subscription_status: 'free',
    subscription_tier: null,
    subscription_credits_balance: 0,
    purchased_credits_balance: 0,
  }));
}

function makeChain(table: string, columns: string, options?: { count?: string; head?: boolean }) {
  const filters: Record<string, unknown> = { ...(options ?? {}) };
  const call: ITableCall = { table, columns, filters };
  tableCalls.push(call);

  const rowsFor = (): Array<Record<string, unknown>> => {
    const scoped = (rows: Array<Record<string, unknown>>) => {
      const ids = filters.user_id;
      if (Array.isArray(ids)) return rows.filter(row => ids.includes(row.user_id));
      if (typeof ids === 'string') return rows.filter(row => row.user_id === ids);
      return rows;
    };
    if (table === 'profiles') return profileRows;
    if (table === 'processing_jobs') return scoped(completedJobRows);
    if (table === 'credit_transactions') return scoped(purchaseRows);
    if (table === 'subscriptions') return scoped(cancelingSubscriptionRows);
    return [];
  };

  // Mirrors Postgres ordering, including NULLS FIRST on DESC, so the batched reduce
  // cannot pass by accident on insertion order.
  const applyOrder = (rows: Array<Record<string, unknown>>) => {
    const order = filters.order as { field: string; ascending: boolean } | undefined;
    if (!order) return rows;
    return [...rows].sort((left, right) => {
      const leftValue = left[order.field] ? Date.parse(String(left[order.field])) : null;
      const rightValue = right[order.field] ? Date.parse(String(right[order.field])) : null;
      if (leftValue === rightValue) return 0;
      if (leftValue === null) return order.ascending ? 1 : -1;
      if (rightValue === null) return order.ascending ? -1 : 1;
      return order.ascending ? leftValue - rightValue : rightValue - leftValue;
    });
  };

  const chain: Record<string, unknown> = {
    eq: vi.fn((field: string, value: unknown) => {
      filters[field] = value;
      return chain;
    }),
    in: vi.fn((field: string, value: unknown) => {
      filters[field] = value;
      return chain;
    }),
    order: vi.fn((field: string, options?: { ascending?: boolean }) => {
      filters.order = { field, ascending: options?.ascending !== false };
      return chain;
    }),
    limit: vi.fn((value: number) => {
      filters.limit = value;
      return chain;
    }),
    range: vi.fn((from: number, to: number) => {
      filters.range = [from, to];
      return chain;
    }),
    maybeSingle: vi.fn(async () => ({ data: applyOrder(rowsFor())[0] ?? null, error: null })),
    then: (resolve: (value: unknown) => void) => {
      const rows = applyOrder(rowsFor());
      if (options?.head) {
        resolve({ data: null, count: rows.length, error: null });
        return;
      }
      const range = filters.range as [number, number] | undefined;
      const limit = filters.limit as number | undefined;
      const paged = range ? rows.slice(range[0], range[1] + 1) : rows;
      resolve({ data: limit === undefined ? paged : paged.slice(0, limit), error: null });
    },
  };
  return chain;
}

vi.mock('@shared/config/env', () => ({
  serverEnv: { BASE_URL: 'http://localhost:3000', CRON_SECRET: 'test-secret' },
}));

vi.mock('@server/analytics', () => ({ trackServerEvent: vi.fn().mockResolvedValue(true) }));

vi.mock('@server/services/email.service', () => ({
  getEmailService: () => ({ send: vi.fn() }),
}));

vi.mock('@server/services/email-content-recommendation.service', () => ({
  getEmailContentRecommendationService: () => ({
    recommendForIntent: vi.fn().mockResolvedValue({
      title: 'Guide',
      description: 'How to',
      url: '/blog/guide',
      slug: 'guide',
      productCtaUrl: '/upscale',
      productCtaLabel: 'Try it',
    }),
  }),
}));

vi.mock('@server/services/revenue-recovery.service', () => ({
  getRevenueRecoveryService: () => ({
    queueEligibleRecoveryEmails: vi.fn().mockResolvedValue({
      scanned: 0,
      eligible: 0,
      queued: 0,
      skippedPurchased: 0,
      skippedPriority: 0,
      skippedMissingEmail: 0,
      suppressionsRecorded: 0,
      suppressionsReused: 0,
      dryRun: true,
      byAudience: {},
    }),
  }),
}));

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => ({
      select: vi.fn((columns: string, options?: { count?: string; head?: boolean }) =>
        makeChain(table, columns, options)
      ),
    })),
    auth: {
      admin: {
        getUserById: vi.fn(async (userId: string) => {
          getUserByIdCalls.push(userId);
          inFlightGetUserById++;
          maxInFlightGetUserById = Math.max(maxInFlightGetUserById, inFlightGetUserById);
          await new Promise(resolve => setTimeout(resolve, 1));
          inFlightGetUserById--;
          return { data: { user: { email: `${userId}@example.com` } }, error: null };
        }),
      },
    },
    rpc: vi.fn(async () => ({ data: [], error: null })),
  },
}));

function callsTo(table: string): ITableCall[] {
  return tableCalls.filter(call => call.table === table);
}

describe('queueDailyEligibilityDetailed batching', () => {
  beforeEach(() => {
    tableCalls = [];
    getUserByIdCalls = [];
    inFlightGetUserById = 0;
    maxInFlightGetUserById = 0;
    profileRows = makeProfiles(PROFILE_COUNT);
    completedJobRows = [];
    purchaseRows = [];
    cancelingSubscriptionRows = [];
  });

  it('reads each signal table a constant number of times regardless of profile count', async () => {
    const service = new EmailLifecycleService();
    await service.queueDailyEligibilityDetailed({ dryRun: true, limit: PROFILE_COUNT });

    // Newest slice + a head count + the rotating slice: constant, not per profile.
    expect(callsTo('profiles').length).toBeLessThanOrEqual(3);
    // One bounded page per signal table for the whole batch, not one read per profile.
    expect(callsTo('processing_jobs').length).toBeLessThanOrEqual(2);
    expect(callsTo('credit_transactions').length).toBeLessThanOrEqual(2);
    expect(callsTo('subscriptions').length).toBeLessThanOrEqual(2);
    expect(tableCalls.length).toBeLessThan(PROFILE_COUNT);
  });

  it('resolves each recipient email at most once per profile', async () => {
    const service = new EmailLifecycleService();
    await service.queueDailyEligibilityDetailed({ dryRun: true, limit: PROFILE_COUNT });

    expect(getUserByIdCalls.length).toBeLessThanOrEqual(PROFILE_COUNT);
    expect(new Set(getUserByIdCalls).size).toBe(getUserByIdCalls.length);
  });

  it('resolves recipient emails concurrently rather than one profile at a time', async () => {
    const service = new EmailLifecycleService();
    await service.queueDailyEligibilityDetailed({ dryRun: true, limit: PROFILE_COUNT });

    // Serial resolution never has more than one lookup in flight, and it is what kept a
    // 500-profile scan at ~70s in production.
    expect(maxInFlightGetUserById).toBeGreaterThan(1);
    expect(maxInFlightGetUserById).toBeLessThanOrEqual(EMAIL_LOOKUP_CONCURRENCY);
  });

  it('still classifies every profile from the batched signals', async () => {
    // user_0 uploaded 30 days ago and bought credits; the rest never uploaded.
    completedJobRows = [
      {
        user_id: 'user_0',
        completed_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        processing_mode: 'portrait',
      },
    ];
    purchaseRows = [{ user_id: 'user_0' }];

    const service = new EmailLifecycleService();
    const result = await service.queueDailyEligibilityDetailed({
      dryRun: true,
      limit: PROFILE_COUNT,
    });

    // 39 never-uploaded profiles get signup-no-upload-3d-blog; user_0 is a former buyer
    // idle 30 days (win-back at 45d does not apply yet) and gets the portrait blog nudge.
    expect(result.lifecycleQueued).toBe(PROFILE_COUNT);
  });

  it('uses the newest completed job per user when several exist', async () => {
    const recent = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const old = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    profileRows = makeProfiles(1);
    completedJobRows = [
      { user_id: 'user_0', completed_at: old, created_at: old, processing_mode: 'product' },
      { user_id: 'user_0', completed_at: recent, created_at: recent, processing_mode: 'portrait' },
    ];

    const service = new EmailLifecycleService();
    const result = await service.queueDailyEligibilityDetailed({ dryRun: true, limit: 1 });

    // Newest job is 3 days old and portrait -> the face-restore blog nudge only.
    // Falling back to the 90-day-old job would additionally trigger winback-free-7d.
    expect(result.lifecycleQueued).toBe(1);
  });
});

describe('queueDailyEligibilityDetailed scan window', () => {
  const TOTAL_PROFILES = 200;
  const SCAN_LIMIT = 20;

  beforeEach(() => {
    tableCalls = [];
    getUserByIdCalls = [];
    inFlightGetUserById = 0;
    maxInFlightGetUserById = 0;
    profileRows = makeProfiles(TOTAL_PROFILES);
    completedJobRows = [];
    purchaseRows = [];
    cancelingSubscriptionRows = [];
  });

  function scannedUserIds(): string[] {
    return [...new Set(getUserByIdCalls)];
  }

  it('scans the newest profiles so age-gated signup campaigns can reach them', async () => {
    const service = new EmailLifecycleService();
    await service.queueDailyEligibilityDetailed({ dryRun: true, limit: SCAN_LIMIT });

    // Scanning oldest-first only ever reached accounts far past every signup window,
    // which is why signup-no-upload-* never sent.
    expect(scannedUserIds()).toContain(`user_${TOTAL_PROFILES - 1}`);
  });

  it('never scans more profiles than the limit, so send volume stays flat', async () => {
    const service = new EmailLifecycleService();
    await service.queueDailyEligibilityDetailed({ dryRun: true, limit: SCAN_LIMIT });

    expect(scannedUserIds().length).toBeLessThanOrEqual(SCAN_LIMIT);
  });

  it('advances the rotating window between hourly runs', async () => {
    const service = new EmailLifecycleService();
    const hour = 60 * 60 * 1000;
    const base = Date.parse('2026-08-29T00:00:00.000Z');

    vi.spyOn(Date, 'now').mockReturnValue(base);
    await service.queueDailyEligibilityDetailed({ dryRun: true, limit: SCAN_LIMIT });
    const firstRun = scannedUserIds();

    getUserByIdCalls = [];
    vi.spyOn(Date, 'now').mockReturnValue(base + hour);
    await service.queueDailyEligibilityDetailed({ dryRun: true, limit: SCAN_LIMIT });
    const secondRun = scannedUserIds();

    vi.restoreAllMocks();

    // The newest slice is intentionally re-scanned; the rotating half must move on.
    const carriedOver = firstRun.filter(id => secondRun.includes(id));
    expect(carriedOver.length).toBeLessThan(firstRun.length);
    expect(secondRun.some(id => !firstRun.includes(id))).toBe(true);
  });

  it('reaches profiles outside the newest slice within a full rotation', async () => {
    const service = new EmailLifecycleService();
    const hour = 60 * 60 * 1000;
    const base = Date.parse('2026-08-29T00:00:00.000Z');
    const seen = new Set<string>();

    for (let run = 0; run < TOTAL_PROFILES; run++) {
      getUserByIdCalls = [];
      vi.spyOn(Date, 'now').mockReturnValue(base + run * hour);
      await service.queueDailyEligibilityDetailed({ dryRun: true, limit: SCAN_LIMIT });
      scannedUserIds().forEach(id => seen.add(id));
    }
    vi.restoreAllMocks();

    // The old oldest-25 window left 26,632 of 26,657 production profiles unreachable.
    expect(seen.size).toBe(TOTAL_PROFILES);
  });
});
