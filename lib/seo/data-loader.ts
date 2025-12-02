/**
 * pSEO Data Loader Module
 * Based on PRD-PSEO-02 Section 4: Data Loading Architecture
 * Uses React cache for deduplication and memoization
 */

import { cache } from 'react';
import { keywordPageMappings } from './keyword-mappings';
import type {
  IToolPage,
  IFormatPage,
  IScalePage,
  IUseCasePage,
  IComparisonPage,
  IAlternativePage,
  IGuidePage,
  IFreePage,
  PSEOPage,
} from './pseo-types';

/**
 * Generate page data from keyword mappings
 * This is a temporary implementation until JSON data files are created
 */
function generatePageFromMapping(mapping: (typeof keywordPageMappings)[number]): Partial<PSEOPage> {
  const category = mapping.canonicalUrl.split('/')[1] as PSEOPage['category'];
  const slug = mapping.canonicalUrl.split('/')[2];

  return {
    slug,
    title: mapping.primaryKeyword
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' '),
    metaTitle: `${mapping.primaryKeyword
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' ')} | PixelPerfect`,
    metaDescription: `Professional ${mapping.primaryKeyword}. ${mapping.intent} solution with AI-powered technology. Try free.`,
    h1: mapping.primaryKeyword
      .split(' ')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1))
      .join(' '),
    intro: `Transform your images with our ${mapping.primaryKeyword} tool.`,
    primaryKeyword: mapping.primaryKeyword,
    secondaryKeywords: mapping.secondaryKeywords,
    lastUpdated: new Date().toISOString(),
    category,
  };
}

// Tool Pages
export const getAllToolSlugs = cache(async (): Promise<string[]> => {
  const tools = keywordPageMappings.filter(m => m.canonicalUrl.startsWith('/tools/'));
  return tools.map(t => t.canonicalUrl.split('/')[2]);
});

export const getToolData = cache(async (slug: string): Promise<IToolPage | null> => {
  const mapping = keywordPageMappings.find(m => m.canonicalUrl === `/tools/${slug}`);
  if (!mapping) return null;

  const base = generatePageFromMapping(mapping);
  return {
    ...base,
    category: 'tools',
    toolName: base.title!,
    description: base.intro!,
    features: [],
    useCases: [],
    benefits: [],
    howItWorks: [],
    faq: [],
    relatedTools: [],
    relatedGuides: [],
    ctaText: 'Try Now Free',
    ctaUrl: '/upscaler',
  } as IToolPage;
});

export const getAllTools = cache(async (): Promise<IToolPage[]> => {
  const slugs = await getAllToolSlugs();
  const tools = await Promise.all(slugs.map(slug => getToolData(slug)));
  return tools.filter((t): t is IToolPage => t !== null);
});

// Format Pages
export const getAllFormatSlugs = cache(async (): Promise<string[]> => {
  const formats = keywordPageMappings.filter(m => m.canonicalUrl.startsWith('/formats/'));
  return formats.map(f => f.canonicalUrl.split('/')[2]);
});

export const getFormatData = cache(async (slug: string): Promise<IFormatPage | null> => {
  const mapping = keywordPageMappings.find(m => m.canonicalUrl === `/formats/${slug}`);
  if (!mapping) return null;

  const base = generatePageFromMapping(mapping);
  return {
    ...base,
    category: 'formats',
    formatName: base.title!,
    extension: slug.replace('upscale-', '').replace('-images', ''),
    description: base.intro!,
    characteristics: [],
    useCases: [],
    bestPractices: [],
    faq: [],
    relatedFormats: [],
    relatedGuides: [],
  } as IFormatPage;
});

export const getAllFormats = cache(async (): Promise<IFormatPage[]> => {
  const slugs = await getAllFormatSlugs();
  const formats = await Promise.all(slugs.map(slug => getFormatData(slug)));
  return formats.filter((f): f is IFormatPage => f !== null);
});

// Comparison Pages
export const getAllComparisonSlugs = cache(async (): Promise<string[]> => {
  const comparisons = keywordPageMappings.filter(m => m.canonicalUrl.startsWith('/compare/'));
  return comparisons.map(c => c.canonicalUrl.split('/')[2]);
});

export const getComparisonData = cache(async (slug: string): Promise<IComparisonPage | null> => {
  const mapping = keywordPageMappings.find(m => m.canonicalUrl === `/compare/${slug}`);
  if (!mapping) return null;

  const base = generatePageFromMapping(mapping);
  return {
    ...base,
    category: 'compare',
    comparisonType: slug.includes('vs') ? 'vs' : 'best-of',
    products: [],
    criteria: [],
    faq: [],
    relatedComparisons: [],
  } as IComparisonPage;
});

export const getAllComparisons = cache(async (): Promise<IComparisonPage[]> => {
  const slugs = await getAllComparisonSlugs();
  const comparisons = await Promise.all(slugs.map(slug => getComparisonData(slug)));
  return comparisons.filter((c): c is IComparisonPage => c !== null);
});

// Use Case Pages
export const getAllUseCaseSlugs = cache(async (): Promise<string[]> => {
  const useCases = keywordPageMappings.filter(m => m.canonicalUrl.startsWith('/use-cases/'));
  return useCases.map(u => u.canonicalUrl.split('/')[2]);
});

export const getUseCaseData = cache(async (slug: string): Promise<IUseCasePage | null> => {
  const mapping = keywordPageMappings.find(m => m.canonicalUrl === `/use-cases/${slug}`);
  if (!mapping) return null;

  const base = generatePageFromMapping(mapping);
  return {
    ...base,
    category: 'use-cases',
    industry: base.title!,
    description: base.intro!,
    challenges: [],
    solutions: [],
    results: [],
    faq: [],
    relatedTools: [],
    relatedGuides: [],
  } as IUseCasePage;
});

