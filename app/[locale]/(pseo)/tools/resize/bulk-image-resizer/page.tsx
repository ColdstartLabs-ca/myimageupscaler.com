import { InteractiveToolPageTemplate } from '@/app/(pseo)/_components/pseo/templates/InteractiveToolPageTemplate';
import { SchemaMarkup } from '@/app/(pseo)/_components/seo/SchemaMarkup';
import type { Locale } from '@/i18n/config';
import type { IBenefit, IFAQ, IFeature, IHowItWorksStep, IUseCase } from '@/lib/seo/pseo-types';
import { generateToolSchema } from '@/lib/seo/schema-generator';
import { getCanonicalUrl } from '@/lib/seo/hreflang-generator';
import { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';

// Bulk Image Resizer slug
const BULK_RESIZER_SLUG = 'bulk-image-resizer';

interface IPageProps {
  params: Promise<{ locale: Locale }>;
}

export async function generateMetadata({ params }: IPageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations('interactive-tools');

  // Get the pages array and find the tool by slug
  const pages = t.raw('pages') as Array<{ slug: string } & Record<string, unknown>>;
  const toolData = pages?.find((p: { slug: string }) => p.slug === BULK_RESIZER_SLUG);
  if (!toolData) return {};

  const tool = {
    metaTitle: toolData.metaTitle as string,
    metaDescription: toolData.metaDescription as string,
    primaryKeyword: toolData.primaryKeyword as string,
    secondaryKeywords: Array.isArray(toolData.secondaryKeywords)
      ? (toolData.secondaryKeywords as unknown as string[])
      : [],
    toolName: toolData.toolName as string,
    description: toolData.description as string,
    features: Array.isArray(toolData.features) ? (toolData.features as unknown as IFeature[]) : [],
  };

  const canonicalUrl = getCanonicalUrl('/tools/resize/bulk-image-resizer', locale);

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

export default async function BulkImageResizerPage({ params }: IPageProps) {
  const { locale } = await params;
  const t = await getTranslations('interactive-tools');

  // Get the pages array and find the tool by slug
  const pages = t.raw('pages') as Array<{ slug: string } & Record<string, unknown>>;
  const toolData = pages?.find((p: { slug: string }) => p.slug === BULK_RESIZER_SLUG);
  if (!toolData) {
    notFound();
  }

  // Build tool data from translations
  const tool = {
    slug: BULK_RESIZER_SLUG,
    title: toolData.title as string,
    metaTitle: toolData.metaTitle as string,
    metaDescription: toolData.metaDescription as string,
    h1: toolData.h1 as string,
    intro: toolData.intro as string,
    primaryKeyword: toolData.primaryKeyword as string,
    secondaryKeywords: Array.isArray(toolData.secondaryKeywords)
      ? (toolData.secondaryKeywords as unknown as string[])
      : [],
    lastUpdated: toolData.lastUpdated as string,
    category: 'tools' as const,
    toolName: toolData.toolName as string,
    toolComponent: toolData.toolComponent as string,
    description: toolData.description as string,
    maxFiles: Number(toolData.maxFiles) || 20,
    acceptedFormats: Array.isArray(toolData.acceptedFormats)
      ? (toolData.acceptedFormats as unknown as string[])
      : [],
    features: Array.isArray(toolData.features) ? (toolData.features as unknown as IFeature[]) : [],
    useCases: Array.isArray(toolData.useCases) ? (toolData.useCases as unknown as IUseCase[]) : [],
    benefits: Array.isArray(toolData.benefits) ? (toolData.benefits as unknown as IBenefit[]) : [],
    howItWorks: Array.isArray(toolData.howItWorks)
      ? (toolData.howItWorks as unknown as IHowItWorksStep[])
      : [],
    faq: Array.isArray(toolData.faq) ? (toolData.faq as unknown as IFAQ[]) : [],
    limitations: Array.isArray(toolData.limitations)
      ? (toolData.limitations as unknown as string[])
      : [],
    outputFormat: toolData.outputFormat as string,
    relatedTools: Array.isArray(toolData.relatedTools)
      ? (toolData.relatedTools as unknown as string[])
      : [],
    relatedGuides: Array.isArray(toolData.relatedGuides)
      ? (toolData.relatedGuides as unknown as string[])
      : [],
    ctaText: toolData.ctaText as string,
    ctaUrl: toolData.ctaUrl as string,
  };

  const schema = generateToolSchema(tool, locale);

  return (
    <>
      <SchemaMarkup schema={schema} />
      <InteractiveToolPageTemplate data={tool} />
    </>
  );
}
