import canonicalEnglishInteractiveTools from '@/locales/en/interactive-tools.json';
import type { IToolConfig } from './pseo-types';

/**
 * Canonical route declarations for interactive tools.
 *
 * Keep page routes, sitemap paths, and dedicated-route filtering aligned here. Locale pages may
 * render English fallback copy for slugs without complete translations, but they must never 404
 * merely because a locale data file lags behind the English route list.
 */

export const RESIZE_SLUGS = [
  'image-resizer',
  'resize-image-for-instagram',
  'resize-image-for-youtube',
  'resize-image-for-facebook',
  'resize-image-for-twitter',
  'resize-image-for-linkedin',
  'resize-image-for-pinterest',
  'resize-image-for-tiktok',
  'resize-image-for-discord',
  'resize-image-for-reddit',
  'resize-image-for-telegram',
  'bulk-image-resizer',
] as const;

export const CONVERSION_SLUGS = [
  'png-to-jpg',
  'jpg-to-png',
  'webp-to-jpg',
  'webp-to-png',
  'jpg-to-webp',
  'png-to-webp',
  'bmp-to-png',
  'gif-to-png',
  'gif-to-webp',
  'bmp-to-webp',
] as const;

export const COMPRESS_SLUGS = ['image-compressor', 'bulk-image-compressor'] as const;

export type InteractiveToolSlug =
  | (typeof RESIZE_SLUGS)[number]
  | (typeof CONVERSION_SLUGS)[number]
  | (typeof COMPRESS_SLUGS)[number];

const buildToolPaths = <T extends readonly string[]>(
  category: 'resize' | 'convert' | 'compress',
  slugs: T
): Record<T[number], string> =>
  Object.fromEntries(slugs.map(slug => [slug, `/tools/${category}/${slug}`])) as Record<
    T[number],
    string
  >;

export const INTERACTIVE_TOOL_PATHS: Record<InteractiveToolSlug, string> = {
  ...buildToolPaths('resize', RESIZE_SLUGS),
  ...buildToolPaths('convert', CONVERSION_SLUGS),
  ...buildToolPaths('compress', COMPRESS_SLUGS),
} as Record<InteractiveToolSlug, string>;

/**
 * Slugs with complete interactive-tools translations in every supported non-English locale.
 * This intentionally excludes social-resize and format-conversion expansion data; those pages
 * use English fallback copy and are noindex until every locale has real content.
 */
export const LOCALIZED_INTERACTIVE_SLUGS = [
  'image-resizer',
  'resize-image-for-instagram',
  'resize-image-for-youtube',
  'resize-image-for-facebook',
  'resize-image-for-twitter',
  'resize-image-for-linkedin',
  'bulk-image-resizer',
  'image-compressor',
  'png-to-jpg',
  'jpg-to-png',
  'webp-to-jpg',
  'webp-to-png',
  'jpg-to-webp',
  'png-to-webp',
  'bulk-image-compressor',
] as const satisfies readonly InteractiveToolSlug[];

export function isLocalizedInteractiveSlug(slug: string): boolean {
  return (LOCALIZED_INTERACTIVE_SLUGS as readonly string[]).includes(slug);
}

interface ICanonicalInteractiveToolRecord {
  slug: string;
  toolComponent?: unknown;
  toolConfig?: unknown;
}

export interface IInteractiveToolRuntime {
  toolComponent?: string;
  toolConfig?: IToolConfig;
}

const canonicalEnglishPages =
  canonicalEnglishInteractiveTools.pages as ICanonicalInteractiveToolRecord[];

function isToolConfig(value: unknown): value is IToolConfig {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * English interactive-tool records are the source of truth for executable component and config
 * fields. Localized records supply display copy, but may be incomplete or contain translated MIME
 * values that the browser runtime cannot process.
 */
export function getCanonicalInteractiveToolRuntime(
  slug: string,
  fallback: IInteractiveToolRuntime = {}
): IInteractiveToolRuntime {
  const canonical = canonicalEnglishPages.find(page => page.slug === slug);
  const fallbackRuntime: IInteractiveToolRuntime = {
    toolComponent: typeof fallback.toolComponent === 'string' ? fallback.toolComponent : undefined,
    toolConfig: isToolConfig(fallback.toolConfig) ? fallback.toolConfig : undefined,
  };

  return {
    toolComponent:
      typeof canonical?.toolComponent === 'string'
        ? canonical.toolComponent
        : fallbackRuntime.toolComponent,
    toolConfig: isToolConfig(canonical?.toolConfig)
      ? canonical.toolConfig
      : fallbackRuntime.toolConfig,
  };
}

export function withCanonicalInteractiveToolRuntime<
  T extends { slug: string; toolComponent?: unknown; toolConfig?: unknown },
>(tool: T): T {
  return {
    ...tool,
    ...getCanonicalInteractiveToolRuntime(tool.slug, {
      toolComponent: typeof tool.toolComponent === 'string' ? tool.toolComponent : undefined,
      toolConfig: isToolConfig(tool.toolConfig) ? tool.toolConfig : undefined,
    }),
  } as T;
}
