import type { PricingRegion } from '@shared/config/pricing-regions';

export type TPricingGeoTier = 'standard' | 'restricted' | 'paywalled';

export interface IPricingGeoSession {
  country: string | null;
  tier: TPricingGeoTier;
  pricingRegion: PricingRegion;
  discountPercent: number;
  banditArmId: number | null;
}

export const PRICING_GEO_SESSION_KEY = 'pricing_geo_v1';
export const PRICING_GEO_COOKIE_NAME = PRICING_GEO_SESSION_KEY;

const VALID_TIERS = new Set<TPricingGeoTier>(['standard', 'restricted', 'paywalled']);
const VALID_PRICING_REGIONS = new Set<PricingRegion>([
  'standard',
  'south_asia',
  'southeast_asia',
  'latam',
  'eastern_europe',
  'africa',
]);

export function parsePricingGeoSession(
  value: string | null | undefined
): IPricingGeoSession | null {
  if (!value) return null;

  try {
    const parsed = JSON.parse(value) as Partial<IPricingGeoSession>;
    const tier = parsed.tier as TPricingGeoTier | undefined;
    const pricingRegion = parsed.pricingRegion as PricingRegion | undefined;

    if (
      !tier ||
      !pricingRegion ||
      !VALID_TIERS.has(tier) ||
      !VALID_PRICING_REGIONS.has(pricingRegion) ||
      typeof parsed.discountPercent !== 'number' ||
      !Number.isFinite(parsed.discountPercent)
    ) {
      return null;
    }

    if (
      parsed.banditArmId !== null &&
      parsed.banditArmId !== undefined &&
      (!Number.isInteger(parsed.banditArmId) || parsed.banditArmId <= 0)
    ) {
      return null;
    }

    if (
      parsed.country !== null &&
      parsed.country !== undefined &&
      typeof parsed.country !== 'string'
    ) {
      return null;
    }

    return {
      country: parsed.country ?? null,
      tier,
      pricingRegion,
      discountPercent: parsed.discountPercent,
      banditArmId: parsed.banditArmId ?? null,
    };
  } catch {
    return null;
  }
}

export function serializePricingGeoSession(value: IPricingGeoSession): string {
  return JSON.stringify(value);
}
