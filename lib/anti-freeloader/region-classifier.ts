export type RegionTier = 'standard' | 'restricted';

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

export function getRegionTier(countryCode: string): RegionTier {
  if (!countryCode) return 'restricted';
  // Cloudflare may return "T1" (Tor) or "XX" (unknown) — treat as restricted
  return HIGH_PURCHASING_POWER_COUNTRIES.has(countryCode.toUpperCase()) ? 'standard' : 'restricted';
}
