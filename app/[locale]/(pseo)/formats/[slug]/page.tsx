import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getFormatDataWithLocale, getAllFormatSlugs } from '@/lib/seo/data-loader';
import { generateMetadata as generatePageMetadata } from '@/lib/seo/metadata-factory';
import { generateFormatSchema } from '@/lib/seo/schema-generator';
import { getRelatedPages } from '@/lib/seo/related-pages';
import { FormatPageTemplate } from '@/app/(pseo)/_components/pseo/templates/FormatPageTemplate';
import { SchemaMarkup } from '@/app/(pseo)/_components/seo/SchemaMarkup';
import { HreflangLinks } from '@client/components/seo/HreflangLinks';
import { SeoMetaTags } from '@client/components/seo/SeoMetaTags';
import type { Locale } from '@/i18n/config';
import { SUPPORTED_LOCALES } from '@/i18n/config';

interface IFormatPageProps {
  params: Promise<{ slug: string; locale: Locale }>;
}

export async function generateStaticParams() {
  const slugs = await getAllFormatSlugs();
  return SUPPORTED_LOCALES.flatMap(locale => slugs.map(slug => ({ slug, locale })));
}

export async function generateMetadata({ params }: IFormatPageProps): Promise<Metadata> {
  const { slug, locale } = await params;
  const result = await getFormatDataWithLocale(slug, locale);

  if (!result.data) return {};

  return generatePageMetadata(result.data, 'formats', locale);
}

export default async function FormatPage({ params }: IFormatPageProps) {
  const { slug, locale } = await params;
  let result = await getFormatDataWithLocale(slug, locale);

  // If no translation for this locale, fall back to English
  if (!result.data && locale !== 'en') {
    result = await getFormatDataWithLocale(slug, 'en');
  }

  // If no data even in English, 404
  if (!result.data) {
    notFound();
  }

  // Generate rich schema markup with @graph structure (WebPage + FAQPage + BreadcrumbList)
  const schema = generateFormatSchema(result.data, locale);

  // Fetch related pages for internal linking
  const relatedPages = await getRelatedPages('formats', slug, locale);

  const path = `/formats/${slug}`;

  return (
    <>
      {/* SEO meta tags - canonical and og:locale */}
      <SeoMetaTags path={path} locale={locale} />
      {/* Hreflang links for multi-language SEO */}
      <HreflangLinks path={path} category="formats" locale={locale} />
      <SchemaMarkup schema={schema} />
      <FormatPageTemplate data={result.data} locale={locale} relatedPages={relatedPages} />
    </>
  );
}
