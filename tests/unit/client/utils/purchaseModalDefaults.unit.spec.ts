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
  {
    key: 'large',
    name: 'Large',
    credits: 300,
    priceInCents: 2499,
    currency: 'usd',
    stripePriceId: 'price_large',
    description: 'Large pack',
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

  test('out_of_credits selects the exact pack that covers the deficit', () => {
    const selection = getPurchaseModalInitialSelection({
      trigger: 'out_of_credits',
      outOfCredits: true,
      creditPacks,
      subscriptionPlans,
      requiredCredits: 50,
      currentBalance: 0,
      experimentArmKey: 'sufficient_pack_focus',
    });

    expect(selection.purchaseMode).toBe('credits');
    expect(selection.selectedPack?.key).toBe('small');
    expect(selection.selectedPlan).toBeNull();
    expect(selection.lockToCredits).toBe(false);
  });

  test('insufficient_credits selects the smallest pack above a between-pack deficit', () => {
    const selection = getPurchaseModalInitialSelection({
      trigger: 'insufficient_credits',
      outOfCredits: true,
      creditPacks,
      subscriptionPlans,
      requiredCredits: 80,
      currentBalance: 10,
      experimentArmKey: 'sufficient_pack_focus',
    });

    expect(selection.selectedPack?.key).toBe('medium');
  });

  test('insufficient_credits leaves selection empty when no pack covers the deficit', () => {
    const selection = getPurchaseModalInitialSelection({
      trigger: 'insufficient_credits',
      outOfCredits: true,
      creditPacks,
      subscriptionPlans,
      requiredCredits: 500,
      currentBalance: 0,
      experimentArmKey: 'sufficient_pack_focus',
    });

    expect(selection.selectedPack).toBeNull();
  });

  test('skips a sufficient pack with missing Stripe price data', () => {
    const packsWithMissingPrice = creditPacks.map(pack =>
      pack.key === 'small' ? { ...pack, stripePriceId: null } : pack
    );
    const selection = getPurchaseModalInitialSelection({
      trigger: 'insufficient_credits',
      outOfCredits: true,
      creditPacks: packsWithMissingPrice,
      subscriptionPlans,
      requiredCredits: 30,
      currentBalance: 0,
      experimentArmKey: 'direct_sufficient_pack',
    });

    expect(selection.selectedPack?.key).toBe('medium');
    expect(selection.selectedPack?.stripePriceId).toBe('price_medium');
  });

  test('returns a safe null pack when the catalog is missing', () => {
    const selection = getPurchaseModalInitialSelection({
      trigger: 'insufficient_credits',
      outOfCredits: true,
      creditPacks: [],
      subscriptionPlans,
      requiredCredits: 30,
      currentBalance: 0,
      experimentArmKey: 'sufficient_pack_focus',
    });

    expect(selection.purchaseMode).toBe('credits');
    expect(selection.selectedPack).toBeNull();
  });

  test('low-balance repeat purchase defaults to the buyer last pack while retaining all packs', () => {
    const selection = getPurchaseModalInitialSelection({
      trigger: 'out_of_credits',
      outOfCredits: true,
      creditPacks,
      subscriptionPlans,
      repeatPackKey: 'medium',
    });
    expect(selection.selectedPack?.key).toBe('medium');
    expect(creditPacks.map(pack => pack.key)).toEqual(['medium', 'small', 'large']);
  });

  test('repeat context overrides a pack-filtering bandit default', () => {
    const selection = getPurchaseModalInitialSelection({
      trigger: 'dashboard_sidebar',
      outOfCredits: false,
      creditPacks,
      subscriptionPlans,
      repeatPackKey: 'medium',
      banditConfig: { defaultType: 'credit_pack', defaultKey: 'small', visiblePacks: ['small'] },
    });
    expect(selection.selectedPack?.key).toBe('medium');
  });

  test('should default insufficient_credits to the starter credit pack', () => {
    const selection = getPurchaseModalInitialSelection({
      trigger: 'insufficient_credits',
      outOfCredits: true,
      creditPacks,
      subscriptionPlans,
      requiredCredits: 30,
      currentBalance: 0,
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

  test('starter anchor selects small pack', () => {
    const selection = getPurchaseModalInitialSelection({
      trigger: 'workspace',
      outOfCredits: false,
      creditPacks,
      subscriptionPlans,
      banditConfig: {
        defaultType: 'credit_pack',
        defaultKey: 'small',
      },
    });

    expect(selection.purchaseMode).toBe('credits');
    expect(selection.selectedPack?.key).toBe('small');
    expect(selection.selectedPlan).toBeNull();
  });
});
