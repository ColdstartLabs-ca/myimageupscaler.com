import { Metadata } from 'next';
import Link from 'next/link';
import { getAllComparisons } from '@/lib/seo/data-loader';

export const metadata: Metadata = {
  title: 'AI Image Upscaler Comparisons | PixelPerfect',
  description:
    'Compare PixelPerfect with other AI image upscaling tools. Find the best solution for your needs.',
  alternates: {
    canonical: 'https://pixelperfect.app/compare',
  },
};

export default async function CompareHubPage() {
  const comparisons = await getAllComparisons();

  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-4xl font-bold mb-6">Tool Comparisons</h1>
      <p className="text-xl text-gray-600 mb-12">
        Compare PixelPerfect with other image enhancement tools
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {comparisons.map(comp => (
          <Link
            key={comp.slug}
            href={`/compare/${comp.slug}`}
            className="block p-6 bg-white rounded-lg border border-gray-200 hover:border-blue-500 hover:shadow-lg transition-all"
          >
            <h2 className="text-xl font-semibold mb-2">{comp.title}</h2>
            <p className="text-gray-600 text-sm">{comp.intro}</p>
            <span className="inline-block mt-4 text-blue-600 text-sm font-medium">
              Read comparison →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
