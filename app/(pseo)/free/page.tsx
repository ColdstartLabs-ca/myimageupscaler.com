import { Metadata } from 'next';
import Link from 'next/link';
import { getAllFreeTools } from '@/lib/seo/data-loader';

export const metadata: Metadata = {
  title: 'Free AI Image Tools | PixelPerfect',
  description:
    'Free AI image upscaling and enhancement tools. No credit card required. Try professional image tools for free.',
  alternates: {
    canonical: 'https://pixelperfect.app/free',
  },
};

export default async function FreeHubPage() {
  const freeTools = await getAllFreeTools();

  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-4xl font-bold mb-6">Free AI Image Tools</h1>
      <p className="text-xl text-gray-600 mb-12">
        Professional AI tools - Free to use, no credit card required
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {freeTools.map(tool => (
          <Link
            key={tool.slug}
            href={`/free/${tool.slug}`}
            className="block p-6 bg-white rounded-lg border border-gray-200 hover:border-blue-500 hover:shadow-lg transition-all"
          >
            <h2 className="text-xl font-semibold mb-2">{tool.title}</h2>
            <p className="text-gray-600 text-sm">{tool.description}</p>
            <span className="inline-block mt-4 text-green-600 text-sm font-medium">Try free →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
