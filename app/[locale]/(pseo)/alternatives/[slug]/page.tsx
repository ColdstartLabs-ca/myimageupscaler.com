import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getAlternativeData, getAllAlternativeSlugs } from '@/lib/seo/data-loader';
import { generateMetadata as generatePageMetadata } from '@/lib/seo/metadata-factory';

interface IAlternativePageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const slugs = await getAllAlternativeSlugs();
  return slugs.map(slug => ({ slug }));
}

export async function generateMetadata({ params }: IAlternativePageProps): Promise<Metadata> {
  const { slug } = await params;
  const alternative = await getAlternativeData(slug);

  if (!alternative) return {};

  return generatePageMetadata(alternative, 'alternatives');
}

export default async function AlternativePage({ params }: IAlternativePageProps) {
  const { slug } = await params;
  const alternative = await getAlternativeData(slug);

  if (!alternative) {
    notFound();
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-4xl font-bold mb-6">{alternative.h1}</h1>
      <p className="text-xl text-gray-600 mb-8">{alternative.intro}</p>
      <div className="bg-surface-light p-8 rounded-lg">
        <p className="text-gray-700">Alternatives content coming soon...</p>
      </div>
    </div>
  );
}
