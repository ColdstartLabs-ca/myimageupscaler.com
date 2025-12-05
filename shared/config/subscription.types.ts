/**
 * Centralized Subscription Configuration Types
 * All subscription-related configuration interfaces
 */

export type ProcessingMode = 'upscale' | 'enhance' | 'both' | 'custom';
export type ScaleFactor = '2x' | '4x';
export type Currency = 'usd' | 'eur' | 'gbp';
export type BillingInterval = 'month' | 'year';
export type ExpirationMode = 'never' | 'end_of_cycle' | 'rolling_window';

/**
 * Trial period configuration
 * TODO: Implementation planned - see docs/PRDs/subscription-config/trial-periods.md
 */
export interface ITrialConfig {
  /** Trial enabled for this plan */
  enabled: boolean;
  /** Trial duration in days (0 = disabled) */
  durationDays: number;
  /** Credits during trial (null = same as paid subscription) */
  trialCredits: number | null;
  /** Require payment method upfront */
  requirePaymentMethod: boolean;
  /** Allow multiple trials per user (false = one trial ever) */
  allowMultipleTrials: boolean;
  /** Convert to paid automatically or cancel */
  autoConvertToPaid: boolean;
}

/**
 * Credits expiration configuration
 * TODO: Implementation planned - see docs/PRDs/subscription-config/credits-expiration.md
 */
export interface ICreditsExpirationConfig {
  /** Expiration behavior: never (current default), end_of_cycle, rolling_window */
  mode: ExpirationMode;
  /** For rolling_window mode: days until credits expire */
  windowDays?: number;
  /** Grace period after cycle ends before expiration (days) */
  gracePeriodDays: number;
  /** Whether to send expiration warning email */
  sendExpirationWarning: boolean;
  /** Days before expiration to send warning */
  warningDaysBefore: number;
}

/**
 * Individual plan configuration
 */
export interface IPlanConfig {
  /** Unique plan identifier (e.g., 'hobby', 'pro', 'business') */
  key: string;
  /** Display name for UI */
  name: string;
  /** Stripe Price ID */
  stripePriceId: string;
  /** Monthly price in cents (1900 = $19.00) */
  priceInCents: number;
  /** Currency code */
  currency: Currency;
  /** Billing interval */
  interval: BillingInterval;
  /** Credits allocated per billing cycle */
  creditsPerCycle: number;
  /** Maximum rollover balance (null = unlimited, but not recommended) */
  maxRollover: number | null;
  /** Rollover multiplier (e.g., 6 = 6× monthly credits) */
  rolloverMultiplier: number;
  /** Trial configuration (TODO: see trial-periods.md) */
  trial: ITrialConfig;
  /** Credits behavior at cycle end (TODO: see credits-expiration.md) */
  creditsExpiration: ICreditsExpirationConfig;
  /** Feature list for marketing */
  features: readonly string[];
  /** Whether this plan is highlighted */
  recommended: boolean;
  /** Plan-specific description */
  description: string;
  /** Sort order for display */
  displayOrder: number;
  /** Whether plan is currently available */
  enabled: boolean;
}

/**
 * Credit cost configuration
 */
export interface ICreditCostConfig {
  /** Base costs per processing mode */
  modes: Record<ProcessingMode, number>;
  /** Multipliers for scale factors (currently all 1.0) */
  scaleMultipliers: Record<ScaleFactor, number>;
  /** Additional costs for premium options (future features) */
  options: {
    /** Extra cost for custom prompt */
    customPrompt: number;
    /** Extra cost for priority processing (future) */
    priorityProcessing: number;
    /** Extra cost for batch processing per image (future) */
    batchPerImage: number;
  };
  /** Minimum credit cost for any operation */
  minimumCost: number;
  /** Maximum credit cost for any operation (safety cap) */
  maximumCost: number;
}

/**
 * Free user configuration
 */
export interface IFreeUserConfig {
  /** Initial credits on signup */
  initialCredits: number;
  /** Whether free users get monthly refresh */
  monthlyRefresh: boolean;
  /** Credits per month if monthlyRefresh is true */
  monthlyCredits: number;
  /** Maximum balance for free users */
  maxBalance: number;
}

/**
 * Warning thresholds configuration
 */
export interface IWarningConfig {
  /** Credits threshold for low balance warning */
  lowCreditThreshold: number;
  /** Percentage of monthly credits for warning (e.g., 0.2 = 20%) */
  lowCreditPercentage: number;
  /** Whether to show warning toast on dashboard */
  showToastOnDashboard: boolean;
  /** Interval between warning checks (ms) */
  checkIntervalMs: number;
}

/**
 * System defaults configuration
 */
export interface IDefaultsConfig {
  /** Default currency for new subscriptions */
  defaultCurrency: Currency;
  /** Default billing interval */
  defaultInterval: BillingInterval;
  /** Whether credits roll over by default */
  creditsRolloverDefault: boolean;
  /** Default rollover multiplier */
  defaultRolloverMultiplier: number;
}

/**
 * Credit pack configuration for one-time purchases
 */
export interface ICreditPack {
  /** Unique identifier for the pack (e.g., 'small', 'medium', 'large') */
  key: string;
  /** Display name for UI */
  name: string;
  /** Number of credits in the pack */
  credits: number;
  /** Price in cents (e.g., 499 = $4.99) */
  priceInCents: number;
  /** Currency code */
  currency: Currency;
  /** Stripe Price ID for one-time payment */
  stripePriceId: string;
  /** Description for UI */
  description: string;
  /** Whether this pack is highlighted as "popular" or "best value" */
  popular?: boolean;
  /** Whether this pack is currently available for purchase */
  enabled: boolean;
}

/**
 * Complete subscription configuration
 * Single source of truth for all subscription settings
 */
export interface ISubscriptionConfig {
  /** Version for config migrations */
  version: string;
  /** Subscription plans configuration */
  plans: IPlanConfig[];
  /** One-time credit packs configuration */
  creditPacks: ICreditPack[];
  /** Credit cost per action */
  creditCosts: ICreditCostConfig;
  /** Free user configuration */
  freeUser: IFreeUserConfig;
  /** Warning thresholds */
  warnings: IWarningConfig;
  /** System defaults */
  defaults: IDefaultsConfig;
}
