// Re-export pricing region utilities for colocation with geo classification
export { getPricingRegion, getDiscountPercent } from '@shared/config/pricing-regions';
export type { PricingRegion, IPricingRegionConfig } from '@shared/config/pricing-regions';

export type RegionTier = 'standard' | 'restricted' | 'paywalled';

/**
 * Countries where residents can realistically afford international SaaS pricing
 * (~$10–20/mo USD). Users from these countries are treated as standard and get the
 * full free tier. Everyone else is "restricted" (fewer free credits, Google-only auth)
 * because free-tier abuse from those regions costs money with near-zero conversion.
 *
 * Countries NOT on this list are not "worse" — they just have different price tolerance.
 * Paid users from any country are always treated as standard regardless of this list.
 */
const HIGH_PURCHASING_POWER_COUNTRIES = new Set([
  // North America
  'US',
  'CA',
  // British Isles
  'GB',
  'IE',
  // Oceania
  'AU',
  'NZ',
  // Western Europe
  'DE',
  'FR',
  'NL',
  'BE',
  'CH',
  'AT',
  'LU',
  'LI',
  'MC',
  // Northern Europe
  'SE',
  'NO',
  'DK',
  'FI',
  'IS',
  // Southern Europe
  'IT',
  'ES',
  'PT',
  'GR',
  'CY',
  'MT',
  // Eastern Europe (EU members with similar price tolerance)
  'EE',
  'LV',
  'LT',
  'SI',
  'SK',
  'CZ',
  'PL',
  'HU',
  // East Asia
  'JP',
  'SG',
  'KR',
  'HK',
  'TW',
  // Gulf / Middle East (high per-capita income)
  'AE',
  'QA',
  'KW',
  'IL',
  'SA',
  'BH',
  'OM',
]);

/**
 * Countries where ALL free-tier access is blocked. Users from these countries
 * must purchase a subscription or credit pack to use the service.
 * They can browse the site and sign up, but cannot process images for free.
 *
 * Add country codes here based on abuse data — do not guess.
 * Example: PAYWALLED_COUNTRIES.add('XX') to paywall country XX.
 */
const PAYWALLED_COUNTRIES = new Set<string>([
  'PH', // Philippines
  'VN', // Vietnam
  'BD', // Bangladesh
]);

/** Exported for test assertions only */
export { PAYWALLED_COUNTRIES };

export function getRegionTier(countryCode: string): RegionTier {
  if (!countryCode) return 'restricted';
  const upper = countryCode.toUpperCase();
  // Cloudflare may return "T1" (Tor) or "XX" (unknown) — treat as restricted
  if (PAYWALLED_COUNTRIES.has(upper)) return 'paywalled';
  return HIGH_PURCHASING_POWER_COUNTRIES.has(upper) ? 'standard' : 'restricted';
}

/** Free credits shown on landing page and granted at signup, based on region tier */
export function getFreeCreditsForTier(tier: RegionTier): number {
  if (tier === 'paywalled') return 0;
  return tier === 'restricted' ? 3 : 10;
}
