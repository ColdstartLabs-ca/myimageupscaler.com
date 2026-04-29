import interactiveToolsData from '@/app/seo/data/interactive-tools.json';
import type { Locale } from '@/i18n/config';
import type { IPSEODataFile, IToolPage } from '@/lib/seo/pseo-types';
import { generateToolSchema } from '@/lib/seo/schema-generator';
import { clientEnv } from '@shared/config/env';

export const FREE_BROWSER_UPSCALER_SLUG = 'free-image-upscaler';
export const FREE_BROWSER_UPSCALER_PATH = `/tools/${FREE_BROWSER_UPSCALER_SLUG}`;

const interactiveData = interactiveToolsData as unknown as IPSEODataFile<IToolPage>;

export function getFreeBrowserUpscalerTool(): IToolPage | null {
  return interactiveData.pages.find(page => page.slug === FREE_BROWSER_UPSCALER_SLUG) ?? null;
}

function toAbsoluteImageUrl(imagePath?: string): string {
  if (!imagePath) return `${clientEnv.BASE_URL}/og-image.png`;
  if (imagePath.startsWith('http')) return imagePath;
  return `${clientEnv.BASE_URL}${imagePath}`;
}

function getCanonicalPath(locale: Locale): string {
  return locale === 'en' ? FREE_BROWSER_UPSCALER_PATH : `/${locale}${FREE_BROWSER_UPSCALER_PATH}`;
}

export function generateFreeBrowserUpscalerSchema(tool: IToolPage, locale: Locale = 'en'): object {
  const baseSchema = generateToolSchema(tool, locale) as {
    '@context': string;
    '@graph'?: object[];
  };
  const canonicalUrl = `${clientEnv.BASE_URL}${getCanonicalPath(locale)}`;
  const organizationRef = { '@id': `${clientEnv.BASE_URL}#organization` };

  const articleSchema = {
    '@type': 'Article',
    '@id': `${canonicalUrl}#article`,
    headline: tool.h1,
    description: tool.metaDescription,
    image: [toAbsoluteImageUrl(tool.ogImage)],
    datePublished: tool.lastUpdated,
    dateModified: tool.lastUpdated,
    author: organizationRef,
    publisher: organizationRef,
    articleSection: 'Image Tools',
    mainEntityOfPage: {
      '@type': 'WebPage',
      '@id': `${canonicalUrl}#webpage`,
    },
    about: [
      { '@type': 'Thing', name: 'Browser image upscaling' },
      { '@type': 'Thing', name: 'Client-side image processing' },
    ],
  };

  return {
    '@context': 'https://schema.org',
    '@graph': [articleSchema, ...(baseSchema['@graph'] ?? [])],
  };
}
