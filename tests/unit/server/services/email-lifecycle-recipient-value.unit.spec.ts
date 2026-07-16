import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EmailLifecycleService } from '@server/services/email-lifecycle.service';

const sendMock = vi.hoisted(() => vi.fn());
const healthStop = vi.hoisted(() => ({ value: false }));
const healthSince = vi.hoisted(() => [] as string[]);
const dueRows = vi.hoisted(() => [
  {
    id: 'queue-high',
    campaign_key: 'campaign-high',
    user_id: 'user-high',
    recipient_email: 'high@example.com',
    scheduled_for: '2026-07-10T00:00:00.000Z',
    created_at: '2026-07-10T00:00:00.000Z',
    status: 'pending',
    template_data: {},
    metadata: {},
    recipient_value_score: 120,
    recipient_value_band: 'high',
    recipient_value_decision: 'keep_high',
    recipient_value_policy_version: 'v1',
    campaign_name: 'High campaign',
    campaign_category: 'revenue_recovery',
    campaign_template_name: 'checkout-recovery',
    campaign_email_type: 'marketing',
    campaign_preference_key: 'marketing_emails',
    campaign_enabled: true,
    campaign_cooldown_days: 7,
    campaign_priority: 'revenue_critical',
    campaign_sort_priority: 100,
  },
  {
    id: 'queue-medium',
    campaign_key: 'campaign-medium',
    user_id: 'user-medium',
    recipient_email: 'medium@example.com',
    scheduled_for: '2026-07-10T00:00:00.000Z',
    created_at: '2026-07-10T00:00:00.000Z',
    status: 'pending',
    template_data: {},
    metadata: {},
    recipient_value_score: 50,
    recipient_value_band: 'medium',
    recipient_value_decision: 'keep_medium',
    recipient_value_policy_version: 'v1',
    campaign_name: 'Medium campaign',
    campaign_category: 'product_lifecycle',
    campaign_template_name: 'feature-reminder',
    campaign_email_type: 'marketing',
    campaign_preference_key: 'product_updates',
    campaign_enabled: true,
    campaign_cooldown_days: 7,
    campaign_priority: 'lifecycle',
    campaign_sort_priority: 70,
  },
  {
    id: 'queue-held',
    campaign_key: 'campaign-held',
    user_id: 'user-held',
    recipient_email: 'held@example.com',
    scheduled_for: '2026-07-10T00:00:00.000Z',
    created_at: '2026-07-10T00:00:00.000Z',
    status: 'pending',
    template_data: {},
    metadata: {},
    recipient_value_score: 20,
    recipient_value_band: 'experiment',
    recipient_value_decision: 'hold_experiment',
    recipient_value_policy_version: 'v1',
    campaign_name: 'Held campaign',
    campaign_category: 'blog_education',
    campaign_template_name: 'blog-education',
    campaign_email_type: 'marketing',
    campaign_preference_key: 'marketing_emails',
    campaign_enabled: true,
    campaign_cooldown_days: 14,
    campaign_priority: 'education',
    campaign_sort_priority: 40,
  },
  {
    id: 'queue-cancel',
    campaign_key: 'campaign-cancel',
    user_id: 'user-cancel',
    recipient_email: 'cancel@example.com',
    scheduled_for: '2026-07-10T00:00:00.000Z',
    created_at: '2026-07-10T00:00:00.000Z',
    status: 'pending',
    template_data: {},
    metadata: {},
    recipient_value_score: -20,
    recipient_value_band: 'cancel',
    recipient_value_decision: 'cancel',
    recipient_value_policy_version: 'v1',
    campaign_name: 'Cancelled campaign',
    campaign_category: 'blog_education',
    campaign_template_name: 'blog-education',
    campaign_email_type: 'marketing',
    campaign_preference_key: 'marketing_emails',
    campaign_enabled: true,
    campaign_cooldown_days: 14,
    campaign_priority: 'education',
    campaign_sort_priority: 40,
  },
]);

vi.mock('@shared/config/env', () => ({
  serverEnv: {
    AMPLITUDE_API_KEY: 'test-key',
    BASE_URL: 'http://localhost:3000',
    CRON_SECRET: 'test-secret',
  },
}));

