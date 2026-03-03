import { Metadata } from 'next';
import { Suspense } from 'react';
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
    title: 'AI Image Upscaler Pricing — Free Plan + Paid Credits',
    description:
      'Start free with 10 monthly credits. Upgrade for more credits, batch processing, and priority support. No credit card needed to get started.',
    openGraph: {
      title: 'AI Image Upscaler Pricing — Free Plan + Paid Credits',
      description:
        'Start free with 10 monthly credits. Upgrade for more credits, batch processing, and priority support. No credit card needed to get started.',
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
      title: 'AI Image Upscaler Pricing — Free Plan + Paid Credits',
      description:
        'Start free with 10 monthly credits. Upgrade for more credits, batch processing, and priority support. No credit card needed to get started.',
      images: [`${clientEnv.BASE_URL}/og-image-pricing.png`],
    },
    alternates: {
      canonical: canonicalUrl,
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
      <Suspense>
        <PricingPageClient />
      </Suspense>
    </>
  );
}
