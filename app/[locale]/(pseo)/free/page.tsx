import Link from 'next/link';
import { getAllFreeTools } from '@/lib/seo/data-loader';
import { generateCategoryMetadata } from '@/lib/seo/metadata-factory';

export const metadata = generateCategoryMetadata('free');

export default async function FreeHubPage() {
  const freeTools = await getAllFreeTools();

  return (
    <div className="container mx-auto px-4 py-12 bg-base min-h-screen">
      <h1 className="text-4xl font-bold mb-6 text-text-primary">Free AI Image Tools</h1>
      <p className="text-xl text-text-secondary mb-12">
        Professional AI tools - Free to try with 10 credits, no credit card required
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {freeTools.map(tool => (
          <Link
            key={tool.slug}
            href={`/free/${tool.slug}`}
            className="block p-6 glass-card rounded-lg border border-border hover:border-success hover:shadow-lg transition-all group"
          >
            <h2 className="text-xl font-semibold mb-2 text-text-primary group-hover:text-accent transition-colors">
              {tool.title}
            </h2>
            <p className="text-text-secondary text-sm">{tool.description}</p>
            <span className="inline-block mt-4 text-success text-sm font-medium group-hover:text-success/80 transition-colors">
              Try free →
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
