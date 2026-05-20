import { describe, expect, test } from 'vitest';
import { getPurchaseModalInitialSelection } from '@client/utils/purchaseModalDefaults';
import type { ICreditPack, IPlanConfig } from '@shared/config/subscription.types';

const creditPacks: ICreditPack[] = [
  {
    key: 'medium',
    name: 'Medium',
    credits: 150,
    priceInCents: 1499,
    currency: 'usd',
    stripePriceId: 'price_medium',
    description: 'Medium pack',
    enabled: true,
  },
  {
    key: 'small',
    name: 'Small',
    credits: 50,
    priceInCents: 499,
    currency: 'usd',
    stripePriceId: 'price_small',
    description: 'Starter pack',
    enabled: true,
  },
];

const basePlan = {
  stripePriceId: 'price_hobby',
  priceInCents: 1900,
  currency: 'usd',
  interval: 'month',
  creditsPerCycle: 500,
  maxRollover: 3000,
  rolloverMultiplier: 6,
  trial: {
    enabled: false,
    durationDays: 0,
    trialCredits: null,
    requirePaymentMethod: true,
    allowMultipleTrials: false,
    autoConvertToPaid: true,
  },
  creditsExpiration: {
    mode: 'never',
    gracePeriodDays: 0,
    sendExpirationWarning: false,
    warningDaysBefore: 7,
  },
  features: [],
  description: '',
  displayOrder: 1,
  enabled: true,
  batchLimit: null,
  hourlyProcessingLimit: null,
} satisfies Omit<IPlanConfig, 'key' | 'name' | 'recommended'>;

const subscriptionPlans: IPlanConfig[] = [
  {
    ...basePlan,
    key: 'starter',
    name: 'Starter',
    recommended: false,
  },
  {
    ...basePlan,
    key: 'hobby',
    name: 'Hobby',
    recommended: true,
  },
];

describe('getPurchaseModalInitialSelection', () => {
  test('model_gate defaults to the small credit pack and locks to credits', () => {
    const selection = getPurchaseModalInitialSelection({
      trigger: 'model_gate',
      outOfCredits: false,
      creditPacks,
      subscriptionPlans,
    });

    expect(selection.purchaseMode).toBe('credits');
    expect(selection.selectedPack?.key).toBe('small');
    expect(selection.selectedPlan).toBeNull();
    expect(selection.lockToCredits).toBe(true);
  });

  test('out_of_credits defaults to the small credit pack', () => {
    const selection = getPurchaseModalInitialSelection({
      trigger: 'out_of_credits',
      outOfCredits: true,
      creditPacks,
      subscriptionPlans,
    });

    expect(selection.purchaseMode).toBe('credits');
    expect(selection.selectedPack?.key).toBe('small');
    expect(selection.selectedPlan).toBeNull();
    expect(selection.lockToCredits).toBe(false);
  });

  test('batch limit triggers default to the recommended subscription plan', () => {
    const selection = getPurchaseModalInitialSelection({
      trigger: 'workspace_batch_limit',
      outOfCredits: false,
      creditPacks,
      subscriptionPlans,
    });

    expect(selection.purchaseMode).toBe('subscribe');
    expect(selection.selectedPack).toBeNull();
    expect(selection.selectedPlan?.key).toBe('hobby');
    expect(selection.lockToCredits).toBe(false);
  });
});
