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

  // Validate expiration configuration logic
  for (const plan of validConfig.plans) {
    const exp = plan.creditsExpiration;

    // rolling_window mode requires windowDays
    if (exp.mode === 'rolling_window' && !exp.windowDays) {
      throw new Error(`Plan ${plan.key}: rolling_window mode requires windowDays to be set`);
    }

    // windowDays only valid for rolling_window mode
    if (exp.mode !== 'rolling_window' && exp.windowDays) {
      console.warn(
        `Plan ${plan.key}: windowDays is set but mode is not rolling_window (will be ignored)`
      );
    }

    // Validate warning settings
    if (exp.sendExpirationWarning && exp.warningDaysBefore === 0) {
      console.warn(`Plan ${plan.key}: sendExpirationWarning is true but warningDaysBefore is 0`);
    }

    // Validate maxRollover makes sense with expiration mode
    if (exp.mode !== 'never' && plan.maxRollover !== null) {
      console.warn(
        `Plan ${plan.key}: maxRollover is set but credits will expire (mode=${exp.mode}). Consider setting maxRollover to null.`
      );
    }
  }

  console.log('✓ Subscription configuration validated successfully');
}
