/**
 * Centralized Subscription Configuration
 * Single source of truth for all subscription-related settings
 *
 * IMPORTANT: This file should be the ONLY place where subscription
 * values are defined. All other files should import from here.
 */

import type { ISubscriptionConfig } from './subscription.types';
import { clientEnv } from './env';

/**
 * Default subscription configuration
 * Modify this to change subscription behavior
 */
export const SUBSCRIPTION_CONFIG: ISubscriptionConfig = {
  version: '1.0.0',

  plans: [
    {
      key: 'hobby',
      name: 'Hobby',
      stripePriceId: 'price_1SZmVyALMLhQocpf0H7n5ls8',
      priceInCents: 1900, // $19.00
      currency: 'usd',
      interval: 'month',
      creditsPerCycle: 200,
      maxRollover: null, // No rollover - credits reset each cycle
      rolloverMultiplier: 6,
      // TODO: Trial periods not yet implemented - see docs/PRDs/subscription-config/trial-periods.md
      trial: {
        enabled: false,
        durationDays: 0,
        trialCredits: null,
        requirePaymentMethod: true,
        allowMultipleTrials: false,
        autoConvertToPaid: true,
      },
      creditsExpiration: {
        mode: 'end_of_cycle', // Credits reset at billing cycle end
        gracePeriodDays: 0,
        sendExpirationWarning: true,
        warningDaysBefore: 7,
      },
      features: [
        '200 credits per month',
        'Credits reset monthly',
        'Email support',
        'All features included',
      ],
      recommended: false,
      description: 'For personal projects',
      displayOrder: 1,
      enabled: true,
    },
    {
      key: 'pro',
      name: 'Professional',
      stripePriceId: 'price_1SZmVzALMLhQocpfPyRX2W8D',
      priceInCents: 4900, // $49.00
      currency: 'usd',
      interval: 'month',
      creditsPerCycle: 1000,
      maxRollover: null, // No rollover - credits reset each cycle
      rolloverMultiplier: 6,
      // TODO: Trial periods not yet implemented - see docs/PRDs/subscription-config/trial-periods.md
      trial: {
        enabled: false,
        durationDays: 0,
        trialCredits: null,
        requirePaymentMethod: true,
        allowMultipleTrials: false,
        autoConvertToPaid: true,
      },
      creditsExpiration: {
        mode: 'end_of_cycle', // Credits reset at billing cycle end
        gracePeriodDays: 0,
        sendExpirationWarning: true,
        warningDaysBefore: 7,
      },
      features: [
        '1000 credits per month',
        'Credits reset monthly',
        'Priority support',
        'All features included',
        'Early access to new features',
      ],
      recommended: true,
      description: 'For professionals',
      displayOrder: 2,
      enabled: true,
    },
    {
      key: 'business',
      name: 'Business',
      stripePriceId: 'price_1SZmVzALMLhQocpfqPk9spg4',
      priceInCents: 14900, // $149.00
      currency: 'usd',
      interval: 'month',
      creditsPerCycle: 5000,
      maxRollover: null, // No rollover - credits reset each cycle
      rolloverMultiplier: 6,
      // TODO: Trial periods not yet implemented - see docs/PRDs/subscription-config/trial-periods.md
      trial: {
        enabled: false,
        durationDays: 0,
        trialCredits: null,
        requirePaymentMethod: true,
        allowMultipleTrials: false,
        autoConvertToPaid: true,
      },
      creditsExpiration: {
        mode: 'end_of_cycle', // Credits reset at billing cycle end
        gracePeriodDays: 0,
        sendExpirationWarning: true,
        warningDaysBefore: 7,
      },
      features: [
        '5000 credits per month',
        'Credits reset monthly',
        '24/7 priority support',
        'All features included',
        'Dedicated account manager',
        'Custom integrations',
      ],
      recommended: false,
      description: 'For teams and agencies',
      displayOrder: 3,
      enabled: true,
    },
  ],

  creditPacks: [
    {
      key: 'small',
      name: 'Small Pack',
      credits: 50,
      priceInCents: 499, // $4.99
      currency: 'usd',
      stripePriceId: clientEnv.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_SMALL || 'price_credits_small',
      description: '50 credits',
      popular: false,
      enabled: true,
    },
    {
      key: 'medium',
      name: 'Medium Pack',
      credits: 200,
      priceInCents: 1499, // $14.99
      currency: 'usd',
      stripePriceId: clientEnv.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_MEDIUM || 'price_credits_medium',
      description: '200 credits - Best value',
      popular: true,
      enabled: true,
    },
    {
      key: 'large',
      name: 'Large Pack',
      credits: 600,
      priceInCents: 3999, // $39.99
      currency: 'usd',
      stripePriceId: clientEnv.NEXT_PUBLIC_STRIPE_PRICE_CREDITS_LARGE || 'price_credits_large',
      description: '600 credits',
      popular: false,
      enabled: true,
    },
  ],

  creditCosts: {
    modes: {
      upscale: 1, // Basic upscaling - cheapest operation
      enhance: 2, // AI enhancement - more compute intensive
      both: 2, // Upscale + enhance - same as enhance alone
      custom: 2, // Custom prompt - AI-intensive
    },
    scaleMultipliers: {
      '2x': 1.0, // No extra cost for 2x scaling
      '4x': 1.0, // Currently same as 2x (could be changed later)
    },
    options: {
      customPrompt: 0, // Included in 'custom' mode cost
      priorityProcessing: 1, // Future feature
      batchPerImage: 0, // No extra cost per batch image
    },
    minimumCost: 1, // At least 1 credit per operation
    maximumCost: 10, // Safety cap
  },

  freeUser: {
    initialCredits: 10, // One-time credits on signup
    monthlyRefresh: false, // Free users don't get monthly refresh
    monthlyCredits: 0, // Only for paid subscriptions
    maxBalance: 10, // Free users capped at initial credits
  },

  warnings: {
    lowCreditThreshold: 5, // Warn when balance falls below this
    lowCreditPercentage: 0.2, // Also warn at 20% of monthly allowance
    showToastOnDashboard: true, // Show toast notification
    checkIntervalMs: 300000, // Check every 5 minutes
  },

  defaults: {
    defaultCurrency: 'usd',
    defaultInterval: 'month',
    creditsRolloverDefault: true, // Credits roll over by default
    defaultRolloverMultiplier: 6, // Default to 6× monthly credits
  },
} as const;

