import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailLifecycleService } from '@server/services/email-lifecycle.service';
import { EmailProviderSendError } from '@server/services/email-providers/base-email-provider-adapter';

const queueInserts: Record<string, unknown>[] = [];
const eventInserts: Record<string, unknown>[] = [];
const { sendEmailMock, trackServerEventMock } = vi.hoisted(() => ({
  sendEmailMock: vi.fn(),
  trackServerEventMock: vi.fn().mockResolvedValue(true),
}));
let preferences: Record<string, boolean> = {
  marketing_emails: true,
  product_updates: true,
  low_credit_alerts: true,
};
let recentMarketingRows: Array<{
  id: string;
  status?: string;
  campaign_key?: string;
  reason?: string;
}> = [];
let dueQueueRows: Array<Record<string, unknown>> = [];
let emailLogRows: Array<Record<string, unknown>> = [];
let emailLogError: { message: string } | null = null;
let lifecycleEventInsertError: { message: string } | null = null;
let currentCreditProfile: Record<string, number> | null = {
  subscription_credits_balance: 0,
  purchased_credits_balance: 0,
};
let profileReadError: { message: string } | null = null;
let purchaseTransactionRows: Array<Record<string, unknown>> = [];
const queueUpdates: Record<string, unknown>[] = [];

function makeDueQueueRow(
  campaignKey: string,
  templateData: Record<string, unknown>
): Record<string, unknown> {
  return {
    id: `queue_${campaignKey}`,
    campaign_key: campaignKey,
    user_id: 'user_123',
    recipient_email: 'user@example.com',
    scheduled_for: new Date(Date.now() - 1000).toISOString(),
    status: 'pending',
    template_data: templateData,
    metadata: {},
    created_at: new Date().toISOString(),
  };
}

vi.mock('@shared/config/env', () => ({
  serverEnv: {
    AMPLITUDE_API_KEY: 'test-key',
    BASE_URL: 'http://localhost:3000',
    CRON_SECRET: 'test-secret',
  },
}));

vi.mock('@server/analytics', () => ({
  trackServerEvent: trackServerEventMock,
}));

vi.mock('@server/services/email.service', () => ({
  getEmailService: () => ({
    send: sendEmailMock,
  }),
}));

function makeSelectChain(table: string, selectColumns?: string) {
  const state: Record<string, unknown> = {};
  const chain = {
    eq: vi.fn((field: string, value: unknown) => {
      state[field] = value;
      return chain;
    }),
    neq: vi.fn((field: string, value: unknown) => {
      state[`not_${field}`] = value;
      return chain;
    }),
    in: vi.fn((field: string, value: unknown) => {
      state[field] = value;
      return chain;
    }),
    gte: vi.fn(() => chain),
    lte: vi.fn(() => chain),
    order: vi.fn(() => chain),
    limit: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => {
      if (table === 'email_lifecycle_campaigns') {
        const isRecovery = [
          'checkout-abandoned-24h',
          'upgrade-click-no-purchase-24h',
          'credit-wall-dismissed-48h',
          'high-usage-free-user',
        ].includes(String(state.key));
        const isTransactional = String(state.key) === 'payment-success';
        return {
          data: {
            key: state.key,
            name: isRecovery ? 'Checkout Recovery' : 'Low credits',
            category: isRecovery
              ? 'revenue_recovery'
              : state.key === 'blog-education-face-restore'
                ? 'blog_education'
                : 'low_credit',
            template_name:
              state.key === 'blog-education-face-restore'
                ? 'blog-education'
                : isRecovery
                  ? 'checkout-recovery'
                  : 'low-credits',
            email_type: isTransactional ? 'transactional' : 'marketing',
            preference_key: isTransactional
              ? null
              : isRecovery || state.key === 'blog-education-face-restore'
                ? 'marketing_emails'
                : 'low_credit_alerts',
            enabled: true,
            cooldown_days: 7,
            priority:
              state.key === 'blog-education-face-restore' ? 'education' : 'revenue_critical',
            sort_priority: state.key === 'blog-education-face-restore' ? 40 : 90,
          },
          error: null,
        };
      }
      if (table === 'email_preferences') {
        return { data: preferences, error: null };
      }
      if (table === 'email_lifecycle_queue') {
        return { data: null, error: null };
      }
      if (table === 'profiles') {
        return { data: currentCreditProfile, error: profileReadError };
      }
      return { data: null, error: null };
    }),
    then: (resolve: (value: unknown) => void) => {
      if (table === 'email_lifecycle_campaigns' && selectColumns === 'key') {
        resolve({ data: [{ key: 'low-credits' }, { key: 'zero-credits' }], error: null });
        return;
      }
      if (table === 'email_lifecycle_queue') {
        if (selectColumns === '*' && state.status === 'pending') {
          resolve({ data: dueQueueRows, error: null });
          return;
        }
        const rows = recentMarketingRows.filter(row => {
          const status = row.status ?? 'sent';
          const campaignKey = row.campaign_key ?? 'low-credits';
          const campaignMatches = Array.isArray(state.campaign_key)
            ? state.campaign_key.includes(campaignKey)
            : !state.campaign_key || campaignKey === state.campaign_key;
          return (
            (!state.status || status === state.status) &&
            campaignMatches &&
            (!state.reason || row.reason === state.reason) &&
            (!state.not_id || row.id !== state.not_id)
          );
        });
        resolve({ data: rows, error: null });
        return;
      }
      if (table === 'email_logs') {
        const recentCutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
        resolve({
          data: emailLogRows
            .filter(row => Date.parse(String(row.sent_at)) >= recentCutoff)
            .slice(0, 20),
          error: emailLogError,
        });
        return;
      }
      if (table === 'credit_transactions') {
        resolve({ data: purchaseTransactionRows, error: null });
        return;
      }
      resolve({ data: [], error: null });
    },
  };
  return chain;
}

vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: {
    auth: {
      admin: {
        getUserById: vi.fn().mockResolvedValue({
          data: { user: { email: 'user@example.com', user_metadata: { name: 'Ada' } } },
          error: null,
        }),
      },
    },
    rpc: vi.fn(async (name: string, args: Record<string, unknown>) => {
      if (name === 'claim_email_lifecycle_queue_row_for_delivery') {
        return { data: 'claimed', error: null };
      }
      if (
        name === 'cancel_expired_email_lifecycle_queue' ||
        name === 'release_email_recipient_value_holdout'
      ) {
        return { data: 0, error: null };
      }
      if (name === 'record_email_lifecycle_suppression') {
        queueInserts.push({
          campaign_key: args.p_campaign_key,
          user_id: args.p_user_id,
          recipient_email: args.p_recipient_email,
          scheduled_for: args.p_scheduled_for,
          status: 'skipped',
          reason: args.p_reason,
          template_data: args.p_template_data,
          metadata: args.p_metadata,
        });
        return {
          data: [{ queue_id: `queue_${queueInserts.length}`, inserted: true }],
          error: null,
        };
      }
      return {
        data: dueQueueRows
          .map(row => {
            const education = row.campaign_key === 'blog-education-face-restore';
            const recovery = String(row.campaign_key).includes('checkout-abandoned');
            return {
              ...row,
              campaign_name: education
                ? 'Photo restoration guide'
                : recovery
                  ? 'Checkout recovery'
                  : 'Low credits',
              campaign_category: education
                ? 'blog_education'
                : recovery
                  ? 'revenue_recovery'
                  : 'low_credit',
              campaign_template_name: education
                ? 'blog-education'
                : recovery
                  ? 'checkout-recovery'
                  : 'low-credits',
              campaign_email_type: 'marketing',
              campaign_preference_key: education ? 'marketing_emails' : 'low_credit_alerts',
              campaign_enabled: true,
              campaign_cooldown_days: 7,
              campaign_priority: education ? 'education' : 'revenue_critical',
              campaign_sort_priority: education ? 40 : 90,
              recipient_value_decision: row.recipient_value_decision ?? 'keep_high',
              recipient_value_policy_version: row.recipient_value_policy_version ?? 'v1',
            };
          })
          .sort((a, b) => {
            const rank = { revenue_critical: 1, education: 3 } as const;
            return rank[a.campaign_priority] - rank[b.campaign_priority];
          })
          .slice(0, Number(args.p_limit ?? 50)),
        error: null,
      };
    }),
    from: vi.fn((table: string) => ({
      select: vi.fn((columns?: string) => makeSelectChain(table, columns)),
      insert: vi.fn((payload: Record<string, unknown>) => {
        if (table === 'email_lifecycle_queue') queueInserts.push(payload);
        if (table === 'email_lifecycle_events') eventInserts.push(payload);
        return {
          error: table === 'email_lifecycle_events' ? lifecycleEventInsertError : null,
          select: vi.fn(() => ({
            single: vi
              .fn()
              .mockResolvedValue({ data: { id: `queue_${queueInserts.length}` }, error: null }),
          })),
        };
      }),
      update: vi.fn((payload: Record<string, unknown>) => {
        if (table === 'email_lifecycle_queue') queueUpdates.push(payload);
        return makeSelectChain(table);
      }),
    })),
  },
}));

