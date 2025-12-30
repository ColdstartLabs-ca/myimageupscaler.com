import Link from 'next/link';
import { getAllAlternatives } from '@/lib/seo/data-loader';
import { generateCategoryMetadata } from '@/lib/seo/metadata-factory';

export const metadata = generateCategoryMetadata('alternatives');

export default async function AlternativesHubPage() {
  const alternatives = await getAllAlternatives();

  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-4xl font-bold mb-6">Image Upscaler Alternatives</h1>
      <p className="text-xl text-text-secondary mb-12">
        Find the best image enhancement tool for your needs
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {alternatives.map(alt => (
          <Link
            key={alt.slug}
            href={`/alternatives/${alt.slug}`}
            className="block p-6 bg-surface rounded-lg border border hover:border-accent hover:shadow-lg transition-all"
          >
            <h2 className="text-xl font-semibold mb-2">{alt.title}</h2>
            <p className="text-gray-600 text-sm">{alt.description}</p>
            <span className="inline-block mt-4 text-accent text-sm font-medium">
              View alternatives →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
