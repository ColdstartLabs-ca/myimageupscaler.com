import type { Metadata } from 'next';
import type { Locale } from '@/i18n/config';
import type { PSEOPage } from './pseo-types';
import type { PSEOCategory } from './url-utils';
import type { ILocalizedDataResult } from './data-loader';
import { generateMetadata as generatePageMetadata } from './metadata-factory';

type LocalePageLoader<T extends PSEOPage> = (
  slug: string,
  locale: Locale
) => Promise<ILocalizedDataResult<T>>;

/**
 * Resolve metadata from the same localized-data fallback used by locale page bodies.
 * An English fallback gets a useful, page-specific head but remains out of the index.
 */
export async function resolveLocalePageMetadata<T extends PSEOPage>(
  loader: LocalePageLoader<T>,
  category: PSEOCategory,
  slug: string,
  locale: Locale
): Promise<Metadata> {
  let result = await loader(slug, locale);
  let usedEnglishFallback = false;

  if (!result.data && locale !== 'en') {
    result = await loader(slug, 'en');
    usedEnglishFallback = true;
  }
  if (!result.data) return {};

  const { alternates: _alternates, ...metadata } = generatePageMetadata(
    result.data,
    category,
    locale
  );

  return usedEnglishFallback ? { ...metadata, robots: { index: false, follow: true } } : metadata;
}
