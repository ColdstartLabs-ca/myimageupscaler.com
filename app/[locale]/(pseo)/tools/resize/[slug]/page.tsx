import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import interactiveToolsData from '@/app/seo/data/interactive-tools.json';
import { InteractiveToolPageTemplate } from '@/app/(pseo)/_components/pseo/templates/InteractiveToolPageTemplate';
import { SchemaMarkup } from '@/app/(pseo)/_components/seo/SchemaMarkup';
import { generateToolSchema } from '@/lib/seo/schema-generator';
import { clientEnv } from '@shared/config/env';
import type { IToolPage, IPSEODataFile } from '@/lib/seo/pseo-types';

const toolsData = interactiveToolsData as IPSEODataFile<IToolPage>;

// Resize tool slugs from interactive-tools.json
const RESIZE_SLUGS = [
  'image-resizer',
  'resize-image-for-instagram',
  'resize-image-for-youtube',
  'resize-image-for-facebook',
  'resize-image-for-twitter',
  'resize-image-for-linkedin',
];

interface IPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return RESIZE_SLUGS.map(slug => ({ slug }));
}

export async function generateMetadata({ params }: IPageProps): Promise<Metadata> {
  const { slug } = await params;
  const tool = toolsData.pages.find(p => p.slug === slug);

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

  const tool = toolsData.pages.find(p => p.slug === slug);

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
