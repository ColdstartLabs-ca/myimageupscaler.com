import { NextRequest, NextResponse } from 'next/server';
import { getRegionTier } from '@/lib/anti-freeloader/region-classifier';
import { getPricingRegion } from '@shared/config/pricing-regions';
import { selectBanditArm } from '@/lib/pricing-bandit';
import { serverEnv } from '@shared/config/env';
import {
  PRICING_GEO_COOKIE_NAME,
  parsePricingGeoSession,
  serializePricingGeoSession,
  type IPricingGeoSession,
} from '@shared/utils/pricing-geo-session';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const country =
    req.headers.get('CF-IPCountry') ||
    req.headers.get('cf-ipcountry') ||
    (serverEnv.ENV !== 'production' ? req.headers.get('x-test-country') : null);

  if (!country) {
    return NextResponse.json({
      country: null,
      tier: 'standard',
      isPaywalled: false,
      pricingRegion: 'standard',
      discountPercent: 0,
      banditArmId: null,
    });
  }

  const cachedGeo = parsePricingGeoSession(req.cookies.get(PRICING_GEO_COOKIE_NAME)?.value);
  if (cachedGeo && cachedGeo.country === country) {
    return NextResponse.json({
      country: cachedGeo.country,
      tier: cachedGeo.tier,
      isPaywalled: cachedGeo.tier === 'paywalled',
      pricingRegion: cachedGeo.pricingRegion,
      discountPercent: cachedGeo.discountPercent,
      banditArmId: cachedGeo.banditArmId,
    });
  }

  const pricingConfig = getPricingRegion(country);
  const tier = getRegionTier(country);

  // Thompson Sampling: try to select an active bandit arm for non-standard regions.
  // Falls back to static discount when no arms exist or DB is unavailable.
  const banditResult =
    pricingConfig.region !== 'standard' ? await selectBanditArm(pricingConfig.region) : null;

  const discountPercent = banditResult?.discountPercent ?? pricingConfig.discountPercent;

  const geoSession: IPricingGeoSession = {
    country,
    tier,
    pricingRegion: pricingConfig.region,
    discountPercent,
    banditArmId: banditResult?.armId ?? null,
  };

  const response = NextResponse.json({
    ...geoSession,
    isPaywalled: tier === 'paywalled',
  });

  response.cookies.set(PRICING_GEO_COOKIE_NAME, serializePricingGeoSession(geoSession), {
    httpOnly: true,
    path: '/',
    sameSite: 'lax',
    secure: serverEnv.ENV === 'production',
  });

  return response;
}
