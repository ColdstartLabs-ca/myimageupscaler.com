/**
 * pSEO Data Loader Module
 * Based on PRD-PSEO-02 Section 4: Data Loading Architecture
 * Uses React cache for deduplication and memoization
 */

import { cache } from 'react';
import { keywordPageMappings } from './keyword-mappings';
import { clientEnv } from '@shared/config/env';
import { Locale } from '@/i18n/config';
import { isCategoryLocalized } from './localization-config';

const APP_NAME = clientEnv.APP_NAME;

import toolsDataFile from '@/app/seo/data/tools.json';
import freeDataFile from '@/app/seo/data/free.json';
import scaleDataFile from '@/app/seo/data/scale.json';
import comparisonDataFile from '@/app/seo/data/comparison.json';
import guidesDataFile from '@/app/seo/data/guides.json';
import formatsDataFile from '@/app/seo/data/formats.json';
import useCasesDataFile from '@/app/seo/data/use-cases.json';
import alternativesDataFile from '@/app/seo/data/alternatives.json';
import platformsDataFile from '@/app/seo/data/platforms.json';
import formatScaleDataFile from '@/app/seo/data/format-scale.json';
import platformFormatDataFile from '@/app/seo/data/platform-format.json';
import deviceUseDataFile from '@/app/seo/data/device-use.json';
import type {
  IToolPage,
  IFormatPage,
  IScalePage,
  IUseCasePage,
  IComparisonPage,
  IAlternativePage,
  IGuidePage,
  IFreePage,
  IPlatformPage,
  IContentTypePage,
  IAIFeaturePage,
  IFormatScalePage,
  IPlatformFormatPage,
  IDeviceUseCasePage,
  PSEOPage,
  IPSEODataFile,
} from './pseo-types';

// Type-safe data imports (English fallback)
const toolsData = toolsDataFile as IPSEODataFile<IToolPage>;
const formatsData = formatsDataFile as unknown as IPSEODataFile<IFormatPage>;
const useCasesData = useCasesDataFile as unknown as IPSEODataFile<IUseCasePage>;
const alternativesData = alternativesDataFile as unknown as IPSEODataFile<IAlternativePage>;
const formatScaleData = formatScaleDataFile as unknown as IPSEODataFile<IFormatScalePage>;
const platformFormatData = platformFormatDataFile as unknown as IPSEODataFile<IPlatformFormatPage>;
const deviceUseData = deviceUseDataFile as unknown as IPSEODataFile<IDeviceUseCasePage>;

/**
 * Load locale-specific pSEO data file
 * Falls back to English if locale file doesn't exist
 */
