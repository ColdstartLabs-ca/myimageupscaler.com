import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import interactiveToolsData from '@/app/seo/data/interactive-tools.json';
import { InteractiveToolPageTemplate } from '@/components/pseo/templates/InteractiveToolPageTemplate';
import { SchemaMarkup } from '@/components/seo/SchemaMarkup';
import type { IToolPage, IPSEODataFile } from '@/lib/seo/pseo-types';

const toolsData = interactiveToolsData as IPSEODataFile<IToolPage>;

// Conversion tool slugs from interactive-tools.json
const CONVERSION_SLUGS = [
  'png-to-jpg',
  'jpg-to-png',
  'webp-to-jpg',
  'webp-to-png',
  'jpg-to-webp',
  'png-to-webp',
];

interface IPageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return CONVERSION_SLUGS.map(slug => ({ slug }));
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
      url: `https://pixelperfect.ai/tools/convert/${slug}`,
    },
    twitter: {
      card: 'summary_large_image',
      title: tool.metaTitle,
      description: tool.metaDescription,
    },
    alternates: {
      canonical: `https://pixelperfect.ai/tools/convert/${slug}`,
    },
  };
}

export default async function ConversionToolPage({ params }: IPageProps) {
  const { slug } = await params;

  // Only allow conversion tool slugs
  if (!CONVERSION_SLUGS.includes(slug)) {
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
