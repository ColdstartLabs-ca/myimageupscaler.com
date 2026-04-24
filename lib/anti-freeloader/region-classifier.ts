// Re-export pricing region utilities for colocation with geo classification
export { getPricingRegion, getDiscountPercent } from '@shared/config/pricing-regions';
export type { PricingRegion, IPricingRegionConfig } from '@shared/config/pricing-regions';
import { CREDIT_COSTS } from '@shared/config/credits.config';

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
 * Countries in this set have demonstrated ZERO conversion intent despite
 * varying discount levels (20%-80%) in the multi-armed bandit pricing test.
 *
 * Based on conversion data from Apr 9-23, 2026:
 * - South Asia excluding IN: zero/near-zero conversions; IN stays restricted due to observed conversion
 * - Southeast Asia: 0 conversions across all discount levels
 * - Africa: 0 conversions across all discount levels
 *
 * Add country codes here based on abuse data — do not guess.
 * Example: PAYWALLED_COUNTRIES.add('XX') to paywall country XX.
 */
const PAYWALLED_COUNTRIES = new Set<string>([
  // Southeast Asia - ZERO conversions (PRD data)
  'PH', // Philippines
  'VN', // Vietnam
  'ID', // Indonesia
  'TH', // Thailand
  'MY', // Malaysia
  'MM', // Myanmar
  'KH', // Cambodia
  'LA', // Laos
  'TL', // East Timor

  // South Asia - 1 conversion total across 7M+ impressions (PRD data)
  'PK', // Pakistan
  'BD', // Bangladesh
  'LK', // Sri Lanka
  'NP', // Nepal
  'AF', // Afghanistan
  'BT', // Bhutan
  'MV', // Maldives

  // Africa - ZERO conversions (PRD data)
  'NG', // Nigeria
  'KE', // Kenya
  'ZA', // South Africa
  'GH', // Ghana
  'ET', // Ethiopia
  'EG', // Egypt
  'TZ', // Tanzania
  'CD', // DR Congo
  'UG', // Uganda
  'ZW', // Zimbabwe
  'CI', // Ivory Coast
  'SN', // Senegal
  'ML', // Mali
  'BF', // Burkina Faso
  'NE', // Niger
  'TD', // Chad
  'GN', // Guinea
  'SL', // Sierra Leone
  'LR', // Liberia
  'TG', // Togo
  'BJ', // Benin
  'MR', // Mauritania
  'GM', // Gambia
  'GW', // Guinea-Bissau
  'CV', // Cape Verde
  'ST', // Sao Tome and Principe
  'CM', // Cameroon
  'CF', // Central African Republic
  'CG', // Republic of Congo
  'GA', // Gabon
  'GQ', // Equatorial Guinea
  'AO', // Angola
  'MZ', // Mozambique
  'MG', // Madagascar
  'DJ', // Djibouti
  'ER', // Eritrea
  'SO', // Somalia
  'SS', // South Sudan
  'KM', // Comoros
  'BW', // Botswana
  'NA', // Namibia
  'LS', // Lesotho
  'SZ', // Eswatini
  'MW', // Malawi
  'ZM', // Zambia
  'RW', // Rwanda
  'BI', // Burundi
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

/**
 * Free credits shown on landing page and granted at signup, based on region tier
 * Note: This must match what the database trigger grants in handle_new_user()
 */
export function getFreeCreditsForTier(tier: RegionTier): number {
  if (tier === 'paywalled') return CREDIT_COSTS.PAYWALLED_FREE_CREDITS;
  if (tier === 'restricted') return CREDIT_COSTS.RESTRICTED_FREE_CREDITS;
  return CREDIT_COSTS.DEFAULT_FREE_CREDITS;
}
