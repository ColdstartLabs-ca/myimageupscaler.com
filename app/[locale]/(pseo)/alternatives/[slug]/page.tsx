import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getAlternativeDataWithLocale, getAllAlternativeSlugs } from '@/lib/seo/data-loader';
import { generateMetadata as generatePageMetadata } from '@/lib/seo/metadata-factory';
import { generateAlternativeSchema } from '@/lib/seo/schema-generator';
import { AlternativePageTemplate } from '@/app/(pseo)/_components/pseo/templates/AlternativePageTemplate';
import { SchemaMarkup } from '@/app/(pseo)/_components/seo/SchemaMarkup';
import { HreflangLinks } from '@client/components/seo/HreflangLinks';
import { SeoMetaTags } from '@client/components/seo/SeoMetaTags';
import type { Locale } from '@/i18n/config';
import { SUPPORTED_LOCALES } from '@/i18n/config';

interface IAlternativePageProps {
  params: Promise<{ slug: string; locale: Locale }>;
}

export async function generateStaticParams() {
  const slugs = await getAllAlternativeSlugs();
  return SUPPORTED_LOCALES.flatMap(locale => slugs.map(slug => ({ slug, locale })));
}

export async function generateMetadata({ params }: IAlternativePageProps): Promise<Metadata> {
  const { slug, locale } = await params;
  const result = await getAlternativeDataWithLocale(slug, locale);

  if (!result.data) return {};

  return generatePageMetadata(result.data, 'alternatives', locale);
}

export default async function AlternativePage({ params }: IAlternativePageProps) {
  const { slug, locale } = await params;
  let result = await getAlternativeDataWithLocale(slug, locale);

  // If no translation for this locale, fall back to English
  if (!result.data && locale !== 'en') {
    result = await getAlternativeDataWithLocale(slug, 'en');
  }

  // If no data even in English, 404
  if (!result.data) {
    notFound();
  }

  // Generate rich schema markup with @graph structure (ItemList + Article + FAQPage + BreadcrumbList)
  const schema = generateAlternativeSchema(result.data);

  const path = `/alternatives/${slug}`;

  return (
    <>
      {/* SEO meta tags - canonical and og:locale */}
      <SeoMetaTags path={path} locale={locale} />
      {/* Hreflang links for multi-language SEO */}
      <HreflangLinks path={path} category="alternatives" locale={locale} />
      <SchemaMarkup schema={schema} />
      <AlternativePageTemplate data={result.data} locale={locale} />
    </>
  );
}
