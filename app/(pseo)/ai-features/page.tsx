import Link from 'next/link';
import { getAllAIFeaturePages } from '@/lib/seo/data-loader';
import { generateCategoryMetadata } from '@/lib/seo/metadata-factory';

export const metadata = generateCategoryMetadata('ai-features');

export default async function AIFeaturesHubPage() {
  const pages = await getAllAIFeaturePages();

  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-4xl font-bold mb-6">AI Enhancement Features</h1>
      <p className="text-xl text-text-secondary mb-12">
        Advanced AI-powered features for intelligent image enhancement
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {pages.map(page => (
          <Link
            key={page.slug}
            href={`/ai-features/${page.slug}`}
            className="block p-6 bg-surface rounded-lg border border hover:border-accent hover:shadow-lg transition-all"
          >
            <h2 className="text-xl font-semibold mb-2">{page.title}</h2>
            <p className="text-gray-600 text-sm">{page.intro?.substring(0, 150)}...</p>
            <span className="inline-block mt-4 text-accent text-sm font-medium">
              Learn more &rarr;
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
