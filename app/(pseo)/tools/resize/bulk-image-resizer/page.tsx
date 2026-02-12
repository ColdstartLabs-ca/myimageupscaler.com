import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import bulkToolsData from '@/app/seo/data/bulk-tools.json';
import { InteractiveToolPageTemplate } from '@/app/(pseo)/_components/pseo/templates/InteractiveToolPageTemplate';
import { SchemaMarkup } from '@/app/(pseo)/_components/seo/SchemaMarkup';
import { generateToolSchema } from '@/lib/seo/schema-generator';
import { clientEnv } from '@shared/config/env';
import type { IToolPage, IBulkToolPage, IPSEODataFile } from '@/lib/seo/pseo-types';

const bulkData = bulkToolsData as unknown as IPSEODataFile<IBulkToolPage>;

// Bulk Image Resizer slug
const BULK_RESIZER_SLUG = 'bulk-image-resizer';

// Force static rendering for Cloudflare Workers 10ms CPU limit
// Prevents SSR timeouts on Googlebot requests
export const dynamic = 'force-static';
export const revalidate = 86400; // 24 hours

function getToolData(): IBulkToolPage | undefined {
  return bulkData.pages.find(p => p.slug === BULK_RESIZER_SLUG);
}

export async function generateMetadata(): Promise<Metadata> {
  const tool = getToolData();

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
  const tool = getToolData();

  if (!tool) {
    notFound();
  }

  // Cast to IToolPage for the template - IBulkToolPage has all required fields
  const toolAsPage = { ...tool, category: 'tools' as const } as unknown as IToolPage;
  const schema = generateToolSchema(toolAsPage);

  return (
    <>
      <SchemaMarkup schema={schema} />
      <InteractiveToolPageTemplate data={toolAsPage} />
    </>
  );
}