async function loadLocalizedPSEOData<T extends PSEOPage>(
  namespace: string,
  locale: Locale,
  fallbackData: IPSEODataFile<T>
): Promise<IPSEODataFile<T>> {
  if (locale === 'en') {
    return fallbackData;
  }

  try {
    // Dynamic import of locale-specific file
    const localizedData = await import(`@/locales/${locale}/${namespace}.json`);
    return localizedData.default as IPSEODataFile<T>;
  } catch {
    // Locale file doesn't exist, fall back to English
    return fallbackData;
  }
}

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
      answer: `Yes! ${APP_NAME} offers 10 free credits to get started. Each image enhancement uses 1 credit. For unlimited access, check our affordable premium plans.`,
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
      .join(' ')} | ${APP_NAME}`,
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
  return formatsData.pages.map(page => page.slug);
});

export const getFormatData = cache(async (slug: string): Promise<IFormatPage | null> => {
  const format = formatsData.pages.find(page => page.slug === slug);
  return format || null;
});

export const getAllFormats = cache(async (): Promise<IFormatPage[]> => {
  return formatsData.pages;
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
  return useCasesData.pages.map(page => page.slug);
});

export const getUseCaseData = cache(async (slug: string): Promise<IUseCasePage | null> => {
  const useCase = useCasesData.pages.find(page => page.slug === slug);
  return useCase || null;
});

export const getAllUseCases = cache(async (): Promise<IUseCasePage[]> => {
  return useCasesData.pages;
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
  return alternativesData.pages.map(page => page.slug);
});

export const getAlternativeData = cache(async (slug: string): Promise<IAlternativePage | null> => {
  const alternative = alternativesData.pages.find(page => page.slug === slug);
  return alternative || null;
});

export const getAllAlternatives = cache(async (): Promise<IAlternativePage[]> => {
  return alternativesData.pages;
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

// Platform Pages
const platformsData = platformsDataFile as IPSEODataFile<IPlatformPage>;

export const getAllPlatformSlugs = cache(async (): Promise<string[]> => {
  return platformsData.pages.map(page => page.slug);
});

export const getPlatformData = cache(async (slug: string): Promise<IPlatformPage | null> => {
  const platform = platformsData.pages.find(page => page.slug === slug);
  return platform || null;
});

export const getAllPlatforms = cache(async (): Promise<IPlatformPage[]> => {
  return platformsData.pages;
});

// Get tools that reference a specific blog post
export const getToolsForBlogPost = cache(async (blogSlug: string): Promise<IToolPage[]> => {
  return toolsData.pages.filter(tool => tool.relatedBlogPosts?.includes(blogSlug));
});

// Content-Type Pages
export const getAllContentSlugs = cache(async (): Promise<string[]> => {
  try {
    const data = await import('@/app/seo/data/content.json');
    return (data as unknown as IPSEODataFile<IContentTypePage>).pages.map(page => page.slug);
  } catch {
    return [];
  }
});

export const getContentData = cache(async (slug: string): Promise<IContentTypePage | null> => {
  try {
    const data = await import('@/app/seo/data/content.json');
    const contentData = data as unknown as IPSEODataFile<IContentTypePage>;
    return contentData.pages.find(page => page.slug === slug) || null;
  } catch {
    return null;
  }
});

export const getAllContentPages = cache(async (): Promise<IContentTypePage[]> => {
  try {
    const data = await import('@/app/seo/data/content.json');
    return (data as unknown as IPSEODataFile<IContentTypePage>).pages;
  } catch {
    return [];
  }
});

// AI Feature Pages
export const getAllAIFeatureSlugs = cache(async (): Promise<string[]> => {
  try {
    const data = await import('@/app/seo/data/ai-features.json');
    return (data as unknown as IPSEODataFile<IAIFeaturePage>).pages.map(page => page.slug);
  } catch {
    return [];
  }
});

export const getAIFeatureData = cache(async (slug: string): Promise<IAIFeaturePage | null> => {
  try {
    const data = await import('@/app/seo/data/ai-features.json');
    const aiFeatureData = data as unknown as IPSEODataFile<IAIFeaturePage>;
    return aiFeatureData.pages.find(page => page.slug === slug) || null;
  } catch {
    return null;
  }
});

export const getAllAIFeaturePages = cache(async (): Promise<IAIFeaturePage[]> => {
  try {
    const data = await import('@/app/seo/data/ai-features.json');
    return (data as unknown as IPSEODataFile<IAIFeaturePage>).pages;
  } catch {
    return [];
  }
});

// Format × Scale Multiplier Pages
export const getAllFormatScaleSlugs = cache(async (): Promise<string[]> => {
  return formatScaleData.pages.map(page => page.slug);
});

export const getFormatScaleData = cache(async (slug: string): Promise<IFormatScalePage | null> => {
  const page = formatScaleData.pages.find(p => p.slug === slug);
  return page || null;
});

export const getAllFormatScale = cache(async (): Promise<IFormatScalePage[]> => {
  return formatScaleData.pages;
});

// Platform × Format Multiplier Pages
export const getAllPlatformFormatSlugs = cache(async (): Promise<string[]> => {
  return platformFormatData.pages.map(page => page.slug);
});

export const getPlatformFormatData = cache(
  async (slug: string): Promise<IPlatformFormatPage | null> => {
    const page = platformFormatData.pages.find(p => p.slug === slug);
    return page || null;
  }
);

export const getAllPlatformFormat = cache(async (): Promise<IPlatformFormatPage[]> => {
  return platformFormatData.pages;
});

// Device × Use Case Multiplier Pages
export const getAllDeviceUseSlugs = cache(async (): Promise<string[]> => {
  return deviceUseData.pages.map(page => page.slug);
});

export const getDeviceUseData = cache(async (slug: string): Promise<IDeviceUseCasePage | null> => {
  const page = deviceUseData.pages.find(p => p.slug === slug);
  return page || null;
});

export const getAllDeviceUse = cache(async (): Promise<IDeviceUseCasePage[]> => {
  return deviceUseData.pages;
});

// Aggregate function for sitemap
export const getAllPSEOPages = cache(async (): Promise<PSEOPage[]> => {
  const [
    tools,
    formats,
    comparisons,
    useCases,
    guides,
    alternatives,
    scales,
    freeTools,
    platforms,
    contentPages,
    aiFeatures,
    formatScalePages,
    platformFormatPages,
    deviceUsePages,
  ] = await Promise.all([
    getAllTools(),
    getAllFormats(),
    getAllComparisons(),
    getAllUseCases(),
    getAllGuides(),
    getAllAlternatives(),
    getAllScales(),
    getAllFreeTools(),
    getAllPlatforms(),
    getAllContentPages(),
    getAllAIFeaturePages(),
    getAllFormatScale(),
    getAllPlatformFormat(),
    getAllDeviceUse(),
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
    ...platforms,
    ...contentPages,
    ...aiFeatures,
    ...formatScalePages,
    ...platformFormatPages,
    ...deviceUsePages,
  ];
});

// ============================================================================
// LOCALIZATION SUPPORT
// ============================================================================

/**
 * Result type for localized data loading
 */
export interface ILocalizedDataResult<T> {
  data: T | null;
  hasTranslation: boolean;
  isLocalizedCategory: boolean;
}

/**
 * Load tool data with localization check
 * Returns null for non-English locales if category is not localized
 */
export const getToolDataWithLocale = cache(
  async (slug: string, locale: Locale = 'en'): Promise<ILocalizedDataResult<IToolPage>> => {
    const isLocalized = isCategoryLocalized('tools', locale);

    // For non-localized categories in non-English locales, return null
    if (locale !== 'en' && !isLocalized) {
      return {
        data: null,
        hasTranslation: false,
        isLocalizedCategory: false,
      };
    }

    // Load locale-specific data file
    const localizedData = await loadLocalizedPSEOData<IToolPage>('tools', locale, toolsData);
    const data = localizedData.pages.find(page => page.slug === slug) || null;

    return {
      data,
      hasTranslation: data !== null,
      isLocalizedCategory: isLocalized,
    };
  }
);

/**
 * Load format data with localization check
 */
export const getFormatDataWithLocale = cache(
  async (slug: string, locale: Locale = 'en'): Promise<ILocalizedDataResult<IFormatPage>> => {
    const isLocalized = isCategoryLocalized('formats', locale);

    if (locale !== 'en' && !isLocalized) {
      return {
        data: null,
        hasTranslation: false,
        isLocalizedCategory: false,
      };
    }

    const localizedData = await loadLocalizedPSEOData<IFormatPage>('formats', locale, formatsData);
    const data = localizedData.pages.find(page => page.slug === slug) || null;

    return {
      data,
      hasTranslation: data !== null,
      isLocalizedCategory: isLocalized,
    };
  }
);

/**
 * Load comparison data with localization check
 */
export const getComparisonDataWithLocale = cache(
  async (slug: string, locale: Locale = 'en'): Promise<ILocalizedDataResult<IComparisonPage>> => {
    const isLocalized = isCategoryLocalized('compare', locale);

    if (locale !== 'en' && !isLocalized) {
      return {
        data: null,
        hasTranslation: false,
        isLocalizedCategory: false,
      };
    }

    const comparisonData = comparisonDataFile as unknown as IPSEODataFile<IComparisonPage>;
    const localizedData = await loadLocalizedPSEOData<IComparisonPage>(
      'compare',
      locale,
      comparisonData
    );
    const data = localizedData.pages.find(page => page.slug === slug) || null;

    return {
      data,
      hasTranslation: data !== null,
      isLocalizedCategory: isLocalized,
    };
  }
);

/**
 * Load alternative data with localization check
 */
export const getAlternativeDataWithLocale = cache(
  async (slug: string, locale: Locale = 'en'): Promise<ILocalizedDataResult<IAlternativePage>> => {
    const isLocalized = isCategoryLocalized('alternatives', locale);

    if (locale !== 'en' && !isLocalized) {
      return {
        data: null,
        hasTranslation: false,
        isLocalizedCategory: false,
      };
    }

    const localizedData = await loadLocalizedPSEOData<IAlternativePage>(
      'alternatives',
      locale,
      alternativesData
    );
    const data = localizedData.pages.find(page => page.slug === slug) || null;

    return {
      data,
      hasTranslation: data !== null,
      isLocalizedCategory: isLocalized,
    };
  }
);

/**
 * Load platform data with localization check
 */
export const getPlatformDataWithLocale = cache(
  async (slug: string, locale: Locale = 'en'): Promise<ILocalizedDataResult<IPlatformPage>> => {
    const isLocalized = isCategoryLocalized('platforms', locale);

    if (locale !== 'en' && !isLocalized) {
      return {
        data: null,
        hasTranslation: false,
        isLocalizedCategory: false,
      };
    }

    const localizedData = await loadLocalizedPSEOData<IPlatformPage>(
      'platforms',
      locale,
      platformsData
    );
    const data = localizedData.pages.find(page => page.slug === slug) || null;

    return {
      data,
      hasTranslation: data !== null,
      isLocalizedCategory: isLocalized,
    };
  }
);

/**
 * Load guide data with localization check
 */
export const getGuideDataWithLocale = cache(
  async (slug: string, locale: Locale = 'en'): Promise<ILocalizedDataResult<IGuidePage>> => {
    const isLocalized = isCategoryLocalized('guides', locale);

    if (locale !== 'en' && !isLocalized) {
      return {
        data: null,
        hasTranslation: false,
        isLocalizedCategory: false,
      };
    }

    const guidesData = guidesDataFile as unknown as IPSEODataFile<IGuidePage>;
    const localizedData = await loadLocalizedPSEOData<IGuidePage>('guides', locale, guidesData);
    const data = localizedData.pages.find(page => page.slug === slug) || null;

    return {
      data,
      hasTranslation: data !== null,
      isLocalizedCategory: isLocalized,
    };
  }
);

/**
 * Load use case data with localization check
 */
export const getUseCaseDataWithLocale = cache(
  async (slug: string, locale: Locale = 'en'): Promise<ILocalizedDataResult<IUseCasePage>> => {
    const isLocalized = isCategoryLocalized('use-cases', locale);

    if (locale !== 'en' && !isLocalized) {
      return {
        data: null,
        hasTranslation: false,
        isLocalizedCategory: false,
      };
    }

    const localizedData = await loadLocalizedPSEOData<IUseCasePage>(
      'use-cases',
      locale,
      useCasesData
    );
    const data = localizedData.pages.find(page => page.slug === slug) || null;

    return {
      data,
      hasTranslation: data !== null,
      isLocalizedCategory: isLocalized,
    };
  }
);

/**
 * Load scale data with localization check
 */
export const getScaleDataWithLocale = cache(
  async (slug: string, locale: Locale = 'en'): Promise<ILocalizedDataResult<IScalePage>> => {
    const isLocalized = isCategoryLocalized('scale', locale);

    if (locale !== 'en' && !isLocalized) {
      return {
        data: null,
        hasTranslation: false,
        isLocalizedCategory: false,
      };
    }

    const scaleData = scaleDataFile as unknown as IPSEODataFile<IScalePage>;
    const localizedData = await loadLocalizedPSEOData<IScalePage>('scale', locale, scaleData);
    const data = localizedData.pages.find(page => page.slug === slug) || null;

    return {
      data,
      hasTranslation: data !== null,
      isLocalizedCategory: isLocalized,
    };
  }
);

/**
 * Load free tool data with localization check
 */
export const getFreeDataWithLocale = cache(
  async (slug: string, locale: Locale = 'en'): Promise<ILocalizedDataResult<IFreePage>> => {
    const isLocalized = isCategoryLocalized('free', locale);

    if (locale !== 'en' && !isLocalized) {
      return {
        data: null,
        hasTranslation: false,
        isLocalizedCategory: false,
      };
    }

    const freeData = freeDataFile as unknown as IPSEODataFile<IFreePage>;
    const localizedData = await loadLocalizedPSEOData<IFreePage>('free', locale, freeData);
    const data = localizedData.pages.find(page => page.slug === slug) || null;

    return {
      data,
      hasTranslation: data !== null,
      isLocalizedCategory: isLocalized,
    };
  }
);

/**
 * Load format-scale data with localization check
 */
export const getFormatScaleDataWithLocale = cache(
  async (slug: string, locale: Locale = 'en'): Promise<ILocalizedDataResult<IFormatScalePage>> => {
    const isLocalized = isCategoryLocalized('format-scale', locale);

    if (locale !== 'en' && !isLocalized) {
      return {
        data: null,
        hasTranslation: false,
        isLocalizedCategory: false,
      };
    }

    const localizedData = await loadLocalizedPSEOData<IFormatScalePage>(
      'format-scale',
      locale,
      formatScaleData
    );
    const data = localizedData.pages.find(page => page.slug === slug) || null;

    return {
      data,
      hasTranslation: data !== null,
      isLocalizedCategory: isLocalized,
    };
  }
);

/**
 * Load platform-format data with localization check
 */
export const getPlatformFormatDataWithLocale = cache(
  async (
    slug: string,
    locale: Locale = 'en'
  ): Promise<ILocalizedDataResult<IPlatformFormatPage>> => {
    const isLocalized = isCategoryLocalized('platform-format', locale);

    if (locale !== 'en' && !isLocalized) {
      return {
        data: null,
        hasTranslation: false,
        isLocalizedCategory: false,
      };
    }

    const localizedData = await loadLocalizedPSEOData<IPlatformFormatPage>(
      'platform-format',
      locale,
      platformFormatData
    );
    const data = localizedData.pages.find(page => page.slug === slug) || null;

    return {
      data,
      hasTranslation: data !== null,
      isLocalizedCategory: isLocalized,
    };
  }
);

/**
 * Load device-use data with localization check
 */
export const getDeviceUseDataWithLocale = cache(
  async (
    slug: string,
    locale: Locale = 'en'
  ): Promise<ILocalizedDataResult<IDeviceUseCasePage>> => {
    const isLocalized = isCategoryLocalized('device-use', locale);

    if (locale !== 'en' && !isLocalized) {
      return {
        data: null,
        hasTranslation: false,
        isLocalizedCategory: false,
      };
    }

    const localizedData = await loadLocalizedPSEOData<IDeviceUseCasePage>(
      'device-use',
      locale,
      deviceUseData
    );
    const data = localizedData.pages.find(page => page.slug === slug) || null;

    return {
      data,
      hasTranslation: data !== null,
      isLocalizedCategory: isLocalized,
    };
  }
);