export const getAllUseCases = cache(async (): Promise<IUseCasePage[]> => {
  const slugs = await getAllUseCaseSlugs();
  const useCases = await Promise.all(slugs.map(slug => getUseCaseData(slug)));
  return useCases.filter((u): u is IUseCasePage => u !== null);
});

// Guide Pages
export const getAllGuideSlugs = cache(async (): Promise<string[]> => {
  const guides = keywordPageMappings.filter(m => m.canonicalUrl.startsWith('/guides/'));
  return guides.map(g => g.canonicalUrl.split('/')[2]);
});

export const getGuideData = cache(async (slug: string): Promise<IGuidePage | null> => {
  const mapping = keywordPageMappings.find(m => m.canonicalUrl === `/guides/${slug}`);
  if (!mapping) return null;

  const base = generatePageFromMapping(mapping);
  return {
    ...base,
    category: 'guides',
    guideType: slug.startsWith('how-to') ? 'how-to' : 'explainer',
    description: base.intro!,
    difficulty: 'beginner',
    steps: [],
    tips: [],
    faq: [],
    relatedGuides: [],
    relatedTools: [],
  } as IGuidePage;
});

export const getAllGuides = cache(async (): Promise<IGuidePage[]> => {
  const slugs = await getAllGuideSlugs();
  const guides = await Promise.all(slugs.map(slug => getGuideData(slug)));
  return guides.filter((g): g is IGuidePage => g !== null);
});

// Alternative Pages
export const getAllAlternativeSlugs = cache(async (): Promise<string[]> => {
  const alternatives = keywordPageMappings.filter(m => m.canonicalUrl.startsWith('/alternatives/'));
  return alternatives.map(a => a.canonicalUrl.split('/')[2]);
});

export const getAlternativeData = cache(async (slug: string): Promise<IAlternativePage | null> => {
  const mapping = keywordPageMappings.find(m => m.canonicalUrl === `/alternatives/${slug}`);
  if (!mapping) return null;

  const base = generatePageFromMapping(mapping);
  return {
    ...base,
    category: 'alternatives',
    originalTool: slug.replace('-alternatives', ''),
    description: base.intro!,
    alternatives: [],
    comparisonCriteria: [],
    faq: [],
    relatedAlternatives: [],
  } as IAlternativePage;
});

export const getAllAlternatives = cache(async (): Promise<IAlternativePage[]> => {
  const slugs = await getAllAlternativeSlugs();
  const alternatives = await Promise.all(slugs.map(slug => getAlternativeData(slug)));
  return alternatives.filter((a): a is IAlternativePage => a !== null);
});

// Scale Pages
export const getAllScaleSlugs = cache(async (): Promise<string[]> => {
  const scales = keywordPageMappings.filter(m => m.canonicalUrl.startsWith('/scale/'));
  return scales.map(s => s.canonicalUrl.split('/')[2]);
});

export const getScaleData = cache(async (slug: string): Promise<IScalePage | null> => {
  const mapping = keywordPageMappings.find(m => m.canonicalUrl === `/scale/${slug}`);
  if (!mapping) return null;

  const base = generatePageFromMapping(mapping);
  return {
    ...base,
    category: 'scale',
    resolution: slug.replace('upscale-', '').replace('-to-', ' '),
    description: base.intro!,
    useCases: [],
    benefits: [],
    faq: [],
    relatedScales: [],
    relatedGuides: [],
  } as IScalePage;
});

export const getAllScales = cache(async (): Promise<IScalePage[]> => {
  const slugs = await getAllScaleSlugs();
  const scales = await Promise.all(slugs.map(slug => getScaleData(slug)));
  return scales.filter((s): s is IScalePage => s !== null);
});

// Free Tool Pages
export const getAllFreeSlugs = cache(async (): Promise<string[]> => {
  const freeTools = keywordPageMappings.filter(m => m.canonicalUrl.startsWith('/free/'));
  return freeTools.map(f => f.canonicalUrl.split('/')[2]);
});

export const getFreeData = cache(async (slug: string): Promise<IFreePage | null> => {
  const mapping = keywordPageMappings.find(m => m.canonicalUrl === `/free/${slug}`);
  if (!mapping) return null;

  const base = generatePageFromMapping(mapping);
  return {
    ...base,
    category: 'free',
    toolName: base.title!,
    description: base.intro!,
    features: [],
    limitations: [],
    upgradePoints: [],
    faq: [],
    relatedFree: [],
    upgradePath: '/pricing',
  } as IFreePage;
});

export const getAllFreeTools = cache(async (): Promise<IFreePage[]> => {
  const slugs = await getAllFreeSlugs();
  const freeTools = await Promise.all(slugs.map(slug => getFreeData(slug)));
  return freeTools.filter((f): f is IFreePage => f !== null);
});

// Aggregate function for sitemap
export const getAllPSEOPages = cache(async (): Promise<PSEOPage[]> => {
  const [tools, formats, comparisons, useCases, guides, alternatives, scales, freeTools] =
    await Promise.all([
      getAllTools(),
      getAllFormats(),
      getAllComparisons(),
      getAllUseCases(),
      getAllGuides(),
      getAllAlternatives(),
      getAllScales(),
      getAllFreeTools(),
    ]);

  return [
    ...tools,
    ...formats,
    ...comparisons,
    ...useCases,
    ...guides,
    ...alternatives,
    ...scales,
    ...freeTools,
  ];
});
