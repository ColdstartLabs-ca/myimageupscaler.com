import Link from 'next/link';
import { getAllComparisonsExpandedPages } from '@/lib/seo/data-loader';
import { generateCategoryMetadata } from '@/lib/seo/metadata-factory';
import { clientEnv } from '@shared/config/env';

export const metadata = generateCategoryMetadata('comparisons-expanded');

export default async function ComparisonsExpandedHubPage() {
  const pages = await getAllComparisonsExpandedPages();

  return (
    <main className="min-h-screen bg-main px-4 py-12">
      <div className="mx-auto max-w-6xl">
        <h1 className="mb-4 text-4xl font-bold text-text-primary">Detailed Tool Comparisons</h1>
        <p className="mb-10 max-w-3xl text-lg text-text-secondary">
          Compare {clientEnv.APP_NAME} with image upscaling methods, models, and workflows using
          detailed technical breakdowns.
        </p>

        <div className="grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {pages.map(page => (
            <Link
              key={page.slug}
              href={`/comparisons-expanded/${page.slug}`}
              className="block rounded-lg border border-border bg-surface p-6 transition-all hover:border-accent hover:shadow-lg"
            >
              <h2 className="mb-2 text-xl font-semibold text-text-primary">{page.title}</h2>
              <p className="text-sm leading-relaxed text-text-secondary">{page.intro}</p>
              <span className="mt-4 inline-block text-sm font-medium text-accent">
                Read detailed comparison →
              </span>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
