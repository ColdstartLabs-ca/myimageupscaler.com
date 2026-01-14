/**
 * Related Pages Module
 * Logic to find and return related pSEO pages for internal linking
 * Based on PRD Phase 6: Add Related Pages Section for Internal Linking
 */

import { cache } from 'react';
import {
  getAllFormats,
  getAllPlatforms,
  getAllFormatScale,
  getAllPlatformFormat,
  getAllDeviceUse,
  getAllTools,
} from './data-loader';
import type { PSEOPage } from './pseo-types';
import { Locale } from '@/i18n/config';

/**
 * Related page link structure
 */
export interface IRelatedPage {
  slug: string;
  title: string;
  description?: string;
  category: PSEOPage['category'];
  url: string;
  locale?: string;
}

/**
 * Get related pages for a given page
 * Returns:
 * - 2 pages from same category
 * - 2 pages from related categories
 * - Links to relevant tools when applicable
 */
export const getRelatedPages = cache(
  async (
    category: PSEOPage['category'],
    slug: string,
    locale: Locale = 'en'
  ): Promise<IRelatedPage[]> => {
    const relatedPages: IRelatedPage[] = [];

    // Build URL with locale prefix
    const buildUrl = (cat: string, pageSlug: string): string => {
      const localePrefix = locale !== 'en' ? `/${locale}` : '';
      return `${localePrefix}/${cat}/${pageSlug}`;
    };

    switch (category) {
      case 'platforms': {
        const platforms = await getAllPlatforms();

        // 2 other platforms
        const sameCategory = platforms
          .filter(p => p.slug !== slug)
          .slice(0, 2)
          .map(p => ({
            slug: p.slug,
            title: p.platformName || p.title,
            description: p.description,
            category: p.category,
            url: buildUrl('platforms', p.slug),
            locale,
          }));

        relatedPages.push(...sameCategory);

        // Add format-scale pages as related content
        if (relatedPages.length < 4) {
          const formatScalePages = await getAllFormatScale();
          const formatScale = formatScalePages
            .filter(fs => fs.slug !== slug)
            .slice(0, 4 - relatedPages.length)
            .map(fs => ({
              slug: fs.slug,
              title: `${fs.format} ${fs.scaleFactor}`,
              description: fs.formatDescription,
              category: fs.category,
              url: buildUrl('format-scale', fs.slug),
              locale,
            }));

          relatedPages.push(...formatScale);
        }

        break;
      }

      case 'formats': {
        const formats = await getAllFormats();

        // 2 other formats
        const sameCategory = formats
          .filter(f => f.slug !== slug)
          .slice(0, 2)
          .map(f => ({
            slug: f.slug,
            title: f.formatName || f.title,
            description: f.description,
            category: f.category,
            url: buildUrl('formats', f.slug),
            locale,
          }));

        relatedPages.push(...sameCategory);

        // 2 format-scale pages
        const formatScalePages = await getAllFormatScale();
        const formatScale = formatScalePages
          .filter(fs => fs.slug !== slug)
          .slice(0, 2)
          .map(fs => ({
            slug: fs.slug,
            title: `${fs.format} ${fs.scaleFactor}`,
            description: fs.formatDescription,
            category: fs.category,
            url: buildUrl('format-scale', fs.slug),
            locale,
          }));

        relatedPages.push(...formatScale);

        // Add device-use pages as backup
        if (relatedPages.length < 4) {
          const deviceUsePages = await getAllDeviceUse();
          const deviceUse = deviceUsePages
            .filter(du => du.slug !== slug)
            .slice(0, 4 - relatedPages.length)
            .map(du => ({
              slug: du.slug,
              title: `${du.device} ${du.useCase}`,
              description: du.useCaseDescription,
              category: du.category,
              url: buildUrl('device-use', du.slug),
              locale,
            }));

          relatedPages.push(...deviceUse);
        }

        break;
      }

      case 'format-scale': {
        const formatScalePages = await getAllFormatScale();

        // 2 other format-scale pages
        const sameCategory = formatScalePages
          .filter(fs => fs.slug !== slug)
          .slice(0, 2)
          .map(fs => ({
            slug: fs.slug,
            title: `${fs.format} ${fs.scaleFactor}`,
            description: fs.formatDescription,
            category: fs.category,
            url: buildUrl('format-scale', fs.slug),
            locale,
          }));

        relatedPages.push(...sameCategory);

        // 2 format pages
        const formats = await getAllFormats();
        const formatPages = formats
          .filter(f => f.slug !== slug)
          .slice(0, 2)
          .map(f => ({
            slug: f.slug,
            title: f.formatName || f.title,
            description: f.description,
            category: f.category,
            url: buildUrl('formats', f.slug),
            locale,
          }));

        relatedPages.push(...formatPages);

        // Add platform pages as backup
        if (relatedPages.length < 4) {
          const platforms = await getAllPlatforms();
          const platformPages = platforms
            .filter(p => p.slug !== slug)
            .slice(0, 4 - relatedPages.length)
            .map(p => ({
              slug: p.slug,
              title: p.platformName || p.title,
              description: p.description,
              category: p.category,
              url: buildUrl('platforms', p.slug),
              locale,
            }));

          relatedPages.push(...platformPages);
        }

        break;
      }

      case 'platform-format': {
        const platformFormatPages = await getAllPlatformFormat();

        // 2 other platform-format pages
        const sameCategory = platformFormatPages
          .filter(pf => pf.slug !== slug)
          .slice(0, 2)
          .map(pf => ({
            slug: pf.slug,
            title: `${pf.platform} ${pf.format}`,
            description: pf.platformDescription,
            category: pf.category,
            url: buildUrl('platform-format', pf.slug),
            locale,
          }));

        relatedPages.push(...sameCategory);

        // 2 platform pages
        const platforms = await getAllPlatforms();
        const platformPages = platforms
          .filter(p => p.slug !== slug)
          .slice(0, 2)
          .map(p => ({
            slug: p.slug,
            title: p.platformName || p.title,
            description: p.description,
            category: p.category,
            url: buildUrl('platforms', p.slug),
            locale,
          }));

        relatedPages.push(...platformPages);

        // Add format pages as backup
        if (relatedPages.length < 4) {
          const formats = await getAllFormats();
          const formatPages = formats
            .filter(f => f.slug !== slug)
            .slice(0, 4 - relatedPages.length)
            .map(f => ({
              slug: f.slug,
              title: f.formatName || f.title,
              description: f.description,
              category: f.category,
              url: buildUrl('formats', f.slug),
              locale,
            }));

          relatedPages.push(...formatPages);
        }

        break;
      }

      case 'device-use': {
        const deviceUsePages = await getAllDeviceUse();

        // 2 other device-use pages
        const sameCategory = deviceUsePages
          .filter(du => du.slug !== slug)
          .slice(0, 2)
          .map(du => ({
            slug: du.slug,
            title: `${du.device} ${du.useCase}`,
            description: du.useCaseDescription,
            category: du.category,
            url: buildUrl('device-use', du.slug),
            locale,
          }));

        relatedPages.push(...sameCategory);

        // 2 format-scale pages
        const formatScalePages = await getAllFormatScale();
        const formatScale = formatScalePages.slice(0, 2).map(fs => ({
          slug: fs.slug,
          title: `${fs.format} ${fs.scaleFactor}`,
          description: fs.formatDescription,
          category: fs.category,
          url: buildUrl('format-scale', fs.slug),
          locale,
        }));

        relatedPages.push(...formatScale);

        // Add tools as backup
        if (relatedPages.length < 4) {
          const tools = await getAllTools();
          const toolPages = tools
            .filter(t => t.slug !== slug)
            .slice(0, 4 - relatedPages.length)
            .map(t => ({
              slug: t.slug,
              title: t.toolName || t.title,
              description: t.description,
              category: t.category,
              url: buildUrl('tools', t.slug),
              locale,
            }));

          relatedPages.push(...toolPages);
        }

        break;
      }

      case 'free': {
        // For free pages, return related tools and format-scale pages
        const tools = await getAllTools();
        const toolPages = tools
          .filter(t => t.slug !== slug)
          .slice(0, 3)
          .map(t => ({
            slug: t.slug,
            title: t.toolName || t.title,
            description: t.description,
            category: t.category,
            url: buildUrl('tools', t.slug),
            locale,
          }));

        relatedPages.push(...toolPages);

        // Add format-scale pages as backup
        if (relatedPages.length < 4) {
          const formatScalePages = await getAllFormatScale();
          const formatScale = formatScalePages
            .filter(fs => fs.slug !== slug)
            .slice(0, 4 - relatedPages.length)
            .map(fs => ({
              slug: fs.slug,
              title: `${fs.format} ${fs.scaleFactor}`,
              description: fs.formatDescription,
              category: fs.category,
              url: buildUrl('format-scale', fs.slug),
              locale,
            }));

          relatedPages.push(...formatScale);
        }

        break;
      }

      case 'guides': {
        // For guides, return related tools and format pages
        const tools = await getAllTools();
        const toolPages = tools
          .filter(t => t.slug !== slug)
          .slice(0, 3)
          .map(t => ({
            slug: t.slug,
            title: t.toolName || t.title,
            description: t.description,
            category: t.category,
            url: buildUrl('tools', t.slug),
            locale,
          }));

        relatedPages.push(...toolPages);

        // Add formats as backup
        if (relatedPages.length < 4) {
          const formats = await getAllFormats();
          const formatPages = formats
            .filter(f => f.slug !== slug)
            .slice(0, 4 - relatedPages.length)
            .map(f => ({
              slug: f.slug,
              title: f.formatName || f.title,
              description: f.description,
              category: f.category,
              url: buildUrl('formats', f.slug),
              locale,
            }));

          relatedPages.push(...formatPages);
        }

        break;
      }

      case 'scale': {
        // For scale pages, return related format-scale and device-use pages
        const formatScalePages = await getAllFormatScale();
        const formatScale = formatScalePages
          .filter(fs => fs.slug !== slug)
          .slice(0, 3)
          .map(fs => ({
            slug: fs.slug,
            title: `${fs.format} ${fs.scaleFactor}`,
            description: fs.formatDescription,
            category: fs.category,
            url: buildUrl('format-scale', fs.slug),
            locale,
          }));

        relatedPages.push(...formatScale);

        // Add device-use pages as backup
        if (relatedPages.length < 4) {
          const deviceUsePages = await getAllDeviceUse();
          const deviceUse = deviceUsePages
            .filter(du => du.slug !== slug)
            .slice(0, 4 - relatedPages.length)
            .map(du => ({
              slug: du.slug,
              title: `${du.device} ${du.useCase}`,
              description: du.useCaseDescription,
              category: du.category,
              url: buildUrl('device-use', du.slug),
              locale,
            }));

          relatedPages.push(...deviceUse);
        }

        break;
      }

      default: {
        // For other categories, return generic related pages
        const tools = await getAllTools();
        const toolPages = tools
          .filter(t => t.slug !== slug)
          .slice(0, 4)
          .map(t => ({
            slug: t.slug,
            title: t.toolName || t.title,
            description: t.description,
            category: t.category,
            url: buildUrl('tools', t.slug),
            locale,
          }));

        relatedPages.push(...toolPages);
        break;
      }
    }

    // Ensure we return between 4-6 related pages
    return relatedPages.slice(0, 6);
  }
);

