import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RevenueRecoveryService } from '@server/services/revenue-recovery.service';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';

const upserts: unknown[] = [];
const updates: unknown[] = [];
const selectedUpdates: unknown[] = [];
const queueLifecycleEmail = vi.fn();
const cancelPendingForUser = vi.fn();
let recoveryIntentRows: Array<Record<string, unknown>> = [];
let highUsageProfileRows: Array<Record<string, unknown>> = [];
let recoveryPriorityRows: Array<{ id: string }> = [];
let marketingConsent = true;
let unverifiedUserIds = new Set<string>();

vi.mock('@shared/config/env', () => ({
  serverEnv: {
    RECOVERY_EMAILS_ENABLED: true,
  },
}));

function makeSelectChain(table: string) {
  const state: Record<string, unknown> = {};
  const chain = {
    eq: vi.fn((field: string, value: unknown) => {
      state[field] = value;
      return chain;
    }),
    in: vi.fn(() => chain),
    not: vi.fn(() => chain),
    gt: vi.fn(() => chain),
    lt: vi.fn(() => chain),
    lte: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => {
      if (table === 'email_preferences') {
        return { data: { marketing_emails: marketingConsent }, error: null };
      }
      if (table === 'profiles' && state.id === 'user_1') {
        return { data: { id: 'user_1' }, error: null };
      }
      if (table === 'profiles' && state.id === 'user_2') {
        return { data: { id: 'user_2' }, error: null };
      }
      return { data: null, error: null };
    }),
    then: (resolve: (value: unknown) => void) => {
      if (table === 'revenue_recovery_intents') {
        resolve({ data: recoveryIntentRows, error: null });
        return;
      }
      if (table === 'profiles') {
        resolve({ data: highUsageProfileRows, error: null });
        return;
      }
      if (table === 'email_lifecycle_queue') {
        resolve({ data: recoveryPriorityRows, error: null });
        return;
      }
      if (table === 'credit_transactions') {
        resolve({ data: [], error: null });
        return;
      }
      resolve({ data: [], error: null });
    },
  };
  return chain;
}

function makeUpdateChain(payload: unknown) {
  const chain = {
    eq: vi.fn(() => chain),
    is: vi.fn(() => chain),
    lt: vi.fn(() => chain),
    in: vi.fn(() => chain),
    select: vi.fn(() => {
      selectedUpdates.push(payload);
      return Promise.resolve({ data: [{ id: 'intent_1' }], error: null });
    }),
    then: (resolve: (value: unknown) => void) => resolve({ error: null }),
  };
  return chain;
}

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: {
    auth: {
      admin: {
        getUserById: vi.fn(async (userId: string) => ({
          data: {
            user:
              userId === 'user_1' || userId === 'user_2'
                ? {
                    id: userId,
                    email: userId === 'user_1' ? 'user@example.com' : `${userId}@example.com`,
                    email_confirmed_at: unverifiedUserIds.has(userId)
                      ? null
                      : '2026-01-01T00:00:00Z',
                  }
                : null,
          },
          error: null,
        })),
        listUsers: vi.fn(async () => ({ data: { users: [] }, error: null })),
      },
    },
    from: vi.fn((table: string) => ({
      select: vi.fn(() => makeSelectChain(table)),
      upsert: vi.fn((payload: unknown, options: unknown) => {
        upserts.push({ payload, options });
        return Promise.resolve({ error: null });
      }),
      update: vi.fn((payload: unknown) => {
        updates.push(payload);
        return makeUpdateChain(payload);
      }),
    })),
  },
}));

