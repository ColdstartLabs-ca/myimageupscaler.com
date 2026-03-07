/**
 * Regional Dynamic Pricing Configuration
 *
 * Maps countries to pricing regions with discount percentages.
 * Used by checkout and pricing display to show PPP-adjusted prices.
 *
 * Abuse model:
 * - CF-IPCountry is Cloudflare-edge-set, not spoofable by client
 * - VPN users get the VPN exit node's country (acceptable tradeoff)
 * - Fingerprint system already catches multi-account fraud
 * - Stripe's billing address is an additional signal but not enforced
 */

import { serverEnv } from './env';

export type PricingRegion =
  | 'standard'
  | 'south_asia'
  | 'southeast_asia'
  | 'latam'
  | 'eastern_europe'
  | 'africa';

export interface IPricingRegionConfig {
  region: PricingRegion;
  discountPercent: number;
  countries: readonly string[];
}

const PRICING_REGION_CONFIGS: readonly IPricingRegionConfig[] = [
  {
    region: 'south_asia',
    discountPercent: 65,
    countries: ['IN', 'PK', 'BD', 'LK', 'NP'],
  },
  {
    region: 'southeast_asia',
    discountPercent: 60,
    countries: ['PH', 'ID', 'VN', 'TH', 'MM', 'KH', 'LA'],
  },
  {
    region: 'latam',
    discountPercent: 50,
    countries: ['BR', 'MX', 'CO', 'AR', 'PE', 'CL', 'EC', 'VE', 'BO', 'PY', 'UY'],
  },
  {
    region: 'eastern_europe',
    discountPercent: 40,
    countries: ['UA', 'RO', 'BG', 'RS', 'HR', 'BA', 'MK', 'AL', 'MD', 'GE'],
  },
  {
    region: 'africa',
    discountPercent: 65,
    countries: ['NG', 'KE', 'ZA', 'GH', 'ET', 'TZ', 'UG', 'RW', 'SN', 'CI'],
  },
] as const;

const STANDARD_CONFIG: IPricingRegionConfig = {
  region: 'standard',
  discountPercent: 0,
  countries: [],
};

// Build a country-to-config lookup map for O(1) access
const countryToRegionMap = new Map<string, IPricingRegionConfig>();
for (const config of PRICING_REGION_CONFIGS) {
  for (const country of config.countries) {
    countryToRegionMap.set(country, config);
  }
}

/**
 * Get the pricing region config for a country code.
 * Returns standard (0% discount) for unknown/unmapped countries.
 */
export function getPricingRegion(countryCode: string): IPricingRegionConfig {
  if (!countryCode) return STANDARD_CONFIG;
  return countryToRegionMap.get(countryCode.toUpperCase()) ?? STANDARD_CONFIG;
}

/**
 * Get just the discount percentage for a country code.
 */
export function getDiscountPercent(countryCode: string): number {
  return getPricingRegion(countryCode).discountPercent;
}

/**
 * Calculate the discounted price in cents, rounded to nearest cent.
 */
export function getDiscountedPriceInCents(
  basePriceInCents: number,
  discountPercent: number
): number {
  if (discountPercent <= 0) return basePriceInCents;
  return Math.round(basePriceInCents * (1 - discountPercent / 100));
}

/**
 * Plan keys used in env var naming for regional prices
 */
const PLAN_KEY_TO_ENV_SUFFIX: Record<string, string> = {
  starter: 'STARTER',
  hobby: 'HOBBY',
  pro: 'PRO',
  business: 'BUSINESS',
};

/**
 * Region to env var suffix mapping
 */
const REGION_TO_ENV_SUFFIX: Partial<Record<PricingRegion, string>> = {
  south_asia: 'SOUTH_ASIA',
  southeast_asia: 'SOUTHEAST_ASIA',
  latam: 'LATAM',
  eastern_europe: 'EASTERN_EUROPE',
  africa: 'AFRICA',
};

/**
 * Resolve a regional Stripe Price ID for subscriptions.
 * Looks up the env var `STRIPE_PRICE_{PLAN}_{REGION}`.
 * Falls back to basePriceId if no regional price is configured.
 */
export function getRegionalPriceId(
  basePriceId: string,
  region: PricingRegion,
  planKey: string
): string {
  if (region === 'standard') return basePriceId;

  const planSuffix = PLAN_KEY_TO_ENV_SUFFIX[planKey];
  const regionSuffix = REGION_TO_ENV_SUFFIX[region];
  if (!planSuffix || !regionSuffix) return basePriceId;

  const envKey = `STRIPE_PRICE_${planSuffix}_${regionSuffix}` as keyof typeof serverEnv;
  const regionalPriceId = serverEnv[envKey] as string | undefined;

  // Graceful degradation: empty or missing env var falls back to base price
  return regionalPriceId && regionalPriceId.startsWith('price_') ? regionalPriceId : basePriceId;
}

export { PRICING_REGION_CONFIGS };
