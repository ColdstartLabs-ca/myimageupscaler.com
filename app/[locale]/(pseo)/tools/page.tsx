import Link from 'next/link';
import type { Metadata } from 'next';
import { getAllTools } from '@/lib/seo/data-loader';
import { generateCategoryMetadata } from '@/lib/seo/metadata-factory';
import { SeoMetaTags } from '@client/components/seo/SeoMetaTags';
import { HreflangLinks } from '@client/components/seo/HreflangLinks';
import type { Locale } from '@/i18n/config';

interface IToolsHubPageProps {
  params: Promise<{ locale: Locale }>;
}

export async function generateMetadata({ params }: IToolsHubPageProps): Promise<Metadata> {
  const { locale } = await params;
  return generateCategoryMetadata('tools', locale);
}

export default async function ToolsHubPage({ params }: IToolsHubPageProps) {
  const { locale } = await params;
  const tools = await getAllTools();

  return (
    <>
      {/* SEO meta tags for canonical URL and og:locale */}
      <SeoMetaTags path="/tools" locale={locale} />
      {/* Hreflang links for multi-language SEO */}
      <HreflangLinks path="/tools" category="tools" locale={locale} />
      <div className="container mx-auto px-4 py-12 bg-base min-h-screen">
        <h1 className="text-4xl font-bold mb-6 text-text-primary">AI Image Tools</h1>
        <p className="text-xl text-text-secondary mb-12">
          Professional-grade AI tools for every image enhancement need
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {tools.map(tool => (
            <Link
              key={tool.slug}
              href={`/${locale}/tools/${tool.slug}`}
              className="block p-6 glass-card rounded-lg border border-border hover:border-accent hover:shadow-lg transition-all group"
            >
              <h2 className="text-xl font-semibold mb-2 text-text-primary group-hover:text-accent transition-colors">
                {tool.title}
              </h2>
              <p className="text-text-secondary text-sm">{tool.description}</p>
              <span className="inline-block mt-4 text-accent text-sm font-medium group-hover:text-accent-hover transition-colors">
                Learn more →
              </span>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
