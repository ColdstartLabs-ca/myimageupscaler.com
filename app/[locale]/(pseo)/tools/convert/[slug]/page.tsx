import { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import interactiveToolsData from '@/app/seo/data/interactive-tools.json';
import { InteractiveToolPageTemplate } from '@/app/(pseo)/_components/pseo/templates/InteractiveToolPageTemplate';
import { SchemaMarkup } from '@/app/(pseo)/_components/seo/SchemaMarkup';
import { generateToolSchema } from '@/lib/seo/schema-generator';
import { getCanonicalUrl } from '@/lib/seo/hreflang-generator';
import type {
  IFeature,
  IUseCase,
  IBenefit,
  IHowItWorksStep,
  IFAQ,
  IToolPage,
  IPSEODataFile,
} from '@/lib/seo/pseo-types';
import type { Locale } from '@/i18n/config';
import { SUPPORTED_LOCALES } from '@/i18n/config';
import {
  CONVERSION_SLUGS,
  LOCALIZED_INTERACTIVE_SLUGS,
  withCanonicalInteractiveToolRuntime,
} from '@/lib/seo/interactive-tool-routes';

const englishTools = interactiveToolsData as IPSEODataFile<IToolPage>;

function findEnglishConversionTool(slug: string): IToolPage | null {
  return englishTools.pages.find(page => page.slug === slug) ?? null;
}

function buildTranslatedTool(
  slug: string,
  toolData: { slug: string } & Record<string, unknown>
): IToolPage {
  return withCanonicalInteractiveToolRuntime<IToolPage>({
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
    toolComponent: toolData.toolComponent as string,
    toolConfig: toolData.toolConfig as IToolPage['toolConfig'],
    description: toolData.description as string,
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
    relatedTools: Array.isArray(toolData.relatedTools)
      ? (toolData.relatedTools as unknown as string[])
      : [],
    relatedGuides: Array.isArray(toolData.relatedGuides)
      ? (toolData.relatedGuides as unknown as string[])
      : [],
    ctaText: toolData.ctaText as string,
    ctaUrl: toolData.ctaUrl as string,
  });
}

interface IPageProps {
  params: Promise<{ slug: string; locale: Locale }>;
}

export async function generateStaticParams() {
  return SUPPORTED_LOCALES.flatMap(locale => CONVERSION_SLUGS.map(slug => ({ slug, locale })));
}

export async function generateMetadata({ params }: IPageProps): Promise<Metadata> {
  const { slug, locale } = await params;
  const t = await getTranslations('interactive-tools');

  const pages = t.raw('pages') as Array<{ slug: string } & Record<string, unknown>>;
  const toolData = pages?.find(page => page.slug === slug);
  const englishTool = findEnglishConversionTool(slug);
  const tool = toolData
    ? buildTranslatedTool(slug, toolData)
    : englishTool
      ? withCanonicalInteractiveToolRuntime(englishTool)
      : null;
  if (!tool) return {};

  const canonicalUrl = getCanonicalUrl(`/tools/convert/${slug}`, locale);
  const shouldNoindex =
    locale !== 'en' && !(LOCALIZED_INTERACTIVE_SLUGS as readonly string[]).includes(slug);

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
    ...(shouldNoindex ? { robots: { index: false, follow: true } } : {}),
  };
}

export default async function ConversionToolPage({ params }: IPageProps) {
  const { slug, locale } = await params;
  const t = await getTranslations('interactive-tools');

  if (!(CONVERSION_SLUGS as readonly string[]).includes(slug)) {
    notFound();
  }

  const pages = t.raw('pages') as Array<{ slug: string } & Record<string, unknown>>;
  const toolData = pages?.find(page => page.slug === slug);
  const englishTool = findEnglishConversionTool(slug);
  if (!toolData && !englishTool) {
    notFound();
  }

  const tool = toolData
    ? buildTranslatedTool(slug, toolData)
    : withCanonicalInteractiveToolRuntime(englishTool!);
  const canonicalPath = `/tools/convert/${slug}`;
  const schema = generateToolSchema(tool, locale, canonicalPath);

  return (
    <>
      <SchemaMarkup schema={schema} />
      <InteractiveToolPageTemplate data={tool} locale={locale} canonicalPath={canonicalPath} />
    </>
  );
}
