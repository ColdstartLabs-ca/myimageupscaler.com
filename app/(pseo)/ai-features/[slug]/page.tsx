import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getAIFeatureData, getAllAIFeatureSlugs } from '@/lib/seo/data-loader';
import { generateMetadata as generatePageMetadata } from '@/lib/seo/metadata-factory';
import { generatePSEOSchema } from '@/lib/seo/schema-generator';
import { GenericPSEOPageTemplate } from '@/app/(pseo)/_components/pseo/templates/GenericPSEOPageTemplate';
import { SchemaMarkup } from '@/app/(pseo)/_components/seo/SchemaMarkup';
import { HreflangLinks } from '@client/components/seo/HreflangLinks';
import { SeoMetaTags } from '@client/components/seo/SeoMetaTags';

interface IAIFeaturePageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const slugs = await getAllAIFeatureSlugs();
  return slugs.map(slug => ({ slug }));
}

export async function generateMetadata({ params }: IAIFeaturePageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = await getAIFeatureData(slug);

  if (!page) return {};

  return generatePageMetadata(page, 'ai-features', 'en');
}

export default async function AIFeaturePage({ params }: IAIFeaturePageProps) {
  const { slug } = await params;
  const page = await getAIFeatureData(slug);

  if (!page) {
    notFound();
  }

  // Generate schema markup
  const schema = generatePSEOSchema(page, 'ai-features');

  const path = `/ai-features/${slug}`;

  return (
    <>
      <SeoMetaTags path={path} locale="en" />
      <HreflangLinks path={path} category="ai-features" locale="en" />
      <SchemaMarkup schema={schema} />
      <GenericPSEOPageTemplate data={page} />
    </>
  );
}
