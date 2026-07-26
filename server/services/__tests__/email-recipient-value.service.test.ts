import { describe, expect, it } from 'vitest';
import {
  classifyRecipient,
  type IRecipientValueInput,
} from '@server/services/email-recipient-value.service';

const NOW = new Date('2026-07-11T00:00:00.000Z');

function makeInput(overrides: Partial<IRecipientValueInput> = {}): IRecipientValueInput {
  return {
    emailType: 'marketing',
    campaignKey: 'blog-education-face-restore',
    campaignPriority: 'education',
    country: 'GB',
    createdAt: '2026-07-10T00:00:00.000Z',
    scheduledFor: '2026-07-10T00:00:00.000Z',
    now: NOW,
    ...overrides,
  };
}

describe('classifyRecipient policy v1', () => {
  it('should protect transactional email regardless of score', () => {
    const result = classifyRecipient(
      makeInput({
        emailType: 'transactional',
        campaignPriority: 'revenue_critical',
        priorPackPurchase: false,
        country: 'PH',
        scheduledFor: '2026-01-01T00:00:00.000Z',
      })
    );

    expect(result.decision).toBe('protected');
    expect(result.band).toBe('protected');
  });

  it('should keep former buyer from Philippines as high value', () => {
    const result = classifyRecipient(
      makeInput({
        campaignKey: 'winback-never-uploaded-14d',
        priorPackPurchase: true,
        country: 'ph',
        scheduledFor: '2026-03-01T00:00:00.000Z',
      })
    );

    expect(result.decision).toBe('keep_high');
    expect(result.reasons).toContain('override_former_buyer');
    expect(result.reasons).toContain('country_ph');
  });

  it('should cancel stale never-uploaded recipient from Philippines', () => {
    const result = classifyRecipient(
      makeInput({
        campaignKey: 'winback-never-uploaded-14d',
        country: 'PH',
        scheduledFor: '2026-01-01T00:00:00.000Z',
      })
    );

    expect(result.score).toBeLessThan(10);
    expect(result.decision).toBe('cancel');
    expect(result.reasons).toContain('stale_never_uploaded_over_30d');
  });

  it('should hold low-intent Indian recipient', () => {
    const result = classifyRecipient(
      makeInput({
        campaignKey: 'first-result-followup',
        campaignPriority: 'lifecycle',
        country: 'IN',
        emailEngagedWithin90Days: true,
      })
    );

    expect(result.decision).toBe('hold_experiment');
    expect(result.band).toBe('experiment');
  });

  it('should preserve the score-band hold until outcome evidence supports a new policy', () => {
    const result = classifyRecipient(
      makeInput({
        campaignKey: 'first-result-followup',
        campaignPriority: 'lifecycle',
        country: 'DE',
      })
    );

    expect(result.score).toBeGreaterThanOrEqual(10);
    expect(result.score).toBeLessThan(40);
    expect(result.decision).toBe('hold_experiment');
    expect(result.policyVersion).toBe('v1');
  });

  it('should keep recent US checkout abandoner as high value', () => {
    const result = classifyRecipient(
      makeInput({
        campaignKey: 'checkout-abandoned-24h',
        campaignPriority: 'revenue_critical',
        country: 'US',
        recentIntents: [
          {
            audienceKey: 'checkout_abandoner',
            status: 'active',
            lastSeenAt: '2026-07-10T12:00:00.000Z',
          },
        ],
      })
    );

    expect(result.decision).toBe('keep_high');
    expect(result.reasons).toContain('checkout_intent_14d');
    expect(result.reasons).toContain('override_checkout_intent');
  });

  it('should treat missing country as unknown', () => {
    const result = classifyRecipient(makeInput({ country: null }));

    expect(result.normalizedCountry).toBe('UNKNOWN');
    expect(result.reasons).toContain('country_unknown');
    expect(result.reasons).not.toContain('country_ph');
    expect(result.reasons).not.toContain('discounted_region');
  });

  it('should not double count purchase history', () => {
    const result = classifyRecipient(
      makeInput({
        priorPackPurchase: true,
        priorSubscriptionTransaction: true,
        country: 'US',
      })
    );

    expect(result.score).toBe(115);
    expect(result.reasons).toContain('prior_pack_buyer');
    expect(result.reasons).not.toContain('prior_subscription_transaction');
  });

  it('should return identical output for identical input', () => {
    const input = makeInput({
      recentIntents: [
        {
          audienceKey: 'upgrade_click_no_purchase',
          status: 'queued',
          lastSeenAt: '2026-07-09T00:00:00.000Z',
        },
      ],
      creditsConsumed: 4,
      emailEngagedWithin90Days: true,
    });

    expect(classifyRecipient(input)).toEqual(classifyRecipient(input));
  });

  it('should choose only the highest customer-history score', () => {
    const result = classifyRecipient(
      makeInput({
        subscriptionStatus: 'active',
        priorPackPurchase: true,
        priorSubscriptionTransaction: true,
      })
    );

    expect(result.score).toBe(130);
    expect(result.reasons).toContain('active_subscription');
    expect(result.reasons).not.toContain('prior_pack_buyer');
    expect(result.reasons).not.toContain('prior_subscription_transaction');
  });

  it('should choose only the highest recent purchase intent score', () => {
    const result = classifyRecipient(
      makeInput({
        recentIntents: [
          {
            audienceKey: 'checkout_abandoner',
            status: 'active',
            lastSeenAt: '2026-07-10T00:00:00.000Z',
          },
          {
            audienceKey: 'upgrade_click_no_purchase',
            status: 'active',
            lastSeenAt: '2026-07-10T00:00:00.000Z',
          },
        ],
      })
    );

    expect(result.score).toBe(90);
    expect(result.reasons).toContain('checkout_intent_14d');
    expect(result.reasons).not.toContain('upgrade_intent_14d');
  });

  it('should cap unprotected Philippines recipients at holdout', () => {
    const result = classifyRecipient(
      makeInput({
        country: 'PH',
        campaignPriority: 'revenue_critical',
        emailEngagedWithin90Days: true,
        creditsConsumed: 9,
      })
    );

    expect(result.decision).toBe('hold_experiment');
    expect(result.reasons).toContain('country_ph_hold_cap');
  });

  it('should allow ten lifetime credits to protect an Indian recipient from the country cap', () => {
    const result = classifyRecipient(
      makeInput({
        country: 'IN',
        campaignPriority: 'revenue_critical',
        emailEngagedWithin90Days: true,
        creditsConsumed: 10,
      })
    );

    expect(result.decision).toBe('keep_high');
    expect(result.reasons).toContain('usage_10_plus_credits');
    expect(result.reasons).not.toContain('country_in_hold_cap');
  });

  it('should protect active and former subscribers', () => {
    expect(classifyRecipient(makeInput({ subscriptionStatus: 'active' })).decision).toBe(
      'keep_high'
    );
    expect(
      classifyRecipient(makeInput({ subscriptionStatus: 'canceled', country: 'PH' })).decision
    ).toBe('keep_high');
  });

  it('should use stable stale and freshness reason codes', () => {
    const stale = classifyRecipient(makeInput({ scheduledFor: '2026-06-01T00:00:00.000Z' }));
    const fresh = classifyRecipient(makeInput({ scheduledFor: '2026-07-10T00:00:00.000Z' }));

    expect(stale.reasons).toContain('stale_31_to_60d');
    expect(fresh.reasons).toContain('fresh_0_to_7d');
  });

  it('should protect suppressed and concurrently claimed rows from pruning', () => {
    expect(
      classifyRecipient(makeInput({ suppressedReason: 'suppressed_preference' })).decision
    ).toBe('protected');
    expect(classifyRecipient(makeInput({ concurrentClaim: true })).decision).toBe('protected');
  });
});
