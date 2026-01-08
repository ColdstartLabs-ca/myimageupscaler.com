import { Metadata } from 'next';
import interactiveToolsData from '@/app/seo/data/interactive-tools.json';
import { InteractiveToolPageTemplate } from '@/app/(pseo)/_components/pseo/templates/InteractiveToolPageTemplate';
import { SchemaMarkup } from '@/app/(pseo)/_components/seo/SchemaMarkup';
import { generateToolSchema } from '@/lib/seo/schema-generator';
import { clientEnv } from '@shared/config/env';
import type { IToolPage, IPSEODataFile } from '@/lib/seo/pseo-types';

const toolsData = interactiveToolsData as IPSEODataFile<IToolPage>;

// Bulk Image Resizer slug
const BULK_RESIZER_SLUG = 'bulk-image-resizer';

export async function generateMetadata(): Promise<Metadata> {
  const tool = toolsData.pages.find(p => p.slug === BULK_RESIZER_SLUG);

  if (!tool) return {};

  return {
    title: tool.metaTitle,
    description: tool.metaDescription,
    keywords: [tool.primaryKeyword, ...tool.secondaryKeywords].join(', '),
    openGraph: {
      title: tool.metaTitle,
      description: tool.metaDescription,
      type: 'website',
      url: `${clientEnv.BASE_URL}/tools/resize/bulk-image-resizer`,
    },
    twitter: {
      card: 'summary_large_image',
      title: tool.metaTitle,
      description: tool.metaDescription,
    },
    alternates: {
      canonical: `${clientEnv.BASE_URL}/tools/resize/bulk-image-resizer`,
    },
  };
}

export default async function BulkImageResizerPage() {
  const tool = toolsData.pages.find(p => p.slug === BULK_RESIZER_SLUG);

  if (!tool) {
    // Return a not found page if tool data doesn't exist yet
    return (
      <div className="min-h-screen bg-base flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-text-primary mb-2">Page Not Found</h1>
          <p className="text-text-secondary">The bulk image resizer page data is not configured.</p>
        </div>
      </div>
    );
  }

  const schema = generateToolSchema(tool);

  return (
    <>
      <SchemaMarkup schema={schema} />
      <InteractiveToolPageTemplate data={tool} />
    </>
  );
}
