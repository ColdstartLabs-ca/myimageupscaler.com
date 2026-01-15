import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getIndustryInsightsData, getAllIndustryInsightsSlugs } from '@/lib/seo/data-loader';
import { generateMetadata as generatePageMetadata } from '@/lib/seo/metadata-factory';
import { generatePSEOSchema } from '@/lib/seo/schema-generator';
import { GenericPSEOPageTemplate } from '@/app/(pseo)/_components/pseo/templates/GenericPSEOPageTemplate';
import { SchemaMarkup } from '@/app/(pseo)/_components/seo/SchemaMarkup';
import { HreflangLinks } from '@client/components/seo/HreflangLinks';
import { SeoMetaTags } from '@client/components/seo/SeoMetaTags';

interface IIndustryInsightsPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const slugs = await getAllIndustryInsightsSlugs();
  return slugs.map(slug => ({ slug }));
}

export async function generateMetadata({ params }: IIndustryInsightsPageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = await getIndustryInsightsData(slug);

  if (!page) return {};

  return generatePageMetadata(page, 'industry-insights', 'en');
}

export default async function IndustryInsightsPage({ params }: IIndustryInsightsPageProps) {
  const { slug } = await params;
  const page = await getIndustryInsightsData(slug);

  if (!page) {
    notFound();
  }

  // Generate schema markup
  const schema = generatePSEOSchema(page, 'article');

  const path = `/industry-insights/${slug}`;

  return (
    <>
      <SeoMetaTags path={path} locale="en" />
      <HreflangLinks path={path} />
      <SchemaMarkup schema={schema} />
      <GenericPSEOPageTemplate data={page} />
    </>
  );
}
