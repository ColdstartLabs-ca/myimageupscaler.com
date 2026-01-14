import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getComparisonDataWithLocale, getAllComparisonSlugs } from '@/lib/seo/data-loader';
import { generateMetadata as generatePageMetadata } from '@/lib/seo/metadata-factory';
import { ComparePageTemplate } from '@/app/(pseo)/_components/pseo/templates/ComparePageTemplate';
import { SchemaMarkup } from '@/app/(pseo)/_components/seo/SchemaMarkup';
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
  const result = await getComparisonDataWithLocale(slug, locale);

  if (!result.data) return {};

  return generatePageMetadata(result.data, 'compare', locale);
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

  return (
    <>
      <SchemaMarkup schema={schema} />
      <ComparePageTemplate data={result.data} />
    </>
  );
}
