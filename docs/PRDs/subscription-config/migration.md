# Sub-PRD: Migration to Centralized Config

**Parent PRD:** [subscription-config-system.md](../subscription-config-system.md)
**Version:** 1.0
**Status:** Draft
**Priority:** P0 (Do First)
**Estimated Effort:** 1-2 days

---

## Overview

This document details the migration from scattered hardcoded subscription values to the new centralized configuration system. This is the **foundation** that must be completed before implementing trial periods or credits expiration.

### Goals

1. Zero breaking changes to existing functionality
2. All existing tests pass without modification
3. Single source of truth established
4. Backward-compatible exports maintained
5. Clear migration path for each file

---

## Migration Map

### Files to Create

| File                                      | Purpose               |
| ----------------------------------------- | --------------------- |
| `shared/config/subscription.types.ts`     | Type definitions      |
| `shared/config/subscription.config.ts`    | Default configuration |
| `shared/config/subscription.validator.ts` | Zod schemas           |
| `shared/config/subscription.utils.ts`     | Getter functions      |

### Files to Modify

| File                                          | Changes                             |
| --------------------------------------------- | ----------------------------------- |
| `shared/config/stripe.ts`                     | Derive values from new config       |
| `shared/constants/billing.ts`                 | Reference config for dynamic values |
| `server/services/image-generation.service.ts` | Use config for credit costs         |
| `app/api/webhooks/stripe/route.ts`            | Use config for rollover/credits     |
| `client/hooks/useLowCreditWarning.ts`         | Use config for threshold            |

---

## Step 1: Create Type Definitions

### shared/config/subscription.types.ts

```typescript
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
 */
export interface ITrialConfig {
  enabled: boolean;
  durationDays: number;
  trialCredits: number | null;
  requirePaymentMethod: boolean;
  allowMultipleTrials: boolean;
  autoConvertToPaid: boolean;
}

/**
 * Credits expiration configuration
 */
export interface ICreditsExpirationConfig {
  mode: ExpirationMode;
  windowDays?: number;
  gracePeriodDays: number;
  sendExpirationWarning: boolean;
  warningDaysBefore: number;
}

/**
 * Individual plan configuration
 */
export interface IPlanConfig {
  key: string;
  name: string;
  stripePriceId: string;
  priceInCents: number;
  currency: Currency;
  interval: BillingInterval;
  creditsPerCycle: number;
  maxRollover: number | null;
  rolloverMultiplier: number;
  trial: ITrialConfig;
  creditsExpiration: ICreditsExpirationConfig;
  features: readonly string[];
  recommended: boolean;
  description: string;
  displayOrder: number;
  enabled: boolean;
}

/**
 * Credit cost configuration
 */
export interface ICreditCostConfig {
  modes: Record<ProcessingMode, number>;
  scaleMultipliers: Record<ScaleFactor, number>;
  options: {
    customPrompt: number;
    priorityProcessing: number;
    batchPerImage: number;
  };
  minimumCost: number;
  maximumCost: number;
}

/**
 * Free user configuration
 */
export interface IFreeUserConfig {
  initialCredits: number;
  monthlyRefresh: boolean;
  monthlyCredits: number;
  maxBalance: number;
}

/**
 * Warning thresholds configuration
 */
export interface IWarningConfig {
  lowCreditThreshold: number;
  lowCreditPercentage: number;
  showToastOnDashboard: boolean;
  checkIntervalMs: number;
}

/**
 * System defaults configuration
 */
export interface IDefaultsConfig {
  defaultCurrency: Currency;
  defaultInterval: BillingInterval;
  creditsRolloverDefault: boolean;
  defaultRolloverMultiplier: number;
}

/**
 * Complete subscription configuration
 */
export interface ISubscriptionConfig {
  version: string;
  plans: IPlanConfig[];
  creditCosts: ICreditCostConfig;
  freeUser: IFreeUserConfig;
  warnings: IWarningConfig;
  defaults: IDefaultsConfig;
}
```

---

## Step 2: Create Configuration File

### shared/config/subscription.config.ts

