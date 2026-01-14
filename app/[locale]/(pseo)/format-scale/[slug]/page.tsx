import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getFormatScaleDataWithLocale, getAllFormatScaleSlugs } from '@/lib/seo/data-loader';
import { generateMetadata as generatePageMetadata } from '@/lib/seo/metadata-factory';
import { generatePSEOSchema } from '@/lib/seo/schema-generator';
import { getRelatedPages } from '@/lib/seo/related-pages';
import { FormatScalePageTemplate } from '@/app/(pseo)/_components/pseo/templates/FormatScalePageTemplate';
import { SchemaMarkup } from '@/app/(pseo)/_components/seo/SchemaMarkup';
import { HreflangLinks } from '@client/components/seo/HreflangLinks';
import { SeoMetaTags } from '@client/components/seo/SeoMetaTags';
import type { Locale } from '@/i18n/config';
import { SUPPORTED_LOCALES } from '@/i18n/config';

interface IFormatScalePageProps {
  params: Promise<{ slug: string; locale: Locale }>;
}

export async function generateStaticParams() {
  const slugs = await getAllFormatScaleSlugs();
  return SUPPORTED_LOCALES.flatMap(locale => slugs.map(slug => ({ slug, locale })));
}

export async function generateMetadata({ params }: IFormatScalePageProps): Promise<Metadata> {
  const { slug, locale } = await params;
  const result = await getFormatScaleDataWithLocale(slug, locale);

  if (!result.data) return {};

  return generatePageMetadata(result.data, 'format-scale', locale);
}

export default async function FormatScalePage({ params }: IFormatScalePageProps) {
  const { slug, locale } = await params;
  let result = await getFormatScaleDataWithLocale(slug, locale);

  // If no translation for this locale, fall back to English
  if (!result.data && locale !== 'en') {
    result = await getFormatScaleDataWithLocale(slug, 'en');
  }

  // If no data even in English, 404
  if (!result.data) {
    notFound();
  }

  // Generate rich schema markup with FAQPage and BreadcrumbList
  const schema = generatePSEOSchema(result.data, 'format-scale', locale);

  // Fetch related pages for internal linking
  const relatedPages = await getRelatedPages('format-scale', slug, locale);

  const path = `/format-scale/${slug}`;

  return (
    <>
      {/* SEO meta tags - canonical and og:locale */}
      <SeoMetaTags path={path} locale={locale} />
      {/* Hreflang links for multi-language SEO */}
      <HreflangLinks path={path} />
      <SchemaMarkup schema={schema} />
      <FormatScalePageTemplate data={result.data} locale={locale} relatedPages={relatedPages} />
    </>
  );
}
