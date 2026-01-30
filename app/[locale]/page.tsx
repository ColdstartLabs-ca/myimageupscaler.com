import type { Metadata } from 'next';
import { Suspense } from 'react';
import { HomePageClient } from '@client/components/pages/HomePageClient';
import { JsonLd } from '@client/components/seo/JsonLd';
import { generateHomepageSchema } from '@lib/seo/schema-generator';
import {
  getCanonicalUrl,
  getOpenGraphLocale,
  generateHreflangAlternates,
} from '@/lib/seo/hreflang-generator';
import { clientEnv } from '@shared/config/env';
import type { Locale } from '@/i18n/config';

interface ILocaleHomePageProps {
  params: Promise<{ locale: Locale }>;
}

export async function generateMetadata({ params }: ILocaleHomePageProps): Promise<Metadata> {
  const { locale } = await params;
  const title = 'AI Image Upscaler & Photo Enhancer | Enhance Quality Free Online';
  const description =
    'Professional AI image enhancer that upscales photos to 4K with stunning quality. Enhance image quality, remove blur, and restore details in seconds.';

  const canonicalUrl = getCanonicalUrl('/');
  const ogLocale = getOpenGraphLocale(locale);
  const hreflangAlternates = generateHreflangAlternates('/');

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      type: 'website',
      url: '/',
      locale: ogLocale,
      siteName: clientEnv.APP_NAME,
      images: [
        {
          url: '/og-image.png',
          width: 1200,
          height: 630,
          alt: title,
        },
      ],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['/og-image.png'],
    },
    alternates: {
      canonical: canonicalUrl,
      languages: hreflangAlternates,
    },
  };
}

export default async function LocaleHomePage({ params }: ILocaleHomePageProps) {
  const { locale } = await params;
  const homepageSchema = generateHomepageSchema(locale);

  return (
    <>
      <JsonLd data={homepageSchema} />
      {/* Hidden H1 for SEO - crawlers see this in initial HTML */}
      <h1 className="sr-only">AI Image Upscaler - Enlarge Images Without Quality Loss</h1>
      <Suspense
        fallback={
          <div className="min-h-screen flex items-center justify-center bg-background">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
              <p className="text-muted-foreground">Loading...</p>
            </div>
          </div>
        }
      >
        <HomePageClient />
      </Suspense>
    </>
  );
}