```typescript
/**
 * Centralized Subscription Configuration
 * Single source of truth for all subscription-related settings
 *
 * IMPORTANT: This file should be the ONLY place where subscription
 * values are defined. All other files should import from here.
 */

import type { ISubscriptionConfig } from './subscription.types';

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
      priceInCents: 1900,
      currency: 'usd',
      interval: 'month',
      creditsPerCycle: 200,
      maxRollover: 1200,
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
        warningDaysBefore: 0,
      },
      features: [
        '200 credits per month',
        'Rollover unused credits',
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
      priceInCents: 4900,
      currency: 'usd',
      interval: 'month',
      creditsPerCycle: 1000,
      maxRollover: 6000,
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
        warningDaysBefore: 0,
      },
      features: [
        '1000 credits per month',
        'Rollover unused credits',
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
      priceInCents: 14900,
      currency: 'usd',
      interval: 'month',
      creditsPerCycle: 5000,
      maxRollover: 30000,
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
        warningDaysBefore: 0,
      },
      features: [
        '5000 credits per month',
        'Rollover unused credits',
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

  creditCosts: {
    modes: {
      upscale: 1,
      enhance: 2,
      both: 2,
      custom: 2,
    },
    scaleMultipliers: {
      '2x': 1.0,
      '4x': 1.0,
    },
    options: {
      customPrompt: 0,
      priorityProcessing: 1,
      batchPerImage: 0,
    },
    minimumCost: 1,
    maximumCost: 10,
  },

  freeUser: {
    initialCredits: 10,
    monthlyRefresh: false,
    monthlyCredits: 0,
    maxBalance: 10,
  },

  warnings: {
    lowCreditThreshold: 5,
    lowCreditPercentage: 0.2,
    showToastOnDashboard: true,
    checkIntervalMs: 300000, // 5 minutes
  },

  defaults: {
    defaultCurrency: 'usd',
    defaultInterval: 'month',
    creditsRolloverDefault: true,
    defaultRolloverMultiplier: 6,
  },
} as const;

/**
 * Get the complete subscription configuration
 * Use this function instead of directly accessing SUBSCRIPTION_CONFIG
 * to allow for future environment overrides
 */
export function getSubscriptionConfig(): ISubscriptionConfig {
  // Future: check for ENV overrides here
  return SUBSCRIPTION_CONFIG;
}
```

---

## Step 3: Create Utility Functions

### shared/config/subscription.utils.ts

