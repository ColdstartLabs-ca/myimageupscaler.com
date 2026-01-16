import type { ReactNode } from 'react';
import type { Metadata } from 'next';
import { Inter, DM_Sans } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { ClientProviders } from '@client/components/ClientProviders';
import { AhrefsAnalytics } from '@client/components/analytics/AhrefsAnalytics';
import { GoogleAnalytics } from '@client/components/analytics/GoogleAnalytics';
import { Layout } from '@client/components/layout/Layout';
import { JsonLd } from '@client/components/seo/JsonLd';
import { DEFAULT_LOCALE } from '@/i18n/config';
import { clientEnv } from '@shared/config/env';
import '@client/styles/index.css';

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

const dmSans = DM_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-dm-sans',
  display: 'swap',
});

interface IPSEOLayoutProps {
  children: ReactNode;
}

/**
 * Layout for pSEO (programmatic SEO) pages
 *
 * These pages don't have locale prefix (e.g., /tools/ai-image-upscaler)
 * and serve as the default English versions for SEO purposes.
 *
 * Provides proper HTML structure with metadata for search engines.
 *
 * Note: alternates are NOT set here to avoid overriding page-level metadata.
 * Each page sets its own alternates with proper hreflang links via the
 * metadata factory (lib/seo/metadata-factory.ts).
 */
export async function generateMetadata(): Promise<Metadata> {
  return {
    metadataBase: new URL(clientEnv.BASE_URL),
    title: {
      default: `${clientEnv.APP_NAME} - Image Upscaling & Enhancement`,
      template: `%s | ${clientEnv.APP_NAME}`,
    },
    description:
      'Transform your images with cutting-edge AI. Upscale, enhance, and restore details with professional quality.',
    openGraph: {
      type: 'website',
      // Note: locale is handled by SeoMetaTags component in pages to avoid duplicates
      url: '/',
      siteName: clientEnv.APP_NAME,
    },
    // Note: alternates are NOT set here to avoid overriding page-level metadata
    // Each individual page sets its own alternates with full URLs via generateMetadata()
  };
}

export default async function PSEOLayout({ children }: IPSEOLayoutProps) {
  // Set the locale to English (default) for pSEO pages
  setRequestLocale(DEFAULT_LOCALE);

  // Get messages for the default locale
  const messages = await getMessages();

  const APP_NAME = clientEnv.APP_NAME;
  const BASE_URL = clientEnv.BASE_URL;

  const websiteJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: APP_NAME,
    url: BASE_URL,
    inLanguage: DEFAULT_LOCALE,
    description:
      'Transform your images with cutting-edge AI. Upscale, enhance, and restore details with professional quality.',
  };

  const organizationJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: APP_NAME,
    url: BASE_URL,
    logo: `${BASE_URL}/logo/horizontal-logo-full.png`,
    description: 'AI-powered image upscaling and enhancement platform',
  };

  return (
    <html
      lang="en"
      className={`${inter.variable} ${dmSans.variable} bg-base`}
      suppressHydrationWarning
    >
      <head>
        <link rel="preconnect" href="https://www.googletagmanager.com" />
        <link rel="dns-prefetch" href="https://www.googletagmanager.com" />
        <link rel="preconnect" href="https://analytics.ahrefs.com" />
        <link rel="dns-prefetch" href="https://analytics.ahrefs.com" />
        <link rel="preconnect" href="https://js.stripe.com" />
        <link rel="dns-prefetch" href="https://js.stripe.com" />

        <link
          rel="preload"
          href="/before-after/women-after.webp"
          as="image"
          type="image/webp"
          fetchPriority="high"
        />
        <link
          rel="preload"
          href="/before-after/women-before.webp"
          as="image"
          type="image/webp"
          fetchPriority="high"
        />
      </head>
      <body
        className={`${inter.className} bg-base text-foreground antialiased selection:bg-accent/20 selection:text-white`}
      >
        <JsonLd data={websiteJsonLd} />
        <JsonLd data={organizationJsonLd} />
        <NextIntlClientProvider locale={DEFAULT_LOCALE} messages={messages}>
          <GoogleAnalytics />
          <AhrefsAnalytics />
          <ClientProviders>
            <Layout>{children}</Layout>
          </ClientProviders>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