vi.mock('@server/analytics', () => ({ trackServerEvent: vi.fn().mockResolvedValue(true) }));
vi.mock('@server/services/email.service', () => ({ getEmailService: () => ({ send: sendMock }) }));
vi.mock('@server/services/email-content-recommendation.service', () => ({
  getEmailContentRecommendationService: () => ({ recommendForIntent: vi.fn() }),
}));
vi.mock('@server/services/revenue-recovery.service', () => ({
  getRevenueRecoveryService: () => ({ queueEligibleRecoveryEmails: vi.fn() }),
}));
vi.mock('@server/supabase/supabaseAdmin', () => ({
  supabaseAdmin: {
    rpc: vi.fn((name: string, args?: { p_since?: string }) => {
      if (name === 'get_email_lifecycle_health') {
        if (args?.p_since) healthSince.push(args.p_since);
        return Promise.resolve({ data: [{ stop_recommended: healthStop.value }], error: null });
      }
      if (name === 'get_due_email_lifecycle_queue')
        return Promise.resolve({ data: dueRows, error: null });
      if (name === 'claim_email_lifecycle_queue_row_for_delivery')
        return Promise.resolve({ data: 'claimed', error: null });
      return Promise.resolve({ data: null, error: null });
    }),
    from: vi.fn(() => {
      const state: Record<string, unknown> = {};
      const chain: Record<string, unknown> = {};
      for (const method of ['eq', 'neq', 'in', 'gte', 'lte', 'order', 'limit']) {
        chain[method] = vi.fn((field: string, value: unknown) => {
          state[field] = value;
          return chain;
        });
      }
      chain.maybeSingle = vi.fn(async () => ({
        data: { marketing_emails: true, product_updates: true },
        error: null,
      }));
      chain.select = vi.fn(() => chain);
      chain.insert = vi.fn(() => chain);
      chain.update = vi.fn(() => chain);
      chain.then = (resolve: (value: unknown) => unknown) =>
        Promise.resolve(resolve({ data: [], error: null }));
      return chain;
    }),
  },
}));

describe('EmailLifecycleService recipient-value delivery integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    healthStop.value = false;
    healthSince.length = 0;
    sendMock.mockResolvedValue({
      skipped: false,
      provider: 'test',
      messageId: 'message-1',
      attemptedProviders: ['test'],
      unavailableProviders: [],
      fallbackReasons: [],
    });
  });

  it('should send keep_high first and leave keep_medium for a later invocation', async () => {
    const result = await new EmailLifecycleService().processDueQueue({ batchSize: 10 });

    expect(sendMock.mock.calls.map(call => call[0].to)).toEqual(['high@example.com']);
    expect(result.eligible).toBe(2);
    expect(result.sent).toBe(1);
    expect(result.recipientValueBandCounts).toEqual({
      protected: 0,
      high: 1,
      medium: 0,
      experiment: 0,
      cancel: 0,
    });
  });

  it('should exclude unclassified rollout rows from delivery', async () => {
    dueRows.splice(0, dueRows.length, {
      ...dueRows[1],
      recipient_value_band: null,
      recipient_value_decision: null,
    });

    const result = await new EmailLifecycleService().processDueQueue({
      dryRun: true,
      batchSize: 10,
    });

    expect(result.recipientValueBandCounts.medium).toBe(0);
    expect(result.eligible).toBe(0);
    expect(result.queued).toBe(0);
  });

  it('should stop non-dry-run delivery when the existing health thresholds recommend stopping', async () => {
    healthStop.value = true;

    const result = await new EmailLifecycleService().processDueQueue({ batchSize: 10 });

    expect(result.stoppedByHealth).toBe(true);
    expect(result.eligible).toBe(0);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('should evaluate a one-day recovery window so a repaired provider can resume', async () => {
    const before = Date.now();

    await new EmailLifecycleService().processDueQueue({ batchSize: 10 });

    const since = Date.parse(healthSince[0]);
    const ageHours = (before - since) / (60 * 60 * 1000);
    expect(ageHours).toBeGreaterThanOrEqual(23.99);
    expect(ageHours).toBeLessThanOrEqual(24.01);
  });
});
