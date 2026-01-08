/**
 * i18n Request Handler
 *
 * Server-side locale handling for Next.js App Router with next-intl.
 * This module provides utilities for detecting and managing locales in requests.
 */

import { DEFAULT_LOCALE, LOCALE_COOKIE, isValidLocale, type Locale } from './config';

/**
 * Extract locale from pathname
 * Handles both prefixed (/es/path) and unprefixed (/path) paths
 */
export function getLocaleFromPathname(pathname: string): Locale {
  const segments = pathname.split('/').filter(Boolean);

  // Check if first segment is a valid locale
  if (segments.length > 0 && isValidLocale(segments[0])) {
    return segments[0] as Locale;
  }

  return DEFAULT_LOCALE;
}

/**
 * Remove locale prefix from pathname
 * /es/tools -> /tools
 * /tools -> /tools
 */
export function getPathnameWithoutLocale(pathname: string, locale: Locale): string {
  if (locale === DEFAULT_LOCALE) {
    return pathname;
  }

  const prefix = `/${locale}`;
  if (pathname.startsWith(prefix)) {
    return pathname.slice(prefix.length) || '/';
  }

  return pathname;
}

/**
 * Add locale prefix to pathname if needed
 * English (default) has no prefix
 * Spanish: /tools -> /es/tools
 */
export function getPathnameWithLocale(pathname: string, locale: Locale): string {
  if (locale === DEFAULT_LOCALE) {
    return pathname;
  }

  // Ensure pathname starts with /
  const normalizedPathname = pathname.startsWith('/') ? pathname : `/${pathname}`;

  return `/${locale}${normalizedPathname}`;
}

/**
 * Detect locale from request headers and cookies
 * Priority: cookie > Accept-Language header > default
 */
export function detectLocaleFromRequest(request: {
  cookies: { get: (name: string) => { value?: string } | undefined };
  headers: { get: (name: string) => string | null };
}): Locale {
  // 1. Check cookie
  const cookieLocale = request.cookies.get(LOCALE_COOKIE)?.value;
  if (cookieLocale && isValidLocale(cookieLocale)) {
    return cookieLocale;
  }

  // 2. Check Accept-Language header
  const acceptLanguage = request.headers.get('Accept-Language');
  if (acceptLanguage) {
    // Parse Accept-Language header (e.g., "es-ES,es;q=0.9,en;q=0.8")
    const preferredLocales = acceptLanguage
      .split(',')
      .map(lang => {
        const [locale, qValue] = lang.trim().split(';q=');
        const quality = qValue ? parseFloat(qValue) : 1;
        return { locale: locale.split('-')[0] as Locale, quality };
      })
      .sort((a, b) => b.quality - a.quality);

    for (const { locale } of preferredLocales) {
      if (isValidLocale(locale)) {
        return locale;
      }
    }
  }

  // 3. Fallback to default
  return DEFAULT_LOCALE;
}
