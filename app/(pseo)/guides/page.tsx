import { Metadata } from 'next';
import Link from 'next/link';
import { getAllGuides } from '@/lib/seo/data-loader';

export const metadata: Metadata = {
  title: 'Image Enhancement Guides & Tutorials | PixelPerfect',
  description:
    'Learn how to enhance, upscale, and optimize your images with our comprehensive guides and tutorials.',
  alternates: {
    canonical: 'https://pixelperfect.app/guides',
  },
};

export default async function GuidesHubPage() {
  const guides = await getAllGuides();

  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-4xl font-bold mb-6">Guides & Tutorials</h1>
      <p className="text-xl text-gray-600 mb-12">Learn how to get the most out of your images</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {guides.map(guide => (
          <Link
            key={guide.slug}
            href={`/guides/${guide.slug}`}
            className="block p-6 bg-white rounded-lg border border-gray-200 hover:border-blue-500 hover:shadow-lg transition-all"
          >
            <h2 className="text-xl font-semibold mb-2">{guide.title}</h2>
            <p className="text-gray-600 text-sm">{guide.description}</p>
            <span className="inline-block mt-4 text-blue-600 text-sm font-medium">
              Read guide →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
