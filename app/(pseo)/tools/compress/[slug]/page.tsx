import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import interactiveToolsData from '@/app/seo/data/interactive-tools.json';
import { InteractiveToolPageTemplate } from '@/app/(pseo)/_components/pseo/templates/InteractiveToolPageTemplate';
import { SchemaMarkup } from '@/app/(pseo)/_components/seo/SchemaMarkup';
import { clientEnv } from '@shared/config/env';
import type { IToolPage, IPSEODataFile } from '@/lib/seo/pseo-types';

const toolsData = interactiveToolsData as IPSEODataFile<IToolPage>;

// Compress tool slugs from interactive-tools.json
const COMPRESS_SLUGS = ['image-compressor', 'bulk-image-compressor'];

// Force static rendering for Cloudflare Workers 10ms CPU limit
// Prevents SSR timeouts on Googlebot requests
export const dynamic = 'force-static';
export const revalidate = 86400; // 24 hours

interface IPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return COMPRESS_SLUGS.map(slug => ({ slug }));
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
      url: `${clientEnv.BASE_URL}/tools/compress/${slug}`,
    },
    twitter: {
      card: 'summary_large_image',
      title: tool.metaTitle,
      description: tool.metaDescription,
    },
    alternates: {
      canonical: `${clientEnv.BASE_URL}/tools/compress/${slug}`,
    },
  };
}

export default async function CompressToolPage({ params }: IPageProps) {
  const { slug } = await params;

  // Only allow compress tool slugs
  if (!COMPRESS_SLUGS.includes(slug)) {
    notFound();
  }

  const tool = toolsData.pages.find(p => p.slug === slug);

  if (!tool) {
    notFound();
  }

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: tool.toolName,
    description: tool.description,
    applicationCategory: 'MultimediaApplication',
    operatingSystem: 'Web Browser',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    featureList: tool.features.map(f => f.title).join(', '),
  };

  return (
    <>
      <SchemaMarkup schema={schema} />
      <InteractiveToolPageTemplate data={tool} />
    </>
  );
}
