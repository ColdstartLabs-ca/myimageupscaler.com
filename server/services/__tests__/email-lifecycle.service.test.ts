import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailLifecycleService } from '@server/services/email-lifecycle.service';

const queueInserts: Record<string, unknown>[] = [];
const eventInserts: Record<string, unknown>[] = [];
const { sendEmailMock } = vi.hoisted(() => ({
  sendEmailMock: vi.fn(),
}));
let preferences: Record<string, boolean> = {
  marketing_emails: true,
  product_updates: true,
  low_credit_alerts: true,
};
let recentMarketingRows: Array<{ id: string }> = [];
let dueQueueRows: Array<Record<string, unknown>> = [];
let emailLogRows: Array<Record<string, unknown>> = [];

vi.mock('@shared/config/env', () => ({
  serverEnv: {
    AMPLITUDE_API_KEY: 'test-key',
    BASE_URL: 'http://localhost:3000',
    CRON_SECRET: 'test-secret',
  },
}));

vi.mock('@server/analytics', () => ({
  trackServerEvent: vi.fn().mockResolvedValue(true),
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
    neq: vi.fn(() => chain),
    in: vi.fn(() => chain),
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
            email_type: 'marketing',
            preference_key:
              isRecovery || state.key === 'blog-education-face-restore'
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
        if (state.campaign_key) {
          resolve({ data: [], error: null });
          return;
        }
        resolve({ data: recentMarketingRows, error: null });
        return;
      }
      if (table === 'email_logs') {
        resolve({ data: emailLogRows, error: null });
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
    rpc: vi.fn(async (_name: string, args: { p_limit: number }) => ({
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
          };
        })
        .sort((a, b) => {
          const rank = { revenue_critical: 1, education: 3 } as const;
          return rank[a.campaign_priority] - rank[b.campaign_priority];
        })
        .slice(0, args.p_limit),
      error: null,
    })),
    from: vi.fn((table: string) => ({
      select: vi.fn((columns?: string) => makeSelectChain(table, columns)),
      insert: vi.fn((payload: Record<string, unknown>) => {
        if (table === 'email_lifecycle_queue') queueInserts.push(payload);
        if (table === 'email_lifecycle_events') eventInserts.push(payload);
        return {
          select: vi.fn(() => ({
            single: vi
              .fn()
              .mockResolvedValue({ data: { id: `queue_${queueInserts.length}` }, error: null }),
          })),
        };
      }),
      update: vi.fn(() => makeSelectChain(table)),
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
    recentMarketingRows = [{ id: 'sent_1' }];
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

  it('should always suppress complained recipient even after 90 days', async () => {
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

    expect(result).toMatchObject({ skipped: true, reason: 'suppressed_email_status' });
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
  });

  it('should process revenue-critical rows before education rows', async () => {
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

    expect(sendEmailMock).toHaveBeenCalledTimes(2);
    expect(sendEmailMock.mock.calls[0][0]).toMatchObject({
      to: 'buyer@example.com',
      template: 'low-credits',
    });
    expect(sendEmailMock.mock.calls[1][0]).toMatchObject({
      to: 'user@example.com',
      template: 'blog-education',
    });
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
});