```typescript
/**
 * Subscription Configuration Utilities
 * Helper functions to access configuration values
 */

import { getSubscriptionConfig } from './subscription.config';
import type { IPlanConfig, ISubscriptionConfig, ProcessingMode } from './subscription.types';

// ============================================
// Plan Lookup Functions
// ============================================

/**
 * Get plan configuration by Stripe price ID
 */
export function getPlanByPriceId(priceId: string): IPlanConfig | null {
  const config = getSubscriptionConfig();
  return config.plans.find(p => p.stripePriceId === priceId) ?? null;
}

/**
 * Get plan configuration by plan key (e.g., 'hobby', 'pro')
 */
export function getPlanByKey(key: string): IPlanConfig | null {
  const config = getSubscriptionConfig();
  return config.plans.find(p => p.key === key) ?? null;
}

/**
 * Get all enabled plans
 */
export function getEnabledPlans(): IPlanConfig[] {
  const config = getSubscriptionConfig();
  return config.plans.filter(p => p.enabled).sort((a, b) => a.displayOrder - b.displayOrder);
}

/**
 * Get the recommended plan
 */
export function getRecommendedPlan(): IPlanConfig | null {
  const config = getSubscriptionConfig();
  return config.plans.find(p => p.recommended && p.enabled) ?? null;
}

// ============================================
// Credit Functions
// ============================================

/**
 * Calculate credit cost for a processing operation
 * Replaces hardcoded switch statement in image-generation.service.ts
 */
export function calculateCreditCost(config: { mode: ProcessingMode; scale?: number }): number {
  const { creditCosts } = getSubscriptionConfig();

  // Base cost from mode
  let cost = creditCosts.modes[config.mode] ?? creditCosts.modes.enhance;

  // Apply scale multiplier if provided
  if (config.scale) {
    const scaleKey = `${config.scale}x` as '2x' | '4x';
    const multiplier = creditCosts.scaleMultipliers[scaleKey] ?? 1.0;
    cost = Math.ceil(cost * multiplier);
  }

  // Apply bounds
  cost = Math.max(cost, creditCosts.minimumCost);
  cost = Math.min(cost, creditCosts.maximumCost);

  return cost;
}

/**
 * Get credit cost for a specific mode
 */
export function getCreditCostForMode(mode: ProcessingMode): number {
  const { creditCosts } = getSubscriptionConfig();
  return creditCosts.modes[mode] ?? creditCosts.minimumCost;
}

/**
 * Get free user initial credits
 */
export function getFreeUserCredits(): number {
  const { freeUser } = getSubscriptionConfig();
  return freeUser.initialCredits;
}

/**
 * Get low credit warning threshold
 */
export function getLowCreditThreshold(): number {
  const { warnings } = getSubscriptionConfig();
  return warnings.lowCreditThreshold;
}

// ============================================
// Backward Compatibility Exports
// ============================================

/**
 * Build SUBSCRIPTION_PRICE_MAP from config
 * For backward compatibility with existing code
 */
export function buildSubscriptionPriceMap(): Record<
  string,
  {
    key: string;
    name: string;
    creditsPerMonth: number;
    maxRollover: number;
    features: readonly string[];
    recommended: boolean;
  }
> {
  const config = getSubscriptionConfig();
  const map: Record<string, any> = {};

  for (const plan of config.plans) {
    map[plan.stripePriceId] = {
      key: plan.key,
      name: plan.name,
      creditsPerMonth: plan.creditsPerCycle,
      maxRollover: plan.maxRollover ?? plan.creditsPerCycle * plan.rolloverMultiplier,
      features: plan.features,
      recommended: plan.recommended,
    };
  }

  return map;
}

/**
 * Build STRIPE_PRICES object from config
 * For backward compatibility with existing code
 */
export function buildStripePrices(): Record<string, string> {
  const config = getSubscriptionConfig();
  const prices: Record<string, string> = {};

  for (const plan of config.plans) {
    const key = `${plan.key.toUpperCase()}_${plan.interval.toUpperCase()}LY`;
    prices[key] = plan.stripePriceId;
  }

  return prices;
}

/**
 * Build SUBSCRIPTION_PLANS object from config
 * For backward compatibility with existing code
 */
export function buildSubscriptionPlans(): Record<
  string,
  {
    name: string;
    description: string;
    price: number;
    interval: 'month' | 'year';
    creditsPerMonth: number;
    features: readonly string[];
    recommended?: boolean;
  }
> {
  const config = getSubscriptionConfig();
  const plans: Record<string, any> = {};

  for (const plan of config.plans) {
    const key = `${plan.key.toUpperCase()}_${plan.interval.toUpperCase()}LY`;
    plans[key] = {
      name: plan.name,
      description: plan.description,
      price: plan.priceInCents / 100,
      interval: plan.interval,
      creditsPerMonth: plan.creditsPerCycle,
      features: plan.features,
      recommended: plan.recommended || undefined,
    };
  }

  return plans;
}
```

---

## Step 4: Create Validation Schema

### shared/config/subscription.validator.ts

