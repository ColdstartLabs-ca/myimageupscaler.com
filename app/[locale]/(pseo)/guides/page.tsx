import Link from 'next/link';
import { getAllGuides } from '@/lib/seo/data-loader';
import { generateCategoryMetadata } from '@/lib/seo/metadata-factory';

export const metadata = generateCategoryMetadata('guides');

export default async function GuidesHubPage() {
  const guides = await getAllGuides();

  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-4xl font-bold mb-6">Guides & Tutorials</h1>
      <p className="text-xl text-text-secondary mb-12">
        Learn how to get the most out of your images
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {guides.map(guide => (
          <Link
            key={guide.slug}
            href={`/guides/${guide.slug}`}
            className="block p-6 bg-surface rounded-lg border border hover:border-accent hover:shadow-lg transition-all"
          >
            <h2 className="text-xl font-semibold mb-2">{guide.title}</h2>
            <p className="text-gray-600 text-sm">{guide.description}</p>
            <span className="inline-block mt-4 text-accent text-sm font-medium">Read guide →</span>
          </Link>
        ))}
      </div>
    </div>
  );
}
