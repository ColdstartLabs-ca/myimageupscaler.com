import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getFormatData, getAllFormatSlugs } from '@/lib/seo/data-loader';
import { generateMetadata as generatePageMetadata } from '@/lib/seo/metadata-factory';

interface IFormatPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const slugs = await getAllFormatSlugs();
  return slugs.map(slug => ({ slug }));
}

export async function generateMetadata({ params }: IFormatPageProps): Promise<Metadata> {
  const { slug } = await params;
  const format = await getFormatData(slug);

  if (!format) return {};

  return generatePageMetadata(format, 'formats');
}

export default async function FormatPage({ params }: IFormatPageProps) {
  const { slug } = await params;
  const format = await getFormatData(slug);

  if (!format) {
    notFound();
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-4xl font-bold mb-6">{format.h1}</h1>
      <p className="text-xl text-gray-600 mb-8">{format.intro}</p>
      <div className="bg-surface-light p-8 rounded-lg">
        <p className="text-gray-700">Format content coming soon...</p>
      </div>
    </div>
  );
}