/**
 * Get related pages by category type (for internal linking)
 * Useful for generating navigation sections
 */
export const getRelatedPagesByCategory = cache(
  async (
    category: PSEOPage['category'],
    excludeSlug?: string,
    locale: Locale = 'en',
    limit: number = 6
  ): Promise<IRelatedPage[]> => {
    const buildUrl = (cat: string, pageSlug: string): string => {
      const localePrefix = locale !== 'en' ? `/${locale}` : '';
      return `${localePrefix}/${cat}/${pageSlug}`;
    };

    switch (category) {
      case 'platforms': {
        const platforms = await getAllPlatforms();
        return platforms
          .filter(p => p.slug !== excludeSlug)
          .slice(0, limit)
          .map(p => ({
            slug: p.slug,
            title: p.platformName || p.title,
            description: p.description,
            category: p.category,
            url: buildUrl('platforms', p.slug),
            locale,
          }));
      }

      case 'formats': {
        const formats = await getAllFormats();
        return formats
          .filter(f => f.slug !== excludeSlug)
          .slice(0, limit)
          .map(f => ({
            slug: f.slug,
            title: f.formatName || f.title,
            description: f.description,
            category: f.category,
            url: buildUrl('formats', f.slug),
            locale,
          }));
      }

      case 'format-scale': {
        const formatScalePages = await getAllFormatScale();
        return formatScalePages
          .filter(fs => fs.slug !== excludeSlug)
          .slice(0, limit)
          .map(fs => ({
            slug: fs.slug,
            title: `${fs.format} ${fs.scaleFactor}`,
            description: fs.formatDescription,
            category: fs.category,
            url: buildUrl('format-scale', fs.slug),
            locale,
          }));
      }

      case 'platform-format': {
        const platformFormatPages = await getAllPlatformFormat();
        return platformFormatPages
          .filter(pf => pf.slug !== excludeSlug)
          .slice(0, limit)
          .map(pf => ({
            slug: pf.slug,
            title: `${pf.platform} ${pf.format}`,
            description: pf.platformDescription,
            category: pf.category,
            url: buildUrl('platform-format', pf.slug),
            locale,
          }));
      }

      case 'device-use': {
        const deviceUsePages = await getAllDeviceUse();
        return deviceUsePages
          .filter(du => du.slug !== excludeSlug)
          .slice(0, limit)
          .map(du => ({
            slug: du.slug,
            title: `${du.device} ${du.useCase}`,
            description: du.useCaseDescription,
            category: du.category,
            url: buildUrl('device-use', du.slug),
            locale,
          }));
      }

      case 'free': {
        // For free pages, return tools as related
        const tools = await getAllTools();
        return tools
          .filter(t => t.slug !== excludeSlug)
          .slice(0, limit)
          .map(t => ({
            slug: t.slug,
            title: t.toolName || t.title,
            description: t.description,
            category: t.category,
            url: buildUrl('tools', t.slug),
            locale,
          }));
      }

      case 'guides': {
        // For guides, return tools as related
        const tools = await getAllTools();
        return tools
          .filter(t => t.slug !== excludeSlug)
          .slice(0, limit)
          .map(t => ({
            slug: t.slug,
            title: t.toolName || t.title,
            description: t.description,
            category: t.category,
            url: buildUrl('tools', t.slug),
            locale,
          }));
      }

      case 'scale': {
        // For scale pages, return format-scale pages as related
        const formatScalePages = await getAllFormatScale();
        return formatScalePages
          .filter(fs => fs.slug !== excludeSlug)
          .slice(0, limit)
          .map(fs => ({
            slug: fs.slug,
            title: `${fs.format} ${fs.scaleFactor}`,
            description: fs.formatDescription,
            category: fs.category,
            url: buildUrl('format-scale', fs.slug),
            locale,
          }));
      }

      case 'tools': {
        const tools = await getAllTools();
        return tools
          .filter(t => t.slug !== excludeSlug)
          .slice(0, limit)
          .map(t => ({
            slug: t.slug,
            title: t.toolName || t.title,
            description: t.description,
            category: t.category,
            url: buildUrl('tools', t.slug),
            locale,
          }));
      }

      default:
        return [];
    }
  }
);
