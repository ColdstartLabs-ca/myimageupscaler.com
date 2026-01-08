import { getRequestConfig } from 'next-intl/server';
import { DEFAULT_LOCALE, isValidLocale } from './i18n/config';

/**
 * next-intl configuration
 * This file is automatically discovered by next-intl
 */
// eslint-disable-next-line import/no-default-export
export default getRequestConfig(async ({ requestLocale }) => {
  // This typically corresponds to the `[locale]` segment
  let locale = await requestLocale;

  // Ensure that a valid locale is used
  if (!locale || !isValidLocale(locale)) {
    locale = DEFAULT_LOCALE;
  }

  return {
    locale,
    messages: (await import(`./locales/${locale}/common.json`)).default,
  };
});
