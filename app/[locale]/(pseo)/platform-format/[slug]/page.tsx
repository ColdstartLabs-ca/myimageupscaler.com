import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPlatformFormatDataWithLocale, getAllPlatformFormatSlugs } from '@/lib/seo/data-loader';
import { generateMetadata as generatePageMetadata } from '@/lib/seo/metadata-factory';
import { generatePSEOSchema } from '@/lib/seo/schema-generator';
import { getRelatedPages } from '@/lib/seo/related-pages';
import { PlatformFormatPageTemplate } from '@/app/(pseo)/_components/pseo/templates/PlatformFormatPageTemplate';
import { SchemaMarkup } from '@/app/(pseo)/_components/seo/SchemaMarkup';
import { HreflangLinks } from '@client/components/seo/HreflangLinks';
import { SeoMetaTags } from '@client/components/seo/SeoMetaTags';
import type { Locale } from '@/i18n/config';
import { SUPPORTED_LOCALES } from '@/i18n/config';

interface IPlatformFormatPageProps {
  params: Promise<{ slug: string; locale: Locale }>;
}

export async function generateStaticParams() {
  const slugs = await getAllPlatformFormatSlugs();
  return SUPPORTED_LOCALES.flatMap(locale => slugs.map(slug => ({ slug, locale })));
}

export async function generateMetadata({ params }: IPlatformFormatPageProps): Promise<Metadata> {
  const { slug, locale } = await params;
  const result = await getPlatformFormatDataWithLocale(slug, locale);

  if (!result.data) return {};

  return generatePageMetadata(result.data, 'platform-format', locale);
}

export default async function PlatformFormatPage({ params }: IPlatformFormatPageProps) {
  const { slug, locale } = await params;
  let result = await getPlatformFormatDataWithLocale(slug, locale);

  // If no translation for this locale, fall back to English
  if (!result.data && locale !== 'en') {
    result = await getPlatformFormatDataWithLocale(slug, 'en');
  }

  // If no data even in English, 404
  if (!result.data) {
    notFound();
  }

  // Generate rich schema markup with FAQPage and BreadcrumbList
  const schema = generatePSEOSchema(result.data, 'platform-format', locale);

  // Fetch related pages for internal linking
  const relatedPages = await getRelatedPages('platform-format', slug, locale);

  const path = `/platform-format/${slug}`;

  return (
    <>
      {/* SEO meta tags - canonical and og:locale */}
      <SeoMetaTags path={path} locale={locale} />
      {/* Hreflang links for multi-language SEO */}
      <HreflangLinks path={path} category="platform-format" locale={locale} />
      <SchemaMarkup schema={schema} />
      <PlatformFormatPageTemplate data={result.data} locale={locale} relatedPages={relatedPages} />
    </>
  );
}
