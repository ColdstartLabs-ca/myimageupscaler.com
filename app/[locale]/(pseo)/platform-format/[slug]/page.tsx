import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPlatformFormatData, getAllPlatformFormatSlugs } from '@/lib/seo/data-loader';
import { generateMetadata as generatePageMetadata } from '@/lib/seo/metadata-factory';

interface IPlatformFormatPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const slugs = await getAllPlatformFormatSlugs();
  return slugs.map(slug => ({ slug }));
}

export async function generateMetadata({ params }: IPlatformFormatPageProps): Promise<Metadata> {
  const { slug } = await params;
  const platformFormat = await getPlatformFormatData(slug);

  if (!platformFormat) return {};

  return generatePageMetadata(platformFormat, 'platform-format');
}

export default async function PlatformFormatPage({ params }: IPlatformFormatPageProps) {
  const { slug } = await params;
  const platformFormat = await getPlatformFormatData(slug);

  if (!platformFormat) {
    notFound();
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-4xl font-bold mb-6">{platformFormat.h1}</h1>
      <p className="text-xl text-gray-600 mb-8">{platformFormat.intro}</p>
      <div className="bg-surface-light p-8 rounded-lg">
        <p className="text-gray-700">Platform × Format content coming soon...</p>
      </div>
    </div>
  );
}
