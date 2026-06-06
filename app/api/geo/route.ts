import { NextRequest, NextResponse } from 'next/server';
import { getRegionTier } from '@/lib/anti-freeloader/region-classifier';
import { selectBanditArm } from '@/lib/pricing-bandit';
import { getPricingRegion } from '@shared/config/pricing-regions';
import { serverEnv } from '@shared/config/env';
import {
  PRICING_GEO_COOKIE_NAME,
  parsePricingGeoSession,
  serializePricingGeoSession,
  type IPricingGeoSession,
} from '@shared/utils/pricing-geo-session';

export const dynamic = 'force-dynamic';

const STANDARD_GEO_SESSION: IPricingGeoSession = {
  country: null,
  tier: 'standard',
  pricingRegion: 'standard',
  discountPercent: 0,
  banditArmId: null,
};

function geoJson(session: IPricingGeoSession): NextResponse {
  return NextResponse.json({
    ...session,
    isPaywalled: session.tier === 'paywalled',
  });
}

export async function GET(req: NextRequest) {
  try {
    const country =
      req.headers.get('CF-IPCountry') ||
      req.headers.get('cf-ipcountry') ||
      (serverEnv.ENV !== 'production' ? req.headers.get('x-test-country') : null);

    if (!country) {
      return geoJson(STANDARD_GEO_SESSION);
    }

    const cachedGeo = parsePricingGeoSession(req.cookies.get(PRICING_GEO_COOKIE_NAME)?.value);
    if (cachedGeo && cachedGeo.country === country) {
      return geoJson(cachedGeo);
    }

    const pricingConfig = getPricingRegion(country);
    const tier = getRegionTier(country);

    let banditResult = null;
    if (pricingConfig.region !== 'standard') {
      try {
        banditResult = await selectBanditArm(pricingConfig.region);
      } catch (err) {
        console.error('[GEO] Failed to select pricing bandit arm', {
          country,
          region: pricingConfig.region,
          err,
        });
      }
    }

    const discountPercent = banditResult?.discountPercent ?? pricingConfig.discountPercent;

    const geoSession: IPricingGeoSession = {
      country,
      tier,
      pricingRegion: pricingConfig.region,
      discountPercent,
      banditArmId: banditResult?.armId ?? null,
    };

    const response = geoJson(geoSession);

    response.cookies.set(PRICING_GEO_COOKIE_NAME, serializePricingGeoSession(geoSession), {
      httpOnly: true,
      path: '/',
      sameSite: 'lax',
      secure: serverEnv.ENV === 'production',
    });

    return response;
  } catch (err) {
    console.error('[GEO] Failed to resolve geo pricing; falling back to standard', { err });
    return geoJson(STANDARD_GEO_SESSION);
  }
}
