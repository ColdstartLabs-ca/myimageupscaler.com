import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getPlatformData, getAllPlatformSlugs } from '@/lib/seo/data-loader';
import { generateMetadata as generatePageMetadata } from '@/lib/seo/metadata-factory';

interface IPlatformPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const slugs = await getAllPlatformSlugs();
  return slugs.map(slug => ({ slug }));
}

export async function generateMetadata({ params }: IPlatformPageProps): Promise<Metadata> {
  const { slug } = await params;
  const platform = await getPlatformData(slug);

  if (!platform) return {};

  return generatePageMetadata(platform, 'platforms');
}

export default async function PlatformPage({ params }: IPlatformPageProps) {
  const { slug } = await params;
  const platform = await getPlatformData(slug);

  if (!platform) {
    notFound();
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-4xl font-bold mb-6">{platform.h1}</h1>
      <p className="text-xl text-gray-600 mb-8">{platform.intro}</p>
      <div className="bg-surface-light p-8 rounded-lg">
        <p className="text-gray-700">Platform content coming soon...</p>
      </div>
    </div>
  );
}
