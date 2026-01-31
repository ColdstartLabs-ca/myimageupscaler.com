import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getFormatScaleData, getAllFormatScaleSlugs } from '@/lib/seo/data-loader';
import { generateMetadata as generatePageMetadata } from '@/lib/seo/metadata-factory';
import { generatePSEOSchema } from '@/lib/seo/schema-generator';
import { getRelatedPages } from '@/lib/seo/related-pages';
import { FormatScalePageTemplate } from '@/app/(pseo)/_components/pseo/templates/FormatScalePageTemplate';
import { SchemaMarkup } from '@/app/(pseo)/_components/seo/SchemaMarkup';
import { HreflangLinks } from '@client/components/seo/HreflangLinks';
import { SeoMetaTags } from '@client/components/seo/SeoMetaTags';

interface IFormatScalePageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const slugs = await getAllFormatScaleSlugs();
  return slugs.map(slug => ({ slug }));
}

export async function generateMetadata({ params }: IFormatScalePageProps): Promise<Metadata> {
  const { slug } = await params;
  const formatScale = await getFormatScaleData(slug);

  if (!formatScale) return {};

  return generatePageMetadata(formatScale, 'format-scale', 'en');
}

export default async function FormatScalePage({ params }: IFormatScalePageProps) {
  const { slug } = await params;
  const formatScale = await getFormatScaleData(slug);

  if (!formatScale) {
    notFound();
  }

  // Get related pages for internal linking
  const relatedPages = await getRelatedPages('format-scale', slug, 'en');

  // Generate rich schema markup with FAQPage and BreadcrumbList
  const schema = generatePSEOSchema(formatScale, 'format-scale', 'en');

  const path = `/format-scale/${slug}`;

  return (
    <>
      {/* SEO meta tags - canonical and og:locale */}
      <SeoMetaTags path={path} locale="en" />
      {/* Hreflang links for multi-language SEO */}
      <HreflangLinks path={path} category="format-scale" locale="en" />
      <SchemaMarkup schema={schema} />
      <FormatScalePageTemplate data={formatScale} locale="en" relatedPages={relatedPages} />
    </>
  );
}
