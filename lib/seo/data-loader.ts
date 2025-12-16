/**
 * pSEO Data Loader Module
 * Based on PRD-PSEO-02 Section 4: Data Loading Architecture
 * Uses React cache for deduplication and memoization
 */

import { cache } from 'react';
import { keywordPageMappings } from './keyword-mappings';
import toolsDataFile from '@/app/seo/data/tools.json';
import freeDataFile from '@/app/seo/data/free.json';
import scaleDataFile from '@/app/seo/data/scale.json';
import comparisonDataFile from '@/app/seo/data/comparison.json';
import guidesDataFile from '@/app/seo/data/guides.json';
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
  IPSEODataFile,
} from './pseo-types';

// Type-safe data imports
const toolsData = toolsDataFile as IPSEODataFile<IToolPage>;

/**
 * Generate fallback page data from keyword mappings
 * Used when JSON data file doesn't exist yet
 */
function generatePageFromMapping(mapping: (typeof keywordPageMappings)[number]): Partial<PSEOPage> {
  const category = mapping.canonicalUrl.split('/')[1] as PSEOPage['category'];
  const slug = mapping.canonicalUrl.split('/')[2];

  // Default FAQ to prevent empty schema
  const defaultFAQ = [
    {
      question: `What is ${mapping.primaryKeyword}?`,
      answer: `${mapping.primaryKeyword.charAt(0).toUpperCase() + mapping.primaryKeyword.slice(1)} is an AI-powered image enhancement tool that helps you improve image quality, resolution, and clarity instantly.`,
    },
    {
      question: 'Is it free to use?',
      answer:
        'Yes! PixelPerfect offers 10 free credits to get started. Each image enhancement uses 1 credit. For unlimited access, check our affordable premium plans.',
    },
    {
      question: 'How long does processing take?',
      answer:
        'Most images are processed in 30-60 seconds. Processing time may vary based on image size and enhancement level.',
    },
  ];

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
    faq: defaultFAQ,
  };
}

// Tool Pages
export const getAllToolSlugs = cache(async (): Promise<string[]> => {
  return toolsData.pages.map(page => page.slug);
});

export const getToolData = cache(async (slug: string): Promise<IToolPage | null> => {
  const tool = toolsData.pages.find(page => page.slug === slug);
  return tool || null;
});

export const getAllTools = cache(async (): Promise<IToolPage[]> => {
  return toolsData.pages;
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
  const comparisonData = comparisonDataFile as unknown as IPSEODataFile<IComparisonPage>;
  const page = comparisonData.pages.find(p => p.slug === slug);

  if (page) {
    return page;
  }

  // Fallback to mapping-based generation if not in JSON
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
  const guidesData = guidesDataFile as unknown as IPSEODataFile<IGuidePage>;
  const page = guidesData.pages.find(p => p.slug === slug);

  if (page) {
    return page;
  }

  // Fallback to mapping-based generation if not in JSON
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
  const scaleData = scaleDataFile as unknown as IPSEODataFile<IScalePage>;
  const page = scaleData.pages.find(p => p.slug === slug);

  if (page) {
    return page;
  }

  // Fallback to mapping-based generation if not in JSON
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
  const freeData = freeDataFile as unknown as IPSEODataFile<IFreePage>;
  const page = freeData.pages.find(p => p.slug === slug);

  if (page) {
    return page;
  }

  // Fallback to mapping-based generation if not in JSON
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
