import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { generateToolSchema } from '@/lib/seo/schema-generator';
import { InteractiveToolPageTemplate } from '@/app/(pseo)/_components/pseo/templates/InteractiveToolPageTemplate';
import { SchemaMarkup } from '@/app/(pseo)/_components/seo/SchemaMarkup';
import { getCanonicalUrl } from '@/lib/seo/hreflang-generator';
import type {
  IFeature,
  IUseCase,
  IBenefit,
  IHowItWorksStep,
  IFAQ,
  IToolPage,
} from '@/lib/seo/pseo-types';
import type { Locale } from '@/i18n/config';
import { SUPPORTED_LOCALES } from '@/i18n/config';

// Compress tool slugs from interactive-tools.json
const COMPRESS_SLUGS = ['image-compressor', 'bulk-image-compressor'];

interface IPageProps {
  params: Promise<{ slug: string; locale: Locale }>;
}

export async function generateStaticParams() {
  return SUPPORTED_LOCALES.flatMap(locale => COMPRESS_SLUGS.map(slug => ({ slug, locale })));
}

export async function generateMetadata({ params }: IPageProps): Promise<Metadata> {
  const { slug, locale } = await params;
  const t = await getTranslations('interactive-tools');

  // Get the pages array and find the tool by slug
  const pages = t.raw('pages') as Array<{ slug: string } & Record<string, unknown>>;
  const toolData = pages?.find((p: { slug: string }) => p.slug === slug);
  if (!toolData) return {};

  const tool = {
    metaTitle: toolData.metaTitle as string,
    metaDescription: toolData.metaDescription as string,
    primaryKeyword: toolData.primaryKeyword as string,
    secondaryKeywords: Array.isArray(toolData.secondaryKeywords)
      ? (toolData.secondaryKeywords as string[])
      : [],
    toolName: toolData.toolName as string,
    description: toolData.description as string,
    features: Array.isArray(toolData.features) ? (toolData.features as IFeature[]) : [],
  };

  const canonicalUrl = getCanonicalUrl(`/tools/compress/${slug}`, locale);

  return {
    title: tool.metaTitle,
    description: tool.metaDescription,
    keywords: [tool.primaryKeyword, ...tool.secondaryKeywords].join(', '),
    openGraph: {
      title: tool.metaTitle,
      description: tool.metaDescription,
      type: 'website',
      url: canonicalUrl,
    },
    twitter: {
      card: 'summary_large_image',
      title: tool.metaTitle,
      description: tool.metaDescription,
    },
    alternates: {
      canonical: canonicalUrl,
    },
  };
}

export default async function CompressToolPage({ params }: IPageProps) {
  const { slug, locale } = await params;
  const t = await getTranslations('interactive-tools');

  // Only allow compress tool slugs
  if (!COMPRESS_SLUGS.includes(slug)) {
    notFound();
  }

  // Get the pages array and find the tool by slug
  const pages = t.raw('pages') as Array<{ slug: string } & Record<string, unknown>>;
  const toolData = pages?.find((p: { slug: string }) => p.slug === slug);
  if (!toolData) {
    notFound();
  }

  // Build tool data from translations - satisfies IToolPage interface
  const tool: IToolPage = {
    slug,
    title: toolData.title as string,
    metaTitle: toolData.metaTitle as string,
    metaDescription: toolData.metaDescription as string,
    h1: toolData.h1 as string,
    intro: toolData.intro as string,
    primaryKeyword: toolData.primaryKeyword as string,
    secondaryKeywords: Array.isArray(toolData.secondaryKeywords)
      ? (toolData.secondaryKeywords as string[])
      : [],
    lastUpdated: toolData.lastUpdated as string,
    category: 'tools',
    toolName: toolData.toolName as string,
    description: toolData.description as string,
    features: Array.isArray(toolData.features) ? (toolData.features as IFeature[]) : [],
    useCases: Array.isArray(toolData.useCases) ? (toolData.useCases as IUseCase[]) : [],
    benefits: Array.isArray(toolData.benefits) ? (toolData.benefits as IBenefit[]) : [],
    howItWorks: Array.isArray(toolData.howItWorks)
      ? (toolData.howItWorks as IHowItWorksStep[])
      : [],
    faq: Array.isArray(toolData.faq) ? (toolData.faq as IFAQ[]) : [],
    relatedTools: Array.isArray(toolData.relatedTools) ? (toolData.relatedTools as string[]) : [],
    relatedGuides: Array.isArray(toolData.relatedGuides)
      ? (toolData.relatedGuides as string[])
      : [],
    ctaText: toolData.ctaText as string,
    ctaUrl: toolData.ctaUrl as string,
    // Optional interactive tool fields
    isInteractive: true,
    toolComponent: toolData.toolComponent as string,
    maxFileSizeMB: Number(toolData.maxFileSizeMB) || undefined,
    acceptedFormats: Array.isArray(toolData.acceptedFormats)
      ? (toolData.acceptedFormats as string[])
      : [],
  };

  // Generate rich schema markup with @graph structure (SoftwareApplication + FAQPage + BreadcrumbList)
  const schema = generateToolSchema(tool, locale);

  return (
    <>
      <SchemaMarkup schema={schema} />
      <InteractiveToolPageTemplate data={tool} />
    </>
  );
}
