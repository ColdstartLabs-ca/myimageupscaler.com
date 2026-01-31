import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import {
  getToolDataWithLocale,
  getAllToolSlugs,
  generateMetadata as generatePageMetadata,
} from '@/lib/seo';
import { getRelatedPages } from '@/lib/seo/related-pages';
import { ToolPageTemplate } from '@/app/(pseo)/_components/pseo/templates/ToolPageTemplate';
import { InteractiveToolPageTemplate } from '@/app/(pseo)/_components/pseo/templates/InteractiveToolPageTemplate';
import { SchemaMarkup } from '@/app/(pseo)/_components/seo/SchemaMarkup';
import { generateToolSchema } from '@/lib/seo';
import { HreflangLinks } from '@client/components/seo/HreflangLinks';
import { SeoMetaTags } from '@client/components/seo/SeoMetaTags';
import type { Locale } from '@/i18n/config';
import { SUPPORTED_LOCALES } from '@/i18n/config';

interface IToolPageProps {
  params: Promise<{ slug: string; locale: Locale }>;
}

// Generate static paths at build time
export async function generateStaticParams() {
  const slugs = await getAllToolSlugs();
  return SUPPORTED_LOCALES.flatMap(locale => slugs.map(slug => ({ slug, locale })));
}

// Generate metadata using factory
export async function generateMetadata({ params }: IToolPageProps): Promise<Metadata> {
  const { slug, locale } = await params;
  const result = await getToolDataWithLocale(slug, locale);

  if (!result.data) return {};

  return generatePageMetadata(result.data, 'tools', locale);
}

export default async function ToolPage({ params }: IToolPageProps) {
  const { slug, locale } = await params;
  let result = await getToolDataWithLocale(slug, locale);

  // If no translation for this locale, fall back to English
  if (!result.data && locale !== 'en') {
    result = await getToolDataWithLocale(slug, 'en');
  }

  // If no data even in English, 404
  if (!result.data) {
    notFound();
  }

  const schema = generateToolSchema(result.data, locale);
  const path = `/tools/${slug}`;

  // Fetch related pages for internal linking
  const relatedPages = await getRelatedPages('tools', slug, locale);

  // Use InteractiveToolPageTemplate for tools with embedded functionality
  const Template = result.data.isInteractive ? InteractiveToolPageTemplate : ToolPageTemplate;

  return (
    <>
      {/* SEO meta tags - canonical and og:locale */}
      <SeoMetaTags path={path} locale={locale} />
      {/* Hreflang links for multi-language SEO */}
      <HreflangLinks path={path} category="tools" locale={locale} />
      <SchemaMarkup schema={schema} />
      <Template data={result.data} locale={locale} relatedPages={relatedPages} />
    </>
  );
}
