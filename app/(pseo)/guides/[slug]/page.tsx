import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getGuideData, getAllGuideSlugs } from '@/lib/seo/data-loader';

interface IGuidePageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const slugs = await getAllGuideSlugs();
  return slugs.map(slug => ({ slug }));
}

export async function generateMetadata({ params }: IGuidePageProps): Promise<Metadata> {
  const { slug } = await params;
  const guide = await getGuideData(slug);

  if (!guide) return {};

  return {
    title: guide.metaTitle,
    description: guide.metaDescription,
    keywords: guide.secondaryKeywords.join(', '),
    alternates: {
      canonical: `https://pixelperfect.app/guides/${slug}`,
    },
  };
}

export default async function GuidePage({ params }: IGuidePageProps) {
  const { slug } = await params;
  const guide = await getGuideData(slug);

  if (!guide) {
    notFound();
  }

  return (
    <div className="container mx-auto px-4 py-12 max-w-4xl">
      <h1 className="text-4xl font-bold mb-6">{guide.h1}</h1>
      <p className="text-xl text-gray-600 mb-8">{guide.intro}</p>
      <div className="prose prose-lg max-w-none">
        <p>Guide content coming soon...</p>
      </div>
    </div>
  );
}
