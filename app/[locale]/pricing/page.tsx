import { Metadata } from 'next';
import PricingPageClient from './PricingPageClient';
import { generatePricingSchema } from '@lib/seo/schema-generator';
import { clientEnv } from '@shared/config/env';
import { getCanonicalUrl } from '@/lib/seo/hreflang-generator';
import type { Locale } from '@/i18n/config';

interface IPageProps {
  params: Promise<{ locale: Locale }>;
}

export async function generateMetadata({ params }: IPageProps): Promise<Metadata> {
  const { locale } = await params;
  const canonicalUrl = getCanonicalUrl('/pricing', locale);

  return {
    title: 'Simple, Transparent Pricing - AI Image Upscaler',
    description:
      'Choose the subscription plan that fits your needs. Get monthly credits with automatic rollover. Free tier available, plans from $9 to $149 monthly.',
    openGraph: {
      title: 'Simple, Transparent Pricing - AI Image Upscaler',
      description:
        'Choose the subscription plan that fits your needs. Get monthly credits with automatic rollover for AI image upscaling and enhancement.',
      url: canonicalUrl,
      type: 'website',
      images: [
        {
          url: `${clientEnv.BASE_URL}/og-image-pricing.png`,
          width: 1200,
          height: 630,
          alt: 'Pricing plans for AI image upscaler',
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Simple, Transparent Pricing - AI Image Upscaler',
      description:
        'Choose the subscription plan that fits your needs. Free tier available, paid plans from $19 to $149 per month with monthly credits.',
      images: [`${clientEnv.BASE_URL}/og-image-pricing.png`],
    },
    alternates: {
      canonical: canonicalUrl,
    },
    other: {
      'application/ld+json': JSON.stringify(generatePricingSchema()),
    },
  };
}

export default function PricingPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(generatePricingSchema()),
        }}
      />
      <PricingPageClient />
    </>
  );
}