describe('RevenueRecoveryService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    upserts.length = 0;
    updates.length = 0;
    selectedUpdates.length = 0;
    recoveryIntentRows = [];
    highUsageProfileRows = [];
    recoveryPriorityRows = [];
    marketingConsent = true;
    unverifiedUserIds = new Set<string>();
    queueLifecycleEmail.mockResolvedValue({ queued: true, skipped: false, queueId: 'queue_1' });
    cancelPendingForUser.mockResolvedValue(1);
  });

  it('should upsert imported checkout abandoners without duplicate queue rows', async () => {
    const service = new RevenueRecoveryService({
      amplitudeService: {
        downloadCohortMembers: vi.fn().mockResolvedValue([
          { userId: 'user_1', email: 'user@example.com', raw: {} },
          { userId: 'user_1', email: 'user@example.com', raw: {} },
        ]),
      } as never,
      lifecycleService: { queueLifecycleEmail } as never,
    });

    const result = await service.importAmplitudeCohort({
      cohortId: 'i1u84c2g',
      audienceKey: 'checkout_abandoner',
      dryRun: false,
    });

    expect(result).toMatchObject({
      totalMembers: 2,
      matchedProfiles: 2,
      upsertedIntents: 1,
      queuedEmails: 1,
      duplicatePending: 1,
    });
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({
      payload: {
        user_id: 'user_1',
        audience_key: 'checkout_abandoner',
        source: 'amplitude_cohort',
        source_id: 'i1u84c2g',
      },
      options: { onConflict: 'user_id,audience_key' },
    });
    expect(queueLifecycleEmail).toHaveBeenCalledTimes(1);
    expect(queueLifecycleEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignKey: 'checkout-abandoned-24h',
        userId: 'user_1',
        recipientEmail: 'user@example.com',
        templateData: expect.objectContaining({
          ctaUrl: '/pricing?intent=checkout_abandoner&recovery=checkout-abandoned',
          recoveryAudience: 'checkout_abandoner',
        }),
        metadata: expect.objectContaining({
          cta_destination: '/pricing?intent=checkout_abandoner&recovery=checkout-abandoned',
        }),
      })
    );
    expect(supabaseAdmin.from).toHaveBeenCalledWith('revenue_recovery_intents');
  });

  it('should not persist rows during dry run', async () => {
    const service = new RevenueRecoveryService({
      amplitudeService: {
        downloadCohortMembers: vi
          .fn()
          .mockResolvedValue([{ userId: 'user_1', email: 'user@example.com', raw: {} }]),
      } as never,
      lifecycleService: { queueLifecycleEmail } as never,
    });

    const result = await service.importAmplitudeCohort({
      cohortId: 'o4y4ltj8',
      audienceKey: 'upgrade_click_no_purchase',
      dryRun: true,
    });

    expect(result).toMatchObject({
      dryRun: true,
      totalMembers: 1,
      matchedProfiles: 1,
      upsertedIntents: 0,
      queuedEmails: 0,
    });
    expect(upserts).toHaveLength(0);
    expect(queueLifecycleEmail).not.toHaveBeenCalled();
  });

  it('should capture authenticated checkout analytics as first-party recovery intent', async () => {
    const service = new RevenueRecoveryService({
      amplitudeService: { downloadCohortMembers: vi.fn() } as never,
      lifecycleService: { queueLifecycleEmail, cancelPendingForUser } as never,
    });

    const captured = await service.captureAnalyticsIntent({
      userId: 'user_1',
      eventName: 'checkout_opened',
      sessionId: 'session_123',
      properties: {
        priceId: 'price_medium',
        selectedType: 'pack',
        selectedKey: 'medium',
        pricingRegion: 'standard',
      },
    });

    expect(captured).toBe(true);
    expect(upserts).toHaveLength(1);
    expect(upserts[0]).toMatchObject({
      payload: {
        user_id: 'user_1',
        audience_key: 'checkout_abandoner',
        source: 'first_party_event',
        source_id: 'session_123',
        price_id: 'price_medium',
        purchase_type: 'credit_pack',
        selected_key: 'medium',
        pricing_region: 'standard',
        identity_verified_at: expect.any(String),
        consent_basis: 'email_preferences.marketing_emails',
        source_surface: 'analytics_event',
        expires_at: expect.any(String),
      },
    });
  });

  it('should not persist recovery intent for an unverified identity', async () => {
    unverifiedUserIds.add('user_1');
    const service = new RevenueRecoveryService({
      amplitudeService: { downloadCohortMembers: vi.fn() } as never,
      lifecycleService: { queueLifecycleEmail, cancelPendingForUser } as never,
    });

    await expect(
      service.captureAnalyticsIntent({
        userId: 'user_1',
        eventName: 'checkout_abandoned',
        properties: { sourceSurface: 'purchase_modal' },
      })
    ).resolves.toBe(false);

    expect(upserts).toHaveLength(0);
  });

  it('should not persist or queue recovery without marketing consent', async () => {
    marketingConsent = false;
    const service = new RevenueRecoveryService({
      amplitudeService: { downloadCohortMembers: vi.fn() } as never,
      lifecycleService: { queueLifecycleEmail, cancelPendingForUser } as never,
    });

    await expect(
      service.captureAnalyticsIntent({
        userId: 'user_1',
        eventName: 'checkout_abandoned',
        properties: {},
      })
    ).resolves.toBe(false);

    expect(upserts).toHaveLength(0);
    expect(queueLifecycleEmail).not.toHaveBeenCalled();
  });

  it('should ignore anonymous analytics and non-credit-wall dismissals', async () => {
    const service = new RevenueRecoveryService({
      amplitudeService: { downloadCohortMembers: vi.fn() } as never,
      lifecycleService: { queueLifecycleEmail, cancelPendingForUser } as never,
    });

    await expect(
      service.captureAnalyticsIntent({
        eventName: 'checkout_opened',
        properties: {},
      })
    ).resolves.toBe(false);

    await expect(
      service.captureAnalyticsIntent({
        userId: 'user_1',
        eventName: 'upgrade_prompt_dismissed',
        properties: { trigger: 'pricing_page' },
      })
    ).resolves.toBe(false);

    expect(upserts).toHaveLength(0);
  });

  it('should mark recovery intents converted and cancel pending recovery emails', async () => {
    const service = new RevenueRecoveryService({
      amplitudeService: { downloadCohortMembers: vi.fn() } as never,
      lifecycleService: { queueLifecycleEmail, cancelPendingForUser } as never,
    });

    const converted = await service.markUserConverted({
      userId: 'user_1',
      purchaseType: 'credit_pack',
      stripeCheckoutSessionId: 'cs_test_123',
      amountCents: 1499,
      packKey: 'medium',
    });

    expect(converted).toBe(1);
    expect(selectedUpdates[0]).toMatchObject({
      status: 'converted',
      context: {
        conversion: expect.objectContaining({
          purchase_type: 'credit_pack',
          stripe_checkout_session_id: 'cs_test_123',
          amount_cents: 1499,
          pack_key: 'medium',
        }),
      },
    });
    expect(cancelPendingForUser).toHaveBeenCalledWith('user_1', 'purchased_after_recovery_intent', [
      'checkout-abandoned-24h',
      'upgrade-click-no-purchase-24h',
      'credit-wall-dismissed-48h',
      'high-usage-free-user',
    ]);
  });

  it('should queue credit wall recovery after delay when no purchase exists', async () => {
    recoveryIntentRows = [
      {
        user_id: 'user_1',
        audience_key: 'credit_wall_dismissed',
        source: 'first_party_event',
        source_id: 'session_1',
        last_seen_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
        selected_key: 'small-pack',
        trigger: 'insufficient_credits',
      },
    ];
    const service = new RevenueRecoveryService({
      amplitudeService: { downloadCohortMembers: vi.fn() } as never,
      lifecycleService: { queueLifecycleEmail, cancelPendingForUser } as never,
    });

    const result = await service.queueEligibleRecoveryEmails({ dryRun: false, limit: 10 });

    expect(result).toMatchObject({
      scanned: 1,
      eligible: 1,
      queued: 1,
      byAudience: {
        credit_wall_dismissed: {
          scanned: 1,
          eligible: 1,
          queued: 1,
        },
      },
    });
    expect(queueLifecycleEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignKey: 'credit-wall-dismissed-48h',
        userId: 'user_1',
        recipientEmail: 'user@example.com',
        metadata: expect.objectContaining({
          audience_key: 'credit_wall_dismissed',
          cta_destination:
            '/pricing?intent=credit_wall_dismissed&recovery=credit-wall&trigger=insufficient_credits',
        }),
        templateData: expect.objectContaining({
          ctaUrl:
            '/pricing?intent=credit_wall_dismissed&recovery=credit-wall&trigger=insufficient_credits',
        }),
      })
    );
  });

  it('should report reused suppression audits in recovery eligibility totals', async () => {
    recoveryIntentRows = [
      {
        user_id: 'user_1',
        audience_key: 'credit_wall_dismissed',
        source: 'first_party_event',
        source_id: 'session_1',
        last_seen_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      },
    ];
    queueLifecycleEmail.mockResolvedValueOnce({
      queued: false,
      skipped: true,
      reason: 'suppressed_preference',
      queueId: 'existing-suppression',
      suppressionRecorded: false,
    });
    const service = new RevenueRecoveryService({
      amplitudeService: { downloadCohortMembers: vi.fn() } as never,
      lifecycleService: { queueLifecycleEmail, cancelPendingForUser } as never,
    });

    const result = await service.queueEligibleRecoveryEmails({ dryRun: false, limit: 10 });

    expect(result).toMatchObject({
      queued: 0,
      suppressionsRecorded: 0,
      suppressionsReused: 1,
    });
  });

  it('should include selected plan and trigger context in upgrade recovery CTA destinations', async () => {
    recoveryIntentRows = [
      {
        user_id: 'user_1',
        audience_key: 'upgrade_click_no_purchase',
        source: 'first_party_event',
        source_id: 'session_1',
        selected_key: 'pro',
        trigger: 'credit_wall_modal',
        purchase_type: 'subscription',
        last_seen_at: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
      },
    ];
    const service = new RevenueRecoveryService({
      amplitudeService: { downloadCohortMembers: vi.fn() } as never,
      lifecycleService: { queueLifecycleEmail, cancelPendingForUser } as never,
    });

    const result = await service.queueEligibleRecoveryEmails({ dryRun: false, limit: 10 });

    expect(result.queued).toBe(1);
    expect(queueLifecycleEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        campaignKey: 'upgrade-click-no-purchase-24h',
        templateData: expect.objectContaining({
          ctaUrl:
            '/pricing?intent=upgrade_click_no_purchase&recovery=upgrade-click&trigger=credit_wall_modal&selected=pro',
        }),
        metadata: expect.objectContaining({
          cta_destination:
            '/pricing?intent=upgrade_click_no_purchase&recovery=upgrade-click&trigger=credit_wall_modal&selected=pro',
        }),
      })
    );
  });

  it('should suppress high usage free email when checkout recovery is pending', async () => {
    recoveryIntentRows = [
      {
        user_id: 'user_2',
        audience_key: 'high_usage_free_user',
        source: 'profile_credit_scan',
        last_seen_at: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      },
    ];
    recoveryPriorityRows = [{ id: 'pending_checkout_recovery' }];
    const service = new RevenueRecoveryService({
      amplitudeService: { downloadCohortMembers: vi.fn() } as never,
      lifecycleService: { queueLifecycleEmail, cancelPendingForUser } as never,
    });

    const result = await service.queueEligibleRecoveryEmails({ dryRun: false, limit: 10 });

    expect(result).toMatchObject({
      scanned: 1,
      eligible: 0,
      queued: 0,
      skippedPriority: 1,
      byAudience: {
        high_usage_free_user: {
          scanned: 1,
          eligible: 0,
          queued: 0,
          skippedPriority: 1,
        },
      },
    });
    expect(queueLifecycleEmail).not.toHaveBeenCalled();
  });
});
