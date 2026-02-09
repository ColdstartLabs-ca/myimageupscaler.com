import type { Metadata } from 'next';
import { Suspense } from 'react';
import { HomePageClient } from '@client/components/pages/HomePageClient';
import { JsonLd } from '@client/components/seo/JsonLd';
import { HreflangLinks } from '@client/components/seo/HreflangLinks';
import { generateHomepageSchema } from '@lib/seo/schema-generator';
import {
  getCanonicalUrl,
  getOpenGraphLocale,
  generateHreflangAlternates,
} from '@/lib/seo/hreflang-generator';
import { serverEnv } from '@shared/config/env';
import type { Locale } from '@/i18n/config';
import commonTranslations from '@/locales/en/common.json';

/**
 * Helper function to load locale-specific translations for metadata
 * Since metadata generation runs server-side at build time, we need to
 * directly import the locale files based on the locale parameter
 */
async function getLocaleCommonTranslations(locale: Locale) {
  try {
    // eslint-disable-next-line no-restricted-syntax -- Dynamic import required for locale-specific metadata
    const translations = (await import(`@/locales/${locale}/common.json`)) as {
      default: { meta?: { homepage?: { title: string; description: string } } };
    };
    return translations.default;
  } catch {
    // Fallback to English if locale file not found
    return commonTranslations;
  }
}

interface ILocaleHomePageProps {
  params: Promise<{ locale: Locale }>;
}

export async function generateMetadata({ params }: ILocaleHomePageProps): Promise<Metadata> {
  const { locale } = await params;
  const common = await getLocaleCommonTranslations(locale);

  // Use locale-specific metadata from translations, fallback to English defaults
  const title = common.meta?.homepage?.title ?? 'AI Image Upscaler & Photo Enhancer | Enhance Quality Free Online';
  const description =
    common.meta?.homepage?.description ??
    'Professional AI image enhancer that upscales photos to 4K with stunning quality. Enhance image quality, remove blur, and restore details in seconds.';

  const canonicalUrl = getCanonicalUrl('/', locale);
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
      siteName: serverEnv.APP_NAME,
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
      {/* Hreflang links for multi-language SEO */}
      <HreflangLinks path="/" locale={locale} />
      <JsonLd data={homepageSchema} />
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
