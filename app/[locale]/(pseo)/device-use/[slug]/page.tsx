import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getDeviceUseData, getAllDeviceUseSlugs } from '@/lib/seo/data-loader';
import { generateMetadata as generatePageMetadata } from '@/lib/seo/metadata-factory';

interface IDeviceUsePageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const slugs = await getAllDeviceUseSlugs();
  return slugs.map(slug => ({ slug }));
}

export async function generateMetadata({ params }: IDeviceUsePageProps): Promise<Metadata> {
  const { slug } = await params;
  const deviceUse = await getDeviceUseData(slug);

  if (!deviceUse) return {};

  return generatePageMetadata(deviceUse, 'device-use');
}

export default async function DeviceUsePage({ params }: IDeviceUsePageProps) {
  const { slug } = await params;
  const deviceUse = await getDeviceUseData(slug);

  if (!deviceUse) {
    notFound();
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-4xl font-bold mb-6">{deviceUse.h1}</h1>
      <p className="text-xl text-gray-600 mb-8">{deviceUse.intro}</p>
      <div className="bg-surface-light p-8 rounded-lg">
        <p className="text-gray-700">Device × Use Case content coming soon...</p>
      </div>
    </div>
  );
}