```typescript
/**
 * Subscription Configuration Validation
 * Zod schemas for runtime validation
 */

import { z } from 'zod';

const TrialConfigSchema = z.object({
  enabled: z.boolean(),
  durationDays: z.number().min(0).max(365),
  trialCredits: z.number().positive().nullable(),
  requirePaymentMethod: z.boolean(),
  allowMultipleTrials: z.boolean(),
  autoConvertToPaid: z.boolean(),
});

const CreditsExpirationSchema = z.object({
  mode: z.enum(['never', 'end_of_cycle', 'rolling_window']),
  windowDays: z.number().positive().optional(),
  gracePeriodDays: z.number().min(0),
  sendExpirationWarning: z.boolean(),
  warningDaysBefore: z.number().min(0),
});

const PlanConfigSchema = z.object({
  key: z.string().min(1),
  name: z.string().min(1),
  stripePriceId: z.string().startsWith('price_'),
  priceInCents: z.number().positive(),
  currency: z.enum(['usd', 'eur', 'gbp']),
  interval: z.enum(['month', 'year']),
  creditsPerCycle: z.number().positive(),
  maxRollover: z.number().positive().nullable(),
  rolloverMultiplier: z.number().positive(),
  trial: TrialConfigSchema,
  creditsExpiration: CreditsExpirationSchema,
  features: z.array(z.string()),
  recommended: z.boolean(),
  description: z.string(),
  displayOrder: z.number().positive(),
  enabled: z.boolean(),
});

const CreditCostConfigSchema = z.object({
  modes: z.object({
    upscale: z.number().positive(),
    enhance: z.number().positive(),
    both: z.number().positive(),
    custom: z.number().positive(),
  }),
  scaleMultipliers: z.object({
    '2x': z.number().positive(),
    '4x': z.number().positive(),
  }),
  options: z.object({
    customPrompt: z.number().min(0),
    priorityProcessing: z.number().min(0),
    batchPerImage: z.number().min(0),
  }),
  minimumCost: z.number().positive(),
  maximumCost: z.number().positive(),
});

const FreeUserConfigSchema = z.object({
  initialCredits: z.number().min(0),
  monthlyRefresh: z.boolean(),
  monthlyCredits: z.number().min(0),
  maxBalance: z.number().positive(),
});

const WarningConfigSchema = z.object({
  lowCreditThreshold: z.number().min(0),
  lowCreditPercentage: z.number().min(0).max(1),
  showToastOnDashboard: z.boolean(),
  checkIntervalMs: z.number().positive(),
});

const DefaultsConfigSchema = z.object({
  defaultCurrency: z.enum(['usd', 'eur', 'gbp']),
  defaultInterval: z.enum(['month', 'year']),
  creditsRolloverDefault: z.boolean(),
  defaultRolloverMultiplier: z.number().positive(),
});

export const SubscriptionConfigSchema = z.object({
  version: z.string(),
  plans: z.array(PlanConfigSchema).min(1),
  creditCosts: CreditCostConfigSchema,
  freeUser: FreeUserConfigSchema,
  warnings: WarningConfigSchema,
  defaults: DefaultsConfigSchema,
});

/**
 * Validate subscription configuration at runtime
 * Call this at application startup
 */
export function validateSubscriptionConfig(config: unknown): void {
  const result = SubscriptionConfigSchema.safeParse(config);

  if (!result.success) {
    console.error('Invalid subscription configuration:');
    console.error(result.error.format());
    throw new Error('Subscription configuration validation failed');
  }

  // Additional business logic validation
  const validConfig = result.data;

  // Check for duplicate plan keys
  const keys = validConfig.plans.map(p => p.key);
  const duplicateKeys = keys.filter((k, i) => keys.indexOf(k) !== i);
  if (duplicateKeys.length > 0) {
    throw new Error(`Duplicate plan keys: ${duplicateKeys.join(', ')}`);
  }

  // Check for duplicate price IDs
  const priceIds = validConfig.plans.map(p => p.stripePriceId);
  const duplicatePrices = priceIds.filter((p, i) => priceIds.indexOf(p) !== i);
  if (duplicatePrices.length > 0) {
    throw new Error(`Duplicate Stripe price IDs: ${duplicatePrices.join(', ')}`);
  }

  // Check minimumCost <= maximumCost
  if (validConfig.creditCosts.minimumCost > validConfig.creditCosts.maximumCost) {
    throw new Error('minimumCost cannot be greater than maximumCost');
  }

  console.log('✓ Subscription configuration validated successfully');
}
```

---

## Step 5: Update stripe.ts for Backward Compatibility

### shared/config/stripe.ts (Modified)

