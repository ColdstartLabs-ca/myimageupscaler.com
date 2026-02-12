import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import interactiveToolsData from '@/app/seo/data/interactive-tools.json';
import bulkToolsData from '@/app/seo/data/bulk-tools.json';
import socialMediaResizeData from '@/app/seo/data/social-media-resize.json';
import { InteractiveToolPageTemplate } from '@/app/(pseo)/_components/pseo/templates/InteractiveToolPageTemplate';
import { SchemaMarkup } from '@/app/(pseo)/_components/seo/SchemaMarkup';
import { generateToolSchema } from '@/lib/seo/schema-generator';
import { clientEnv } from '@shared/config/env';
import type { IToolPage, IBulkToolPage, IPSEODataFile } from '@/lib/seo/pseo-types';

const toolsData = interactiveToolsData as IPSEODataFile<IToolPage>;
const bulkData = bulkToolsData as unknown as IPSEODataFile<IBulkToolPage>;
const socialData = socialMediaResizeData as unknown as IPSEODataFile<IToolPage>;

// Resize tool slugs from interactive-tools.json and bulk-tools.json
const RESIZE_SLUGS = [
  'image-resizer',
  'resize-image-for-instagram',
  'resize-image-for-youtube',
  'resize-image-for-facebook',
  'resize-image-for-twitter',
  'resize-image-for-linkedin',
  'bulk-image-resizer',
];

function findToolBySlug(slug: string): IToolPage | null {
  const tool = toolsData.pages.find(p => p.slug === slug);
  if (tool) return tool;
  const bulkTool = bulkData.pages.find(p => p.slug === slug);
  if (bulkTool) return { ...bulkTool, category: 'tools' as const } as unknown as IToolPage;
  const socialTool = socialData.pages.find(p => p.slug === slug);
  if (socialTool) return socialTool;
  return null;
}

// Force static rendering for Cloudflare Workers 10ms CPU limit
// Prevents SSR timeouts on Googlebot requests
export const dynamic = 'force-static';
export const revalidate = 86400; // 24 hours

interface IPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return RESIZE_SLUGS.map(slug => ({ slug }));
}

export async function generateMetadata({ params }: IPageProps): Promise<Metadata> {
  const { slug } = await params;
  const tool = findToolBySlug(slug);

  if (!tool) return {};

  return {
    title: tool.metaTitle,
    description: tool.metaDescription,
    keywords: [tool.primaryKeyword, ...tool.secondaryKeywords].join(', '),
    openGraph: {
      title: tool.metaTitle,
      description: tool.metaDescription,
      type: 'website',
      url: `${clientEnv.BASE_URL}/tools/resize/${slug}`,
    },
    twitter: {
      card: 'summary_large_image',
      title: tool.metaTitle,
      description: tool.metaDescription,
    },
    alternates: {
      canonical: `${clientEnv.BASE_URL}/tools/resize/${slug}`,
    },
  };
}

export default async function ResizeToolPage({ params }: IPageProps) {
  const { slug } = await params;

  // Only allow resize tool slugs
  if (!RESIZE_SLUGS.includes(slug)) {
    notFound();
  }

  const tool = findToolBySlug(slug);

  if (!tool) {
    notFound();
  }

  const schema = generateToolSchema(tool);

  return (
    <>
      <SchemaMarkup schema={schema} />
      <InteractiveToolPageTemplate data={tool} />
    </>
  );
}
