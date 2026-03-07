import { NextRequest, NextResponse } from 'next/server';
import { getRegionTier } from '@/lib/anti-freeloader/region-classifier';
import { getPricingRegion } from '@shared/config/pricing-regions';
import { serverEnv } from '@shared/config/env';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const country =
    req.headers.get('CF-IPCountry') ||
    req.headers.get('cf-ipcountry') ||
    (serverEnv.ENV === 'test' ? req.headers.get('x-test-country') : null);

  if (!country) {
    return NextResponse.json({
      country: null,
      tier: 'standard',
      pricingRegion: 'standard',
      discountPercent: 0,
    });
  }

  const pricingConfig = getPricingRegion(country);

  return NextResponse.json({
    country,
    tier: getRegionTier(country),
    pricingRegion: pricingConfig.region,
    discountPercent: pricingConfig.discountPercent,
  });
}