describe('EmailLifecycleService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    queueInserts.length = 0;
    eventInserts.length = 0;
    preferences = {
      marketing_emails: true,
      product_updates: true,
      low_credit_alerts: true,
    };
    recentMarketingRows = [];
    dueQueueRows = [];
    emailLogRows = [];
    emailLogError = null;
    lifecycleEventInsertError = null;
    currentCreditProfile = {
      subscription_credits_balance: 0,
      purchased_credits_balance: 0,
    };
    profileReadError = null;
    purchaseTransactionRows = [];
    queueUpdates.length = 0;
    sendEmailMock.mockResolvedValue({ success: true, messageId: 'msg_test' });
  });

  it('suppresses marketing emails for opted-out users', async () => {
    preferences.low_credit_alerts = false;
    const service = new EmailLifecycleService();

    const result = await service.queueLifecycleEmail({
      campaignKey: 'low-credits',
      userId: 'user_123',
      templateData: { creditsRemaining: 3 },
    });

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('suppressed_preference');
    expect(queueInserts[0]).toMatchObject({
      status: 'skipped',
      reason: 'suppressed_preference',
    });
    expect(eventInserts[0]).toMatchObject({
      event_type: 'suppressed_preference',
      campaign_key: 'low-credits',
    });
  });

  it('applies weekly frequency cap', async () => {
    recentMarketingRows = [{ id: 'sent_1', status: 'sent', campaign_key: 'zero-credits' }];
    const service = new EmailLifecycleService();

    const result = await service.queueLifecycleEmail({
      campaignKey: 'low-credits',
      userId: 'user_123',
      templateData: { creditsRemaining: 3 },
    });

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('suppressed_revenue_72h_cap');
    expect(queueInserts[0]).toMatchObject({
      status: 'skipped',
      reason: 'suppressed_revenue_72h_cap',
    });
  });

  it('should not count another pending campaign as sent history when processing a due row', async () => {
    recentMarketingRows = [
      { id: 'pending_other', status: 'pending', campaign_key: 'zero-credits' },
    ];
    dueQueueRows = [
      {
        id: 'queue_due',
        campaign_key: 'low-credits',
        user_id: 'user_123',
        recipient_email: 'user@example.com',
        scheduled_for: new Date(Date.now() - 1000).toISOString(),
        status: 'pending',
        template_data: {},
        metadata: {},
        created_at: new Date().toISOString(),
      },
    ];

    const result = await new EmailLifecycleService().processDueQueue({ batchSize: 1 });

    expect(sendEmailMock).toHaveBeenCalledOnce();
    expect(result.sent).toBe(1);
  });

  it('cancels a stale zero-credit email when the user now has credits', async () => {
    currentCreditProfile = {
      subscription_credits_balance: 10,
      purchased_credits_balance: 29,
    };
    dueQueueRows = [makeDueQueueRow('zero-credits', {})];

    const result = await new EmailLifecycleService().processDueQueue({ batchSize: 1 });

    expect(result).toMatchObject({ sent: 0, skipped: 1 });
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(queueUpdates).toContainEqual(
      expect.objectContaining({ status: 'cancelled', reason: 'stale_balance_not_zero' })
    );
  });

  it('refreshes the low-credit balance immediately before provider submission', async () => {
    currentCreditProfile = {
      subscription_credits_balance: 2,
      purchased_credits_balance: 0,
    };
    dueQueueRows = [makeDueQueueRow('low-credits', { creditsRemaining: 0 })];

    const result = await new EmailLifecycleService().processDueQueue({ batchSize: 1 });

    expect(result.sent).toBe(1);
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ creditsRemaining: 2 }) })
    );
  });

  it('cancels a low-credit email at the four-credit enqueue boundary', async () => {
    currentCreditProfile = {
      subscription_credits_balance: 4,
      purchased_credits_balance: 0,
    };
    dueQueueRows = [makeDueQueueRow('low-credits', { creditsRemaining: 3 })];

    const result = await new EmailLifecycleService().processDueQueue({ batchSize: 1 });

    expect(result).toMatchObject({ sent: 0, skipped: 1 });
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(queueUpdates).toContainEqual(
      expect.objectContaining({
        status: 'cancelled',
        reason: 'stale_balance_above_low_credit_threshold',
      })
    );
  });

  it('cancels an insufficient-credit email when the current balance is sufficient', async () => {
    currentCreditProfile = {
      subscription_credits_balance: 10,
      purchased_credits_balance: 0,
    };
    dueQueueRows = [makeDueQueueRow('insufficient-credits-finish-image', { requiredCredits: 5 })];

    const result = await new EmailLifecycleService().processDueQueue({ batchSize: 1 });

    expect(result).toMatchObject({ sent: 0, skipped: 1 });
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(queueUpdates).toContainEqual(
      expect.objectContaining({ status: 'cancelled', reason: 'stale_balance_now_sufficient' })
    );
  });

  it('reschedules a balance-sensitive email when the current balance cannot be read', async () => {
    profileReadError = { message: 'database unavailable' };
    dueQueueRows = [makeDueQueueRow('zero-credits', {})];
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await new EmailLifecycleService().processDueQueue({ batchSize: 1 });

    expect(result).toMatchObject({ sent: 0, rescheduled: 1 });
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(queueUpdates).toContainEqual(
      expect.objectContaining({
        status: 'pending',
        reason: 'balance_revalidation_failed:balance_lookup_failed',
      })
    );
    consoleSpy.mockRestore();
  });

  it('sends an eligible zero-credit email with a fresh zero balance', async () => {
    dueQueueRows = [makeDueQueueRow('zero-credits', { creditsRemaining: 39 })];

    const result = await new EmailLifecycleService().processDueQueue({ batchSize: 1 });

    expect(result.sent).toBe(1);
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ creditsRemaining: 0 }) })
    );
  });

  it('cancels a low-credit email when the current balance is above the threshold', async () => {
    currentCreditProfile = {
      subscription_credits_balance: 5,
      purchased_credits_balance: 0,
    };
    dueQueueRows = [makeDueQueueRow('low-credits', { creditsRemaining: 2 })];

    const result = await new EmailLifecycleService().processDueQueue({ batchSize: 1 });

    expect(result.skipped).toBe(1);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('refreshes an insufficient-credit email when the balance remains insufficient', async () => {
    currentCreditProfile = {
      subscription_credits_balance: 2,
      purchased_credits_balance: 1,
    };
    dueQueueRows = [
      makeDueQueueRow('insufficient-credits-finish-image', {
        requiredCredits: 5,
        creditsRemaining: 0,
      }),
    ];

    const result = await new EmailLifecycleService().processDueQueue({ batchSize: 1 });

    expect(result.sent).toBe(1);
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ creditsRemaining: 3 }) })
    );
  });

  it('uses purchased credits for unused-credit eligibility and rendering', async () => {
    currentCreditProfile = {
      subscription_credits_balance: 10,
      purchased_credits_balance: 7,
    };
    dueQueueRows = [makeDueQueueRow('unused-credits-14d', { creditsRemaining: 50 })];

    const result = await new EmailLifecycleService().processDueQueue({ batchSize: 1 });

    expect(result.sent).toBe(1);
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ creditsRemaining: 7 }) })
    );
  });

  it('cancels unused-credit and credit-holder winback emails when relevant balances are empty', async () => {
    dueQueueRows = [makeDueQueueRow('unused-credits-14d', { creditsRemaining: 50 })];
    const service = new EmailLifecycleService();
    expect(await service.processDueQueue({ batchSize: 1 })).toMatchObject({ skipped: 1, sent: 0 });

    vi.clearAllMocks();
    queueUpdates.length = 0;
    dueQueueRows = [makeDueQueueRow('winback-credit-holder-21d', { creditsRemaining: 10 })];
    expect(await service.processDueQueue({ batchSize: 1 })).toMatchObject({ skipped: 1, sent: 0 });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('renders the current total for a credit-holder winback email', async () => {
    currentCreditProfile = {
      subscription_credits_balance: 10,
      purchased_credits_balance: 4,
    };
    dueQueueRows = [makeDueQueueRow('winback-credit-holder-21d', { creditsRemaining: 1 })];

    const result = await new EmailLifecycleService().processDueQueue({ batchSize: 1 });

    expect(result.sent).toBe(1);
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ creditsRemaining: 14 }) })
    );
  });

  it('should report one eligible dry-run candidate for two pending campaigns with no sends', async () => {
    recentMarketingRows = [
      { id: 'pending_other', status: 'pending', campaign_key: 'zero-credits' },
    ];
    dueQueueRows = [
      {
        id: 'queue_due_dry_run',
        campaign_key: 'low-credits',
        user_id: 'user_123',
        recipient_email: 'user@example.com',
        scheduled_for: new Date(Date.now() - 1000).toISOString(),
        status: 'pending',
        template_data: {},
        metadata: {},
        created_at: new Date().toISOString(),
      },
    ];

    const result = await new EmailLifecycleService().processDueQueue({
      dryRun: true,
      batchSize: 1,
    });

    expect(result).toMatchObject({ eligible: 1, queued: 1, skipped: 0, sent: 0 });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('should report the expected cap in dry-run when a prior sent row exists', async () => {
    recentMarketingRows = [{ id: 'sent_other', status: 'sent', campaign_key: 'zero-credits' }];
    dueQueueRows = [
      {
        id: 'queue_due_after_send',
        campaign_key: 'low-credits',
        user_id: 'user_123',
        recipient_email: 'user@example.com',
        scheduled_for: new Date(Date.now() - 1000).toISOString(),
        status: 'pending',
        template_data: {},
        metadata: {},
        created_at: new Date().toISOString(),
      },
    ];

    const result = await new EmailLifecycleService().processDueQueue({
      dryRun: true,
      batchSize: 1,
    });

    expect(result).toMatchObject({ eligible: 1, queued: 0, skipped: 1, sent: 0 });
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('should deduplicate the same pending campaign when enqueueing', async () => {
    recentMarketingRows = [{ id: 'pending_same', status: 'pending', campaign_key: 'low-credits' }];

    const result = await new EmailLifecycleService().queueLifecycleEmail({
      campaignKey: 'low-credits',
      userId: 'user_123',
    });

    expect(result).toMatchObject({ skipped: true, reason: 'suppressed_campaign_cooldown' });
    expect(queueInserts).not.toContainEqual(expect.objectContaining({ status: 'pending' }));
  });

  it('should not bypass a complaint when forceFrequency is true', async () => {
    emailLogRows = [
      {
        provider_response: { complaint: true },
        status: 'failed',
        sent_at: new Date().toISOString(),
      },
    ];

    const result = await new EmailLifecycleService().queueLifecycleEmail({
      campaignKey: 'zero-credits',
      userId: 'user_123',
      forceFrequency: 'zero_credit_alert',
    });

    expect(result).toMatchObject({ skipped: true, reason: 'suppressed_email_status' });
  });

  it('should reuse a recent identical suppression audit record', async () => {
    preferences.low_credit_alerts = false;
    recentMarketingRows = [
      {
        id: 'existing_suppression',
        status: 'skipped',
        campaign_key: 'low-credits',
        reason: 'suppressed_preference',
      },
    ];

    const result = await new EmailLifecycleService().queueLifecycleEmail({
      campaignKey: 'low-credits',
      userId: 'user_123',
    });

    expect(result).toMatchObject({
      queueId: 'existing_suppression',
      suppressionRecorded: false,
    });
    expect(queueInserts).toHaveLength(0);
    expect(eventInserts).toHaveLength(0);
  });

  it('does not suppress a recipient for a complaint older than 90 days', async () => {
    emailLogRows = [
      ...Array.from({ length: 101 }, (_, index) => ({
        provider_response: { error: `transient_${index}` },
        status: 'failed',
        sent_at: new Date(Date.UTC(2026, 0, index + 1)).toISOString(),
      })),
      {
        provider_response: { complaint: true },
        status: 'failed',
        sent_at: '2025-01-01T00:00:00.000Z',
      },
    ];
    const service = new EmailLifecycleService();

    const result = await service.queueLifecycleEmail({
      campaignKey: 'low-credits',
      userId: 'user_123',
      templateData: { creditsRemaining: 0 },
    });

    expect(result.queued).toBe(true);
    expect(queueInserts.at(-1)).toMatchObject({
      status: 'pending',
      recipient_value_decision: expect.any(String),
      recipient_value_policy_version: 'v1',
      recipient_value_reasons: expect.any(Array),
    });
  });

  it('should leave a transactional enqueue independent of recipient-value classification', async () => {
    const result = await new EmailLifecycleService().queueLifecycleEmail({
      campaignKey: 'payment-success',
      userId: 'user_123',
    });

    expect(result).toMatchObject({ queued: true, skipped: false });
    expect(queueInserts.at(-1)).toMatchObject({ status: 'pending' });
    expect(queueInserts.at(-1)).not.toHaveProperty('recipient_value_decision');
    expect(queueInserts.at(-1)).not.toHaveProperty('recipient_value_policy_version');
  });

  it('should cancel a released holdout when the recipient purchased after classification', async () => {
    purchaseTransactionRows = [{ id: 'purchase-after-hold' }];
    dueQueueRows = [
      {
        ...makeDueQueueRow('low-credits', { creditsRemaining: 0 }),
        recipient_value_score: 20,
        recipient_value_band: 'experiment',
        recipient_value_decision: 'hold_experiment',
        recipient_value_policy_version: 'v1',
        recipient_value_classified_at: '2026-07-20T00:00:00.000Z',
        recipient_value_holdout_released_at: new Date().toISOString(),
      },
    ];

    const result = await new EmailLifecycleService().processDueQueue({ batchSize: 1 });

    expect(result).toMatchObject({ sent: 0, skipped: 1 });
    expect(sendEmailMock).not.toHaveBeenCalled();
    expect(queueUpdates).toContainEqual(
      expect.objectContaining({ status: 'cancelled', reason: 'holdout_recipient_purchased' })
    );
  });

  it('should not treat an empty Cloudflare permanent-bounces field as a bounce', async () => {
    emailLogRows = [
      {
        provider_response: { provider: 'cloudflare', permanent_bounces: [] },
        status: 'sent',
        sent_at: new Date().toISOString(),
      },
    ];

    const result = await new EmailLifecycleService().queueLifecycleEmail({
      campaignKey: 'low-credits',
      userId: 'user_123',
    });

    expect(result).toMatchObject({ queued: true, skipped: false });
  });

  it('should suppress a recipient when Cloudflare reports a non-empty permanent bounce', async () => {
    emailLogRows = [
      {
        provider_response: { provider: 'cloudflare', permanent_bounces: ['redacted'] },
        status: 'sent',
        sent_at: new Date().toISOString(),
      },
    ];

    const result = await new EmailLifecycleService().queueLifecycleEmail({
      campaignKey: 'low-credits',
      userId: 'user_123',
    });

    expect(result).toMatchObject({ skipped: true, reason: 'suppressed_email_status' });
  });

  it('suppresses a recent complaint but only scans a bounded recent window', async () => {
    emailLogRows = [
      {
        provider_response: { complaint: true },
        status: 'failed',
        sent_at: new Date().toISOString(),
      },
    ];
    const result = await new EmailLifecycleService().queueLifecycleEmail({
      campaignKey: 'low-credits',
      userId: 'user_123',
      templateData: { creditsRemaining: 0 },
    });
    expect(result).toMatchObject({ skipped: true, reason: 'suppressed_email_status' });
  });

  it('leaves a marketing row pending when the email status lookup fails', async () => {
    emailLogError = { message: 'database unavailable' };
    dueQueueRows = [
      {
        id: 'queue_status_error',
        campaign_key: 'low-credits',
        user_id: 'user_123',
        recipient_email: 'user@example.com',
        scheduled_for: new Date(Date.now() - 1000).toISOString(),
        status: 'pending',
        template_data: {},
        metadata: {},
        created_at: new Date().toISOString(),
      },
    ];
    const result = await new EmailLifecycleService().processDueQueue({ batchSize: 1 });
    expect(result.failed).toBe(1);
    expect(sendEmailMock).not.toHaveBeenCalled();
  });

  it('should reschedule once and stop when Brevo is rate limited', async () => {
    sendEmailMock.mockRejectedValueOnce(
      new EmailProviderSendError(
        'Brevo rate limit reached',
        'rate_limited',
        true,
        ['brevo'],
        false,
        [],
        ['rate_limited']
      )
    );
    dueQueueRows = ['first', 'second'].map(id => ({
      id: `queue_${id}`,
      campaign_key: 'low-credits',
      user_id: `user_${id}`,
      recipient_email: `${id}@example.com`,
      scheduled_for: new Date(Date.now() - 1000).toISOString(),
      status: 'pending',
      template_data: {},
      metadata: {},
      created_at: new Date().toISOString(),
    }));

    const result = await new EmailLifecycleService().processDueQueue({ batchSize: 2 });

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(result.failed).toBe(0);
    expect(result.rescheduled).toBe(1);
    expect(result.stoppedByProvider).toBe(true);
    expect(result.stoppedByProviderCapacity).toBe(true);
    expect(queueUpdates).toContainEqual(
      expect.objectContaining({
        status: 'pending',
        reason: expect.stringContaining('provider_capacity_exhausted'),
      })
    );
    expect(eventInserts).toContainEqual(
      expect.objectContaining({
        event_type: 'failed',
        metadata: expect.objectContaining({
          classification: 'rate_limited',
          attemptedProviders: ['brevo'],
          unavailableProviders: [],
          fallbackReasons: ['rate_limited'],
        }),
      })
    );
  });

  it('should stop immediately when Brevo reports an account block', async () => {
    sendEmailMock.mockRejectedValueOnce(
      new EmailProviderSendError(
        'Brevo account is blocked',
        'provider_blocked',
        false,
        ['brevo'],
        false
      )
    );
    dueQueueRows = [
      {
        id: 'queue_blocked',
        campaign_key: 'low-credits',
        user_id: 'user_blocked',
        recipient_email: 'blocked@example.com',
        scheduled_for: new Date(Date.now() - 1000).toISOString(),
        status: 'pending',
        template_data: {},
        metadata: {},
        created_at: new Date().toISOString(),
      },
    ];

    const result = await new EmailLifecycleService().processDueQueue({ batchSize: 1 });

    expect(result.stoppedByProvider).toBe(true);
    expect(result.stoppedByProviderCapacity).toBe(false);
    expect(result.rescheduled).toBe(1);
    expect(eventInserts).toContainEqual(
      expect.objectContaining({
        event_type: 'failed',
        metadata: expect.objectContaining({ classification: 'provider_blocked' }),
      })
    );
  });

  it('does not apply bounce suppression to transactional campaigns', async () => {
    emailLogRows = [
      {
        provider_response: { permanent_bounce: true },
        status: 'failed',
        sent_at: new Date().toISOString(),
      },
    ];
    const result = await new EmailLifecycleService().queueLifecycleEmail({
      campaignKey: 'payment-success',
      userId: 'user_123',
    });
    expect(result.queued).toBe(true);
  });

  it('queues low credit alert at threshold', async () => {
    const service = new EmailLifecycleService();

    const result = await service.queueLowCreditAlert({
      userId: 'user_123',
      creditsRemaining: 3,
    });

    expect(result.queued).toBe(true);
    expect(queueInserts[0]).toMatchObject({
      campaign_key: 'low-credits',
      status: 'pending',
    });
    expect(queueInserts[0].template_data).toMatchObject({
      creditsRemaining: 3,
      variant: 'low',
    });
  });

  it('does not queue low credit alert when opted out', async () => {
    preferences.low_credit_alerts = false;
    const service = new EmailLifecycleService();

    const result = await service.queueLowCreditAlert({
      userId: 'user_123',
      creditsRemaining: 3,
    });

    expect(result.skipped).toBe(true);
    expect(eventInserts[0]).toMatchObject({ event_type: 'suppressed_preference' });
  });

  it('queues first result follow-up after activation', async () => {
    const service = new EmailLifecycleService();

    const result = await service.queueFirstResultFollowup('user_123');

    expect(result.queued).toBe(true);
    expect(queueInserts[0]).toMatchObject({
      campaign_key: 'first-result-followup',
      status: 'pending',
    });
    expect(queueInserts[0].template_data).toMatchObject({
      headline: 'Want a sharper version of your image?',
    });
  });

  it('should queue checkout recovery with click tracking', async () => {
    sendEmailMock.mockResolvedValueOnce({
      success: true,
      messageId: 'msg_fallback',
      provider: 'brevo',
      attemptedProviders: ['cloudflare', 'brevo'],
      unavailableProviders: [],
      fallbackReasons: ['provider_unavailable'],
    });
    dueQueueRows = [
      {
        id: 'queue_recovery_1',
        campaign_key: 'checkout-abandoned-24h',
        user_id: 'user_123',
        recipient_email: 'user@example.com',
        scheduled_for: new Date(Date.now() - 1000).toISOString(),
        status: 'pending',
        reason: null,
        template_data: {
          ctaUrl: '/pricing?recovery=checkout-abandoned',
          preferenceUrl: '/dashboard/settings',
          recoveryAudience: 'checkout_abandoner',
        },
        metadata: {},
        sent_at: null,
        created_at: new Date().toISOString(),
      },
    ];
    const service = new EmailLifecycleService();

    const result = await service.processDueQueue({ batchSize: 1 });

    expect(result.sent).toBe(1);
    expect(sendEmailMock).toHaveBeenCalledWith(
      expect.objectContaining({
        template: 'checkout-recovery',
        data: expect.objectContaining({
          ctaUrl: expect.stringContaining('/api/email/click'),
          recoveryAudience: 'checkout_abandoner',
        }),
      })
    );
    expect(sendEmailMock.mock.calls[0][0].data.ctaUrl).toContain('queue_recovery_1');
    expect(sendEmailMock.mock.calls[0][0].data.ctaUrl).toContain('token=');
    expect(eventInserts).toContainEqual(
      expect.objectContaining({
        event_type: 'sent',
        metadata: expect.objectContaining({
          provider: 'brevo',
          attemptedProviders: ['cloudflare', 'brevo'],
          fallbackReasons: ['provider_unavailable'],
        }),
      })
    );
  });

  it('keeps a delivered row sent when recording its lifecycle event fails', async () => {
    lifecycleEventInsertError = { message: 'event store unavailable' };
    dueQueueRows = [
      {
        id: 'queue_delivered_event_failure',
        campaign_key: 'low-credits',
        user_id: 'user_123',
        recipient_email: 'user@example.com',
        scheduled_for: new Date(Date.now() - 1000).toISOString(),
        status: 'pending',
        template_data: {},
        metadata: {},
        created_at: new Date().toISOString(),
      },
    ];
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const result = await new EmailLifecycleService().processDueQueue({ sendLimit: 1 });

    expect(result).toMatchObject({ sent: 1, failed: 0 });
    expect(queueUpdates).toContainEqual(expect.objectContaining({ status: 'sent' }));
    expect(queueUpdates).not.toContainEqual(expect.objectContaining({ status: 'failed' }));
    expect(consoleSpy).toHaveBeenCalledWith(
      'Failed to record lifecycle email event',
      lifecycleEventInsertError
    );
  });

  it('should submit only the highest-priority row per invocation', async () => {
    const scheduledFor = new Date(Date.now() - 1000).toISOString();
    dueQueueRows = [
      ...Array.from({ length: 251 }, (_, index) => ({
        id: `queue_education_${index}`,
        campaign_key: 'blog-education-face-restore',
        user_id: 'user_123',
        recipient_email: 'user@example.com',
        scheduled_for: scheduledFor,
        status: 'pending',
        template_data: {},
        metadata: {},
        created_at: scheduledFor,
      })),
      {
        id: 'queue_revenue',
        campaign_key: 'low-credits',
        user_id: 'user_456',
        recipient_email: 'buyer@example.com',
        scheduled_for: scheduledFor,
        status: 'pending',
        template_data: {},
        metadata: {},
        created_at: scheduledFor,
      },
    ];
    const service = new EmailLifecycleService();

    await service.processDueQueue({ batchSize: 2 });

    expect(sendEmailMock).toHaveBeenCalledTimes(1);
    expect(sendEmailMock.mock.calls[0][0]).toMatchObject({
      to: 'buyer@example.com',
      template: 'low-credits',
    });
  });

  it('should fail only the rejected recipient and not stop future drains', async () => {
    const scheduledFor = new Date(Date.now() - 1000).toISOString();
    dueQueueRows = ['rejected', 'untouched'].map((id, index) => ({
      id: `queue_${id}`,
      campaign_key: 'low-credits',
      user_id: `user_${id}`,
      recipient_email: `${id}@example.com`,
      scheduled_for: scheduledFor,
      status: 'pending',
      template_data: {},
      metadata: {},
      created_at: new Date(Date.now() + index).toISOString(),
    }));
    sendEmailMock.mockRejectedValueOnce(
      new EmailProviderSendError('recipient rejected', 'invalid_recipient', false, ['brevo'], false)
    );

    const result = await new EmailLifecycleService().processDueQueue({
      scanLimit: 2,
      sendLimit: 1,
    });

    expect(sendEmailMock).toHaveBeenCalledOnce();
    expect(result).toMatchObject({ failed: 1, sent: 0, stoppedByProvider: false });
    expect(queueUpdates.filter(update => update.status === 'failed')).toHaveLength(1);
    expect(eventInserts).toContainEqual(
      expect.objectContaining({
        event_type: 'failed',
        metadata: expect.objectContaining({
          classification: 'invalid_recipient',
          error: 'hard_bounce',
        }),
      })
    );
  });

  it('should dead-letter a permanent provider request failure without leaking raw content', async () => {
    const sensitive = 'person@example.com Subject: Private payload-marker-123';
    dueQueueRows = [
      {
        id: 'queue_provider_request',
        campaign_key: 'low-credits',
        user_id: 'user_123',
        recipient_email: 'user@example.com',
        scheduled_for: new Date(Date.now() - 1000).toISOString(),
        status: 'pending',
        template_data: {},
        metadata: {},
        created_at: new Date().toISOString(),
      },
    ];
    sendEmailMock.mockRejectedValueOnce(
      new EmailProviderSendError(
        sensitive,
        'provider_request',
        false,
        ['brevo'],
        false,
        [],
        ['provider_request']
      )
    );

    const result = await new EmailLifecycleService().processDueQueue({ sendLimit: 1 });
    const recorded = JSON.stringify({
      queueUpdates,
      eventInserts,
      analytics: trackServerEventMock.mock.calls,
    });

    expect(result).toMatchObject({ rescheduled: 0, stoppedByProvider: false, failed: 1 });
    expect(queueUpdates).toContainEqual(
      expect.objectContaining({ status: 'failed', reason: 'provider_request' })
    );
    expect(recorded).not.toContain('person@example.com');
    expect(recorded).not.toContain('Private');
    expect(recorded).not.toContain('payload-marker-123');
    expect(eventInserts).toContainEqual(
      expect.objectContaining({
        metadata: expect.objectContaining({
          classification: 'provider_request',
          scope: 'provider',
        }),
      })
    );
  });

  it('should honor marketing opt out for recovery campaigns', async () => {
    preferences.marketing_emails = false;
    const service = new EmailLifecycleService();

    const result = await service.queueLifecycleEmail({
      campaignKey: 'credit-wall-dismissed-48h',
      userId: 'user_123',
      templateData: {
        ctaUrl: '/pricing?recovery=credit-wall',
        preferenceUrl: '/dashboard/settings',
        recoveryAudience: 'credit_wall_dismissed',
      },
    });

    expect(result.skipped).toBe(true);
    expect(result.reason).toBe('suppressed_preference');
    expect(queueInserts[0]).toMatchObject({
      campaign_key: 'credit-wall-dismissed-48h',
      status: 'skipped',
      reason: 'suppressed_preference',
    });
    expect(eventInserts[0]).toMatchObject({
      event_type: 'suppressed_preference',
      campaign_key: 'credit-wall-dismissed-48h',
    });
  });

  it('reschedules transient provider failures instead of permanently failing them', async () => {
    dueQueueRows = [
      {
        id: 'queue_transient',
        campaign_key: 'low-credits',
        user_id: 'user_123',
        recipient_email: 'user@example.com',
        scheduled_for: new Date(Date.now() - 1000).toISOString(),
        status: 'pending',
        template_data: {},
        metadata: {},
        created_at: new Date().toISOString(),
      },
    ];
    sendEmailMock.mockRejectedValueOnce(
      new EmailProviderSendError('provider unavailable', 'provider_error', true, ['brevo'])
    );
    const result = await new EmailLifecycleService().processDueQueue({ batchSize: 1 });
    expect(result.failed).toBe(0);
    expect(result.rescheduled).toBe(1);
    expect(result.stoppedByProvider).toBe(true);
    expect(queueUpdates).toContainEqual(
      expect.objectContaining({
        status: 'pending',
        reason: expect.stringContaining('provider_incident_provider_error'),
      })
    );
  });
});
