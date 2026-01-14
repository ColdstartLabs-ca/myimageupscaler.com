import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getDeviceUseDataWithLocale, getAllDeviceUseSlugs } from '@/lib/seo/data-loader';
import { generateMetadata as generatePageMetadata } from '@/lib/seo/metadata-factory';
import { generatePSEOSchema } from '@/lib/seo/schema-generator';
import { getRelatedPages } from '@/lib/seo/related-pages';
import { DeviceUsePageTemplate } from '@/app/(pseo)/_components/pseo/templates/DeviceUsePageTemplate';
import { SchemaMarkup } from '@/app/(pseo)/_components/seo/SchemaMarkup';
import { HreflangLinks } from '@client/components/seo/HreflangLinks';
import { SeoMetaTags } from '@client/components/seo/SeoMetaTags';
import type { Locale } from '@/i18n/config';
import { SUPPORTED_LOCALES } from '@/i18n/config';

interface IDeviceUsePageProps {
  params: Promise<{ slug: string; locale: Locale }>;
}

export async function generateStaticParams() {
  const slugs = await getAllDeviceUseSlugs();
  return SUPPORTED_LOCALES.flatMap(locale => slugs.map(slug => ({ slug, locale })));
}

export async function generateMetadata({ params }: IDeviceUsePageProps): Promise<Metadata> {
  const { slug, locale } = await params;
  const result = await getDeviceUseDataWithLocale(slug, locale);

  if (!result.data) return {};

  return generatePageMetadata(result.data, 'device-use', locale);
}

export default async function DeviceUsePage({ params }: IDeviceUsePageProps) {
  const { slug, locale } = await params;
  let result = await getDeviceUseDataWithLocale(slug, locale);

  // If no translation for this locale, fall back to English
  if (!result.data && locale !== 'en') {
    result = await getDeviceUseDataWithLocale(slug, 'en');
  }

  // If no data even in English, 404
  if (!result.data) {
    notFound();
  }

  // Generate rich schema markup with FAQPage and BreadcrumbList
  const schema = generatePSEOSchema(result.data, 'device-use', locale);

  // Fetch related pages for internal linking
  const relatedPages = await getRelatedPages('device-use', slug, locale);

  const path = `/device-use/${slug}`;

  return (
    <>
      {/* SEO meta tags - canonical and og:locale */}
      <SeoMetaTags path={path} locale={locale} />
      {/* Hreflang links for multi-language SEO */}
      <HreflangLinks path={path} />
      <SchemaMarkup schema={schema} />
      <DeviceUsePageTemplate data={result.data} locale={locale} relatedPages={relatedPages} />
    </>
  );
}
