import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getFreeData, getAllFreeSlugs } from '@/lib/seo/data-loader';

interface IFreePageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const slugs = await getAllFreeSlugs();
  return slugs.map(slug => ({ slug }));
}

export async function generateMetadata({ params }: IFreePageProps): Promise<Metadata> {
  const { slug } = await params;
  const freeTool = await getFreeData(slug);

  if (!freeTool) return {};

  return {
    title: freeTool.metaTitle,
    description: freeTool.metaDescription,
    keywords: freeTool.secondaryKeywords.join(', '),
    alternates: {
      canonical: `https://pixelperfect.app/free/${slug}`,
    },
  };
}

export default async function FreePage({ params }: IFreePageProps) {
  const { slug } = await params;
  const freeTool = await getFreeData(slug);

  if (!freeTool) {
    notFound();
  }

  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-4xl font-bold mb-6">{freeTool.h1}</h1>
      <p className="text-xl text-gray-600 mb-8">{freeTool.intro}</p>
      <div className="bg-gray-50 p-8 rounded-lg">
        <p className="text-gray-700">Free tool content coming soon...</p>
      </div>
    </div>
  );
}