/**
 * Get the complete subscription configuration
 * Use this function instead of directly accessing SUBSCRIPTION_CONFIG
 * to allow for future environment overrides
 */
export function getSubscriptionConfig(): ISubscriptionConfig {
  // TODO: Future enhancement - check for environment variable overrides
  // if (process.env.SUBSCRIPTION_CONFIG_OVERRIDE) {
  //   return JSON.parse(process.env.SUBSCRIPTION_CONFIG_OVERRIDE);
  // }
  return SUBSCRIPTION_CONFIG;
}

/**
 * Get trial configuration for a specific price ID
 * Returns null if trial is not enabled for the plan
 */
export function getTrialConfig(priceId: string): ISubscriptionConfig['plans'][0]['trial'] | null {
  const plan = getSubscriptionConfig().plans.find(p => p.stripePriceId === priceId);
  return plan?.trial?.enabled ? plan.trial : null;
}

/**
 * Get plan configuration by price ID
 */
export function getPlanConfig(priceId: string): ISubscriptionConfig['plans'][0] | null {
  return getSubscriptionConfig().plans.find(p => p.stripePriceId === priceId) || null;
}

/**
 * Check if a plan has trial enabled
 */
export function isTrialEnabled(priceId: string): boolean {
  const config = getTrialConfig(priceId);
  return config ? config.enabled : false;
}
