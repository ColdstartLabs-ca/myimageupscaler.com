/**
 * i18n Configuration
 *
 * Defines supported locales and default locale for the application.
 * This config is used by middleware, request handlers, and throughout the app.
 */

export const SUPPORTED_LOCALES = ['en', 'es'] as const;
export const DEFAULT_LOCALE = 'en' as const;

/**
 * Locale cookie name for persisting user preference
 */
export const LOCALE_COOKIE = 'locale';

export type Locale = (typeof SUPPORTED_LOCALES)[number];

/**
 * Locale configuration object
 * country: ISO 3166-1 alpha-2 country code for flag icons
 */
export const locales = {
  en: { label: 'English', country: 'US' },
  es: { label: 'Español', country: 'ES' },
} as const satisfies Record<Locale, { label: string; country: string }>;

/**
 * Check if a string is a valid supported locale
 */
export function isValidLocale(locale: string): locale is Locale {
  return SUPPORTED_LOCALES.includes(locale as Locale);
}

/**
 * Get locale configuration
 */
export function getLocaleConfig(locale: Locale): { label: string; country: string } {
  return locales[locale];
}
