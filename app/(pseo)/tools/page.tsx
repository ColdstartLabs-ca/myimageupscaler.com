import { Metadata } from 'next';
import Link from 'next/link';
import { getAllTools } from '@/lib/seo/data-loader';

export const metadata: Metadata = {
  title: 'AI Image Tools - Upscaler, Enhancer & More | PixelPerfect',
  description:
    'Discover our suite of AI-powered image tools. Upscale, enhance, restore, and optimize your photos with cutting-edge technology. Free to try.',
  alternates: {
    canonical: 'https://pixelperfect.app/tools',
  },
};

export default async function ToolsHubPage() {
  const tools = await getAllTools();

  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-4xl font-bold mb-6">AI Image Tools</h1>
      <p className="text-xl text-gray-600 mb-12">
        Professional-grade AI tools for every image enhancement need
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {tools.map(tool => (
          <Link
            key={tool.slug}
            href={`/tools/${tool.slug}`}
            className="block p-6 bg-white rounded-lg border border-gray-200 hover:border-blue-500 hover:shadow-lg transition-all"
          >
            <h2 className="text-xl font-semibold mb-2">{tool.title}</h2>
            <p className="text-gray-600 text-sm">{tool.description}</p>
            <span className="inline-block mt-4 text-blue-600 text-sm font-medium">
              Learn more →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
