import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getComparisonData, getAllComparisonSlugs } from '@/lib/seo/data-loader';
import { generateMetadata as generatePageMetadata } from '@/lib/seo/metadata-factory';
import { getRelatedPages } from '@/lib/seo/related-pages';
import { ComparePageTemplate } from '@/app/(pseo)/_components/pseo/templates/ComparePageTemplate';
import { SchemaMarkup } from '@/app/(pseo)/_components/seo/SchemaMarkup';
import { SeoMetaTags } from '@client/components/seo/SeoMetaTags';
import { HreflangLinks } from '@client/components/seo/HreflangLinks';
import { generateComparisonSchema } from '@/lib/seo/schema-generator';

interface IComparisonPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const slugs = await getAllComparisonSlugs();
  return slugs.map(slug => ({ slug }));
}

export async function generateMetadata({ params }: IComparisonPageProps): Promise<Metadata> {
  const { slug } = await params;
  const comparison = await getComparisonData(slug);

  if (!comparison) return {};

  return generatePageMetadata(comparison, 'compare');
}

export default async function ComparisonPage({ params }: IComparisonPageProps) {
  const { slug } = await params;
  const comparison = await getComparisonData(slug);

  if (!comparison) {
    notFound();
  }

  // Get related pages for internal linking
  const relatedPages = await getRelatedPages('compare', slug, 'en');

  const schema = generateComparisonSchema(comparison);

  const path = `/compare/${slug}`;

  return (
    <>
      <SeoMetaTags path={path} locale="en" />
      <HreflangLinks path={path} category="compare" locale="en" />
      <SchemaMarkup schema={schema} />
      <ComparePageTemplate data={comparison} relatedPages={relatedPages} />
    </>
  );
}
