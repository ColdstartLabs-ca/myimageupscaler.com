import { Metadata } from 'next';
import { Suspense } from 'react';
import { cookies, headers } from 'next/headers';
import PricingPageClient from './PricingPageClient';
import { generatePricingSchema } from '@lib/seo/schema-generator';
import { clientEnv, serverEnv } from '@shared/config/env';
import { getCanonicalUrl } from '@/lib/seo/hreflang-generator';
import { SUBSCRIPTION_PLANS } from '@shared/config/stripe';
import { getPricingRegion } from '@shared/config/pricing-regions';
import { PRICING_GEO_COOKIE_NAME, parsePricingGeoSession } from '@shared/utils/pricing-geo-session';
import { getRegionTier } from '@/lib/anti-freeloader/region-classifier';
import type { Locale } from '@/i18n/config';

const LOWEST_PLAN_PRICE = SUBSCRIPTION_PLANS.STARTER_MONTHLY.price;
const OG_IMAGE = `${clientEnv.BASE_URL}/og-image-pricing.png`;

interface IPageProps {
  params: Promise<{ locale: Locale }>;
}

export async function generateMetadata({ params }: IPageProps): Promise<Metadata> {
  const { locale } = await params;
  const canonicalUrl = getCanonicalUrl('/pricing', locale);

  const title = `AI Image Upscaler Pricing — Plans from $${LOWEST_PLAN_PRICE}/month`;
  const description = `Plans from $${LOWEST_PLAN_PRICE}/month. Upscale images up to 8x resolution with AI. Start free — no credit card required. Cancel anytime.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      url: canonicalUrl,
      type: 'website',
      images: [
        { url: OG_IMAGE, width: 1200, height: 630, alt: 'Pricing plans for AI image upscaler' },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [OG_IMAGE],
    },
    alternates: { canonical: canonicalUrl },
  };
}

export default async function PricingPage() {
  const headersList = await headers();
  const cookieStore = await cookies();
  const country =
    headersList.get('CF-IPCountry') ??
    headersList.get('cf-ipcountry') ??
    (serverEnv.ENV !== 'production' ? headersList.get('x-test-country') : null);
  const regionConfig = getPricingRegion(country ?? '');
  const cachedGeo = parsePricingGeoSession(cookieStore.get(PRICING_GEO_COOKIE_NAME)?.value);
  const initialGeo =
    cachedGeo?.country === (country ?? null)
      ? cachedGeo
      : {
          country: country ?? null,
          tier: country ? getRegionTier(country) : 'standard',
          pricingRegion: regionConfig.region,
          discountPercent: regionConfig.discountPercent,
          banditArmId: null,
        };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(generatePricingSchema()),
        }}
      />
      <Suspense>
        <PricingPageClient initialGeo={initialGeo} />
      </Suspense>
    </>
  );
}
