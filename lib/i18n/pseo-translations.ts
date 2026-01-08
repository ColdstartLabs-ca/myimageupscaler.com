/**
 * pSEO Translation Loaders
 *
 * Loads translations for programmatic SEO pages.
 * Each category has its own loader function.
 */

import type { IToolPage } from '@/lib/seo/pseo-types';
import formats from '@/locales/es/formats.json';
import platforms from '@/locales/es/platforms.json';
import guides from '@/locales/es/guides.json';
import useCases from '@/locales/es/use-cases.json';
import free from '@/locales/es/free.json';
import scale from '@/locales/es/scale.json';
import compare from '@/locales/es/compare.json';
import alternatives from '@/locales/es/alternatives.json';
import formatScale from '@/locales/es/format-scale.json';
import platformFormat from '@/locales/es/platform-format.json';
import deviceUse from '@/locales/es/device-use.json';
import tools from '@/locales/es/tools.json';

export interface IPSEORoute {
  slug: string;
  locale: string;
  category: string;
}

export interface IPSEORouteTranslations {
  [locale: string]: {
    title: string;
    metaTitle?: string;
    metaDescription?: string;
    h1?: string;
    intro?: string;
  };
}

export interface IPSEOPageData {
  slug: string;
  title: string;
  metaTitle?: string;
  metaDescription?: string;
  h1?: string;
  intro?: string;
  category?: string;
}

type ICategoryData = {
  pages: unknown[];
  category?: string;
};

/**
 * Get all pSEO routes across all categories
 */
export function getAllPSEORoutes(locale: string = 'es'): IPSEORoute[] {
  const categories = [
    { name: 'tools', data: tools as ICategoryData },
    { name: 'formats', data: formats as ICategoryData },
    { name: 'platforms', data: platforms as ICategoryData },
    { name: 'guides', data: guides as ICategoryData },
    { name: 'use-cases', data: useCases as ICategoryData },
    { name: 'free', data: free as ICategoryData },
    { name: 'scale', data: scale as ICategoryData },
    { name: 'compare', data: compare as ICategoryData },
    { name: 'alternatives', data: alternatives as ICategoryData },
    { name: 'format-scale', data: formatScale as ICategoryData },
    { name: 'platform-format', data: platformFormat as ICategoryData },
    { name: 'device-use', data: deviceUse as ICategoryData },
  ];

  const routes: IPSEORoute[] = [];

  for (const category of categories) {
    const pages = category.data?.pages || [];
    for (const page of pages) {
      routes.push({
        slug: (page as { slug: string }).slug,
        locale,
        category: category.name,
      });
    }
  }

  return routes;
}

/**
 * Get page data for a specific slug
 */
export function getPSEOPageData(slug: string): IPSEOPageData | undefined {
  const categories = [
    { name: 'tools', data: tools as ICategoryData },
    { name: 'formats', data: formats as ICategoryData },
    { name: 'platforms', data: platforms as ICategoryData },
    { name: 'guides', data: guides as ICategoryData },
    { name: 'use-cases', data: useCases as ICategoryData },
    { name: 'free', data: free as ICategoryData },
    { name: 'scale', data: scale as ICategoryData },
    { name: 'compare', data: compare as ICategoryData },
    { name: 'alternatives', data: alternatives as ICategoryData },
    { name: 'format-scale', data: formatScale as ICategoryData },
    { name: 'platform-format', data: platformFormat as ICategoryData },
    { name: 'device-use', data: deviceUse as ICategoryData },
  ];

  for (const category of categories) {
    const pages = category.data?.pages || [];
    const page = pages.find((p: unknown) => (p as { slug: string }).slug === slug);
    if (page) {
      return page as IPSEOPageData;
    }
  }

  return undefined;
}

/**
 * Get category data
 */
export function getCategoryData(category: string): ICategoryData | undefined {
  const loaders: Record<string, ICategoryData> = {
    tools,
    formats,
    platforms,
    guides,
    'use-cases': useCases,
    free,
    scale,
    compare,
    alternatives,
    'format-scale': formatScale,
    'platform-format': platformFormat,
    'device-use': deviceUse,
  };

  return loaders[category];
}

/**
 * Get all categories
 */
export function getAllCategories(): string[] {
  return [
    'tools',
    'formats',
    'platforms',
    'guides',
    'use-cases',
    'free',
    'scale',
    'compare',
    'alternatives',
    'format-scale',
    'platform-format',
    'device-use',
  ];
}

/**
 * Get page by slug from any category
 */
export function getPageBySlug(slug: string): IPSEOPageData | undefined {
  const categories = getAllCategories();

  for (const category of categories) {
    const data = getCategoryData(category);
    if (!data) continue;
    const pages = data.pages || [];
    const page = pages.find(
      (p: unknown) => (p as { slug: string }).slug === slug
    );
    if (page) {
      return page as IPSEOPageData;
    }
  }

  return undefined;
}

/**
 * Get tool data for a specific slug and locale
 * Used by the tools page template
 */
export async function getToolDataForLocale(
  slug: string,
  locale: string = 'es'
): Promise<IToolPage | null> {
  let toolData: ICategoryData;
  if (locale === 'es') {
    toolData = tools as ICategoryData;
  } else {
    // eslint-disable-next-line no-restricted-syntax -- Dynamic import needed for locale-specific files
    const imported = await import('@/locales/en/tools.json');
    toolData = imported.default || imported;
  }
  const pages = toolData.pages || [];
  const page = pages.find((p: unknown) => (p as { slug: string }).slug === slug);
  return (page as IToolPage | undefined) || null;
}

/**
 * Get all tool slugs for a locale
 * Used for generateStaticParams
 */
export async function getAllToolSlugsForLocale(
  locale: string = 'es'
): Promise<string[]> {
  let toolData: ICategoryData;
  if (locale === 'es') {
    toolData = tools as ICategoryData;
  } else {
    // eslint-disable-next-line no-restricted-syntax -- Dynamic import needed for locale-specific files
    const imported = await import('@/locales/en/tools.json');
    toolData = imported.default || imported;
  }
  return (toolData.pages || []).map((p: unknown) => (p as { slug: string }).slug);
}

// Export individual category loaders
export const loadToolsTranslations = (): ICategoryData => tools;
export const loadFormatsTranslations = (): ICategoryData => formats;
export const loadPlatformsTranslations = (): ICategoryData => platforms;
export const loadGuidesTranslations = (): ICategoryData => guides;
export const loadUseCasesTranslations = (): ICategoryData => useCases;
export const loadFreeTranslations = (): ICategoryData => free;
export const loadScaleTranslations = (): ICategoryData => scale;
export const loadCompareTranslations = (): ICategoryData => compare;
export const loadAlternativesTranslations = (): ICategoryData => alternatives;
export const loadFormatScaleTranslations = (): ICategoryData => formatScale;
export const loadPlatformFormatTranslations = (): ICategoryData => platformFormat;
export const loadDeviceUseTranslations = (): ICategoryData => deviceUse;
