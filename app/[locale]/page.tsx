import type { Metadata } from 'next';
import { Suspense } from 'react';
import { HomePageClient } from '@client/components/pages/HomePageClient';
import { HeroSection } from '@client/components/landing/HeroSection';
import { JsonLd } from '@client/components/seo/JsonLd';
import { HreflangLinks } from '@client/components/seo/HreflangLinks';
import { RelatedBlogPostsSection } from '@/app/(pseo)/_components/pseo/sections/RelatedBlogPostsSection';
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
  const title =
    common.meta?.homepage?.title ??
    'AI Image Upscaler & Photo Enhancer | Enhance Quality Free Online';
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

const HOMEPAGE_BLOG_SLUGS = [
  'how-to-upscale-images-without-losing-quality',
  'fix-blurry-photos-ai-methods-guide',
  'restore-old-photos-ai-enhancement-guide',
  'image-resolution-for-printing-complete-guide',
];

export default async function LocaleHomePage({ params }: ILocaleHomePageProps) {
  const { locale } = await params;
  const homepageSchema = generateHomepageSchema(locale);

  return (
    <>
      {/* Hreflang links for multi-language SEO */}
      <HreflangLinks path="/" locale={locale} />
      <JsonLd data={homepageSchema} />
      <div className="flex-grow bg-main font-sans selection:bg-accent/20 selection:text-white">
        {/* Hero section — server-rendered for fast LCP */}
        <HeroSection />
        {/* Below-fold interactive content */}
        <Suspense fallback={<div className="h-screen" />}>
          <HomePageClient />
        </Suspense>
      </div>
      <div className="bg-background">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <RelatedBlogPostsSection
            blogPostSlugs={HOMEPAGE_BLOG_SLUGS}
            title="From the Blog"
            subtitle="Guides and tutorials to get the most from AI image tools"
            maxPosts={4}
            locale={locale}
          />
        </div>
      </div>
    </>
  );
}
