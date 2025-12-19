/**
 * Centralized Subscription Configuration
 * Single source of truth for all subscription-related settings
 *
 * IMPORTANT: This file should be the ONLY place where subscription
 * configuration values are defined. All other files should import from here.
 */

import type { ISubscriptionConfig } from './subscription.types';
import { CREDIT_COSTS } from './credits.config';
import { TIMEOUTS } from './timeouts.config';

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
      creditsPerCycle: CREDIT_COSTS.HOBBY_MONTHLY_CREDITS,
      maxRollover: null, // No rollover - credits reset each cycle
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
        'Batch upload up to 10 images',
      ],
      recommended: false,
      description: 'For personal projects',
      displayOrder: 1,
      enabled: true,
      batchLimit: 10, // Up to 10 images in batch
    },
    {
      key: 'pro',
      name: 'Professional',
      stripePriceId: 'price_1SZmVzALMLhQocpfPyRX2W8D',
      priceInCents: 4900, // $49.00
      currency: 'usd',
      interval: 'month',
      creditsPerCycle: CREDIT_COSTS.PRO_MONTHLY_CREDITS,
      maxRollover: null, // No rollover - credits reset each cycle
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
        'Batch upload up to 50 images',
      ],
      recommended: true,
      description: 'For professionals',
      displayOrder: 2,
      enabled: true,
      batchLimit: 50, // Up to 50 images in batch
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
        'Batch upload up to 500 images',
      ],
      recommended: false,
      description: 'For teams and agencies',
      displayOrder: 3,
      enabled: true,
      batchLimit: 500, // Up to 500 images in batch
    },
  ],

  creditPacks: [
    {
      key: 'small',
      name: 'Small Pack',
      credits: CREDIT_COSTS.SMALL_PACK_CREDITS,
      priceInCents: 499, // $4.99
      currency: 'usd',
      stripePriceId: 'price_1SbAASALMLhQocpfGUg3wLXM',
      description: '50 credits',
      popular: false,
      enabled: true,
    },
    {
      key: 'medium',
      name: 'Medium Pack',
      credits: CREDIT_COSTS.MEDIUM_PACK_CREDITS,
      priceInCents: 1499, // $14.99
      currency: 'usd',
      stripePriceId: 'price_1SbAASALMLhQocpf7nw3wRj7',
      description: '200 credits - Best value',
      popular: true,
      enabled: true,
    },
    {
      key: 'large',
      name: 'Large Pack',
      credits: CREDIT_COSTS.LARGE_PACK_CREDITS,
      priceInCents: 3999, // $39.99
      currency: 'usd',
      stripePriceId: 'price_1SbAASALMLhQocpfCrD7P7TW',
      description: '600 credits',
      popular: false,
      enabled: true,
    },
  ],

  creditCosts: {
    modes: {
      upscale: CREDIT_COSTS.BASE_UPSCALE_COST, // Basic upscaling - cheapest operation
      enhance: CREDIT_COSTS.BASE_ENHANCE_COST, // AI enhancement - more compute intensive
      both: CREDIT_COSTS.BASE_BOTH_COST, // Upscale + enhance - same as enhance alone
      custom: CREDIT_COSTS.BASE_CUSTOM_COST, // Custom prompt - AI-intensive
    },
    // Model-based multipliers for different AI models
    modelMultipliers: {
      'real-esrgan': CREDIT_COSTS.REAL_ESRGAN_MULTIPLIER,
      gfpgan: CREDIT_COSTS.GFPGAN_MULTIPLIER,
      'clarity-upscaler': CREDIT_COSTS.CLARITY_UPSCALER_MULTIPLIER,
      'flux-2-pro': CREDIT_COSTS.FLUX_2_PRO_MULTIPLIER,
      'nano-banana-pro': CREDIT_COSTS.NANO_BANANA_PRO_MULTIPLIER,
    },
    scaleMultipliers: {
      '2x': 1.0,
      '4x': 1.0,
      '8x': 1.0,
    },
    options: {
      customPrompt: 0, // Included in 'custom' mode cost
      priorityProcessing: 1, // Future feature
      batchPerImage: 0, // No extra cost per batch image
    },
    minimumCost: CREDIT_COSTS.BASE_UPSCALE_COST, // At least 1 credit per operation
    maximumCost: CREDIT_COSTS.NANO_BANANA_PRO_MULTIPLIER * CREDIT_COSTS.BASE_ENHANCE_COST * 1.25, // Safety cap for premium models
  },

  freeUser: {
    initialCredits: CREDIT_COSTS.DEFAULT_FREE_CREDITS, // One-time credits on signup
    monthlyRefresh: false, // Free users don't get monthly refresh
    monthlyCredits: CREDIT_COSTS.DEFAULT_TRIAL_CREDITS, // Only for paid subscriptions
    maxBalance: CREDIT_COSTS.DEFAULT_FREE_CREDITS, // Free users capped at initial credits
    batchLimit: 5, // Up to 5 images per hour for free users
  },

  warnings: {
    lowCreditThreshold: CREDIT_COSTS.LOW_CREDIT_WARNING_THRESHOLD, // Warn when balance falls below this
    lowCreditPercentage: CREDIT_COSTS.CREDIT_WARNING_PERCENTAGE, // Also warn at 20% of monthly allowance
    showToastOnDashboard: true, // Show toast notification
    checkIntervalMs: TIMEOUTS.CACHE_MEDIUM_TTL, // Check every 5 minutes
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
  // Check for environment variable overrides
  // Note: This is an optional environment variable that may not be defined in the type system
  const configOverride = (process.env as unknown as { SUBSCRIPTION_CONFIG_OVERRIDE?: string })
    .SUBSCRIPTION_CONFIG_OVERRIDE;

  if (configOverride) {
    try {
      const override = JSON.parse(configOverride);
      // Merge with base config to ensure all required fields exist
      return {
        ...SUBSCRIPTION_CONFIG,
        ...override,
        // Ensure nested objects are properly merged
        plans: override.plans || SUBSCRIPTION_CONFIG.plans,
        creditPacks: override.creditPacks || SUBSCRIPTION_CONFIG.creditPacks,
        creditCosts: { ...SUBSCRIPTION_CONFIG.creditCosts, ...override.creditCosts },
        freeUser: { ...SUBSCRIPTION_CONFIG.freeUser, ...override.freeUser },
        warnings: { ...SUBSCRIPTION_CONFIG.warnings, ...override.warnings },
        defaults: { ...SUBSCRIPTION_CONFIG.defaults, ...override.defaults },
      };
    } catch (error) {
      console.error('Failed to parse SUBSCRIPTION_CONFIG_OVERRIDE:', error);
      // Fall back to default config if override is invalid
      return SUBSCRIPTION_CONFIG;
    }
  }
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
