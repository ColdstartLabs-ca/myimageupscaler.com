import { Metadata } from 'next';
import PricingPageClient from './PricingPageClient';
import { generatePricingSchema } from '@lib/seo/schema-generator';
import { clientEnv } from '@shared/config/env';

export const metadata: Metadata = {
  title: 'Simple, Transparent Pricing - AI Image Upscaler',
  description:
    'Choose the subscription plan that fits your needs. Get monthly credits with automatic rollover for AI image upscaling and enhancement. Free tier available, paid plans from $9 to $149 per month.',
  openGraph: {
    title: 'Simple, Transparent Pricing - AI Image Upscaler',
    description:
      'Choose the subscription plan that fits your needs. Get monthly credits with automatic rollover for AI image upscaling and enhancement.',
    url: `${clientEnv.BASE_URL}/pricing`,
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
    canonical: `${clientEnv.BASE_URL}/pricing`,
  },
  other: {
    'application/ld+json': JSON.stringify(generatePricingSchema()),
  },
};

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
