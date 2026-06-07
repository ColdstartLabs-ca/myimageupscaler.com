import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailLifecycleService } from '@server/services/email-lifecycle.service';
import { supabaseAdmin } from '@server/supabase/supabaseAdmin';

const queueInserts: Record<string, unknown>[] = [];
const eventInserts: Record<string, unknown>[] = [];
let preferences: Record<string, boolean> = {
  marketing_emails: true,
  product_updates: true,
  low_credit_alerts: true,
};
let recentMarketingRows: Array<{ id: string }> = [];

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
    send: vi.fn().mockResolvedValue({ success: true, messageId: 'msg_test' }),
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
        return {
          data: {
            key: state.key,
            name: 'Low credits',
            category: state.key === 'blog-education-face-restore' ? 'blog_education' : 'low_credit',
            template_name:
              state.key === 'blog-education-face-restore' ? 'blog-education' : 'low-credits',
            email_type: 'marketing',
            preference_key:
              state.key === 'blog-education-face-restore'
                ? 'marketing_emails'
                : 'low_credit_alerts',
            enabled: true,
            cooldown_days: 7,
            priority: 1,
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
        if (state.campaign_key) {
          resolve({ data: [], error: null });
          return;
        }
        resolve({ data: recentMarketingRows, error: null });
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
    expect(result.reason).toBe('suppressed_frequency_cap');
    expect(queueInserts[0]).toMatchObject({
      status: 'skipped',
      reason: 'suppressed_frequency_cap',
    });
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
});
