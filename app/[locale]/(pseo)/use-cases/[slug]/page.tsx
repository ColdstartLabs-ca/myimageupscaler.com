import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getUseCaseDataWithLocale, getAllUseCaseSlugs } from '@/lib/seo/data-loader';
import { generateMetadata as generatePageMetadata } from '@/lib/seo/metadata-factory';
import { generateUseCaseSchema } from '@/lib/seo/schema-generator';
import { UseCasePageTemplate } from '@/app/(pseo)/_components/pseo/templates/UseCasePageTemplate';
import { SchemaMarkup } from '@/app/(pseo)/_components/seo/SchemaMarkup';
import { HreflangLinks } from '@client/components/seo/HreflangLinks';
import { SeoMetaTags } from '@client/components/seo/SeoMetaTags';
import type { Locale } from '@/i18n/config';
import { SUPPORTED_LOCALES } from '@/i18n/config';

interface IUseCasePageProps {
  params: Promise<{ slug: string; locale: Locale }>;
}

export async function generateStaticParams() {
  const slugs = await getAllUseCaseSlugs();
  return SUPPORTED_LOCALES.flatMap(locale => slugs.map(slug => ({ slug, locale })));
}

export async function generateMetadata({ params }: IUseCasePageProps): Promise<Metadata> {
  const { slug, locale } = await params;
  const result = await getUseCaseDataWithLocale(slug, locale);

  if (!result.data) return {};

  return generatePageMetadata(result.data, 'use-cases', locale);
}

export default async function UseCasePage({ params }: IUseCasePageProps) {
  const { slug, locale } = await params;
  let result = await getUseCaseDataWithLocale(slug, locale);

  // If no translation for this locale, fall back to English
  if (!result.data && locale !== 'en') {
    result = await getUseCaseDataWithLocale(slug, 'en');
  }

  // If no data even in English, 404
  if (!result.data) {
    notFound();
  }

  // Generate rich schema markup with @graph structure (Article + FAQPage + BreadcrumbList)
  const schema = generateUseCaseSchema(result.data);

  const path = `/use-cases/${slug}`;

  return (
    <>
      {/* SEO meta tags - canonical and og:locale */}
      <SeoMetaTags path={path} locale={locale} />
      {/* Hreflang links for multi-language SEO */}
      <HreflangLinks path={path} />
      <SchemaMarkup schema={schema} />
      <UseCasePageTemplate data={result.data} locale={locale} />
    </>
  );
}
