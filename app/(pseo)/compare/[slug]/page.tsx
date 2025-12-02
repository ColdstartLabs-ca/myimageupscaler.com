import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getComparisonData, getAllComparisonSlugs } from '@/lib/seo/data-loader';

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

  return {
    title: comparison.metaTitle,
    description: comparison.metaDescription,
    keywords: comparison.secondaryKeywords.join(', '),
    alternates: {
      canonical: `https://pixelperfect.app/compare/${slug}`,
    },
  };
}

export default async function ComparisonPage({ params }: IComparisonPageProps) {
  const { slug } = await params;
  const comparison = await getComparisonData(slug);

  if (!comparison) {
    notFound();
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-4xl font-bold mb-6">{comparison.h1}</h1>
      <p className="text-xl text-gray-600 mb-8">{comparison.intro}</p>
      <div className="bg-gray-50 p-8 rounded-lg">
        <p className="text-gray-700">Comparison content coming soon...</p>
      </div>
    </div>
  );
}