```typescript
/**
 * Centralized Stripe Payment Configuration
 *
 * MIGRATION NOTE: This file now derives values from subscription.config.ts
 * Existing exports are maintained for backward compatibility
 */

import { clientEnv, serverEnv } from './env';
import {
  buildStripePrices,
  buildSubscriptionPriceMap,
  buildSubscriptionPlans,
  getPlanByPriceId,
  getPlanByKey,
} from './subscription.utils';
import { getSubscriptionConfig } from './subscription.config';
import type { IPlanConfig } from './subscription.types';

// ============================================
// Backward Compatible Exports
// ============================================

/**
 * @deprecated Use getSubscriptionConfig().plans instead
 * Maintained for backward compatibility
 */
export const STRIPE_PRICES = buildStripePrices();

export type StripePriceKey = keyof typeof STRIPE_PRICES;

/**
 * @deprecated Use IPlanConfig from subscription.types instead
 */
export interface ISubscriptionPlanMetadata {
  key: string;
  name: string;
  creditsPerMonth: number;
  maxRollover: number;
  features: readonly string[];
  recommended?: boolean;
}

/**
 * @deprecated Use getPlanByPriceId() instead
 * Maintained for backward compatibility
 */
export const SUBSCRIPTION_PRICE_MAP = buildSubscriptionPriceMap();

/**
 * Get plan metadata for a given Stripe price ID
 * Now delegates to subscription.utils
 */
export function getPlanForPriceId(priceId: string): ISubscriptionPlanMetadata | null {
  const plan = getPlanByPriceId(priceId);
  if (!plan) return null;

  return {
    key: plan.key,
    name: plan.name,
    creditsPerMonth: plan.creditsPerCycle,
    maxRollover: plan.maxRollover ?? plan.creditsPerCycle * plan.rolloverMultiplier,
    features: plan.features,
    recommended: plan.recommended,
  };
}

// ... rest of existing stripe.ts exports remain unchanged
// getPlanByKey, getPlanDisplayName, SUBSCRIPTION_PLANS, HOMEPAGE_TIERS, etc.
```

---

## Step 6: Update Consumer Files

### server/services/image-generation.service.ts

```typescript
// Before
export function calculateCreditCost(config: IUpscaleConfig): number {
  switch (config.mode) {
    case 'upscale':
      return 1;
    // ...
  }
}

// After
import { calculateCreditCost } from '@shared/config/subscription.utils';
export { calculateCreditCost };
```

### client/hooks/useLowCreditWarning.ts

```typescript
// Before
const LOW_CREDIT_THRESHOLD = 5;

// After
import { getLowCreditThreshold } from '@shared/config/subscription.utils';
const LOW_CREDIT_THRESHOLD = getLowCreditThreshold();
```

---

## Testing Strategy

### Validation Test

```typescript
describe('Subscription Config Validation', () => {
  test('default config passes validation', () => {
    expect(() => {
      validateSubscriptionConfig(SUBSCRIPTION_CONFIG);
    }).not.toThrow();
  });

  test('rejects invalid price ID', () => {
    const invalid = {
      ...SUBSCRIPTION_CONFIG,
      plans: [{ ...SUBSCRIPTION_CONFIG.plans[0], stripePriceId: 'invalid' }],
    };
    expect(() => validateSubscriptionConfig(invalid)).toThrow();
  });
});
```

### Backward Compatibility Test

```typescript
describe('Backward Compatibility', () => {
  test('STRIPE_PRICES contains all plan price IDs', () => {
    expect(STRIPE_PRICES.HOBBY_MONTHLY).toBe('price_1SZmVyALMLhQocpf0H7n5ls8');
    expect(STRIPE_PRICES.PRO_MONTHLY).toBe('price_1SZmVzALMLhQocpfPyRX2W8D');
    expect(STRIPE_PRICES.BUSINESS_MONTHLY).toBe('price_1SZmVzALMLhQocpfqPk9spg4');
  });

  test('getPlanForPriceId returns correct metadata', () => {
    const plan = getPlanForPriceId('price_1SZmVzALMLhQocpfPyRX2W8D');
    expect(plan?.key).toBe('pro');
    expect(plan?.creditsPerMonth).toBe(1000);
  });
});
```

---

## Acceptance Criteria

- [ ] All type definitions created in subscription.types.ts
- [ ] Default configuration created in subscription.config.ts
- [ ] Validation schemas created in subscription.validator.ts
- [ ] Utility functions created in subscription.utils.ts
- [ ] stripe.ts updated to use new config
- [ ] All existing tests pass without modification
- [ ] Validation runs at application startup
- [ ] No TypeScript errors in strict mode

---

## Rollback Plan

1. Remove imports from subscription.\* files
2. Restore original hardcoded values in stripe.ts
3. Restore calculateCreditCost in image-generation.service.ts
4. New config files can remain (unused)
