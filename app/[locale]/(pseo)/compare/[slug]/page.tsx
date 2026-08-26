import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getComparisonDataWithLocale, getAllComparisonSlugs } from '@/lib/seo/data-loader';
import { resolveLocalePageMetadata } from '@/lib/seo/locale-page-metadata';
import { getRelatedPages } from '@/lib/seo/related-pages';
import { ComparePageTemplate } from '@/app/(pseo)/_components/pseo/templates/ComparePageTemplate';
import { SchemaMarkup } from '@/app/(pseo)/_components/seo/SchemaMarkup';
import { SeoMetaTags } from '@client/components/seo/SeoMetaTags';
import { HreflangLinks } from '@client/components/seo/HreflangLinks';
import { generateComparisonSchema } from '@/lib/seo/schema-generator';
import type { Locale } from '@/i18n/config';
import { SUPPORTED_LOCALES } from '@/i18n/config';

interface IComparisonPageProps {
  params: Promise<{ slug: string; locale: Locale }>;
}

export async function generateStaticParams() {
  const slugs = await getAllComparisonSlugs();
  return SUPPORTED_LOCALES.flatMap(locale => slugs.map(slug => ({ slug, locale })));
}

export async function generateMetadata({ params }: IComparisonPageProps): Promise<Metadata> {
  const { slug, locale } = await params;

  return resolveLocalePageMetadata(getComparisonDataWithLocale, 'compare', slug, locale);
}

export default async function ComparisonPage({ params }: IComparisonPageProps) {
  const { slug, locale } = await params;
  let result = await getComparisonDataWithLocale(slug, locale);

  // If no translation for this locale, fall back to English
  if (!result.data && locale !== 'en') {
    result = await getComparisonDataWithLocale(slug, 'en');
  }

  // If no data even in English, 404
  if (!result.data) {
    notFound();
  }

  const schema = generateComparisonSchema(result.data);

  // Fetch related pages for internal linking
  const relatedPages = await getRelatedPages('compare', slug, locale);

  const path = `/compare/${slug}`;
  // For non-English locales, canonical should point to English URL
  const canonicalLocale = locale !== 'en' ? 'en' : locale;

  return (
    <>
      <SeoMetaTags path={path} locale={canonicalLocale} />
      <HreflangLinks path={path} category="compare" locale={locale} />
      <SchemaMarkup schema={schema} />
      <ComparePageTemplate data={result.data} relatedPages={relatedPages} />
    </>
  );
}
