import Link from 'next/link';
import { getAllComparisons } from '@/lib/seo/data-loader';
import { generateCategoryMetadata } from '@/lib/seo/metadata-factory';
import { clientEnv } from '@shared/config/env';

export const metadata = generateCategoryMetadata('compare');

export default async function CompareHubPage() {
  const comparisons = await getAllComparisons();

  return (
    <div className="container mx-auto px-4 py-12">
      <h1 className="text-4xl font-bold mb-6">Tool Comparisons</h1>
      <p className="text-xl text-secondary mb-12">
        Compare {clientEnv.APP_NAME} with other image enhancement tools
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {comparisons.map(comp => (
          <Link
            key={comp.slug}
            href={`/compare/${comp.slug}`}
            className="block p-6 bg-surface rounded-lg border border hover:border-accent hover:shadow-lg transition-all"
          >
            <h2 className="text-xl font-semibold mb-2">{comp.title}</h2>
            <p className="text-secondary text-sm">{comp.intro}</p>
            <span className="inline-block mt-4 text-accent text-sm font-medium">
              Read comparison →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
