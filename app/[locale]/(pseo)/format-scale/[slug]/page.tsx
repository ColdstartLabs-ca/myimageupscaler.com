import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getFormatScaleData, getAllFormatScaleSlugs } from '@/lib/seo/data-loader';
import { generateMetadata as generatePageMetadata } from '@/lib/seo/metadata-factory';

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

  return generatePageMetadata(formatScale, 'format-scale');
}

export default async function FormatScalePage({ params }: IFormatScalePageProps) {
  const { slug } = await params;
  const formatScale = await getFormatScaleData(slug);

  if (!formatScale) {
    notFound();
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-4xl font-bold mb-6">{formatScale.h1}</h1>
      <p className="text-xl text-gray-600 mb-8">{formatScale.intro}</p>
      <div className="bg-surface-light p-8 rounded-lg">
        <p className="text-gray-700">Format × Scale content coming soon...</p>
      </div>
    </div>
  );
}
