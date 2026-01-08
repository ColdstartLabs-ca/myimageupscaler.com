import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getComparisonData, getAllComparisonSlugs } from '@/lib/seo/data-loader';
import { generateMetadata as generatePageMetadata } from '@/lib/seo/metadata-factory';
import { ComparePageTemplate } from '@/app/(pseo)/_components/pseo/templates/ComparePageTemplate';
import { SchemaMarkup } from '@/app/(pseo)/_components/seo/SchemaMarkup';
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

  const schema = generateComparisonSchema(comparison);

  return (
    <>
      <SchemaMarkup schema={schema} />
      <ComparePageTemplate data={comparison} />
    </>
  );
}
