import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { notFound } from 'next/navigation';
import { Inter, DM_Sans } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { ClientProviders } from '@client/components/ClientProviders';
import { AhrefsAnalytics } from '@client/components/analytics/AhrefsAnalytics';
import { GoogleAnalytics } from '@client/components/analytics/GoogleAnalytics';
import { Layout } from '@client/components/layout/Layout';
import { JsonLd } from '@client/components/seo/JsonLd';
import { SUPPORTED_LOCALES, isValidLocale } from '@/i18n/config';
import { serverEnv } from '@shared/config/env';
import '@client/styles/index.css';

const APP_NAME = clientEnv.APP_NAME;

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

export function generateStaticParams() {
  return SUPPORTED_LOCALES.map(locale => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  // Await params for Next.js, but og:locale is handled by SeoMetaTags in pages
  await params;

  return {
    metadataBase: new URL(serverEnv.BASE_URL),
    title: {
      default: `${APP_NAME} - Image Upscaling & Enhancement`,
      template: `%s | ${APP_NAME}`,
    },
    description:
      'Transform your images with cutting-edge AI. Upscale, enhance, and restore details with professional quality.',
    openGraph: {
      type: 'website',
      // Note: locale is handled by SeoMetaTags component in pages to avoid duplicates
      url: '/',
      siteName: APP_NAME,
    },
    // Note: alternates are NOT set here to avoid overriding page-level metadata
    // Each page sets its own alternates with proper hreflang links
    icons: {
      icon: [
        { url: '/favicon.ico' },
        { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
        { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
      ],
      apple: [{ url: '/apple-touch-icon.png' }],
    },
  };
}

interface ILocaleLayoutProps {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}

export default async function LocaleLayout({ children, params }: ILocaleLayoutProps) {
  const { locale } = await params;

  if (!isValidLocale(locale)) {
    notFound();
  }

  // Enable static rendering
  setRequestLocale(locale);

  // Get messages for this locale (setRequestLocale ensures correct locale is used)
  const messages = await getMessages();

  const websiteJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: APP_NAME,
    url: serverEnv.BASE_URL,
    inLanguage: locale,
    description:
      'Transform your images with cutting-edge AI. Upscale, enhance, and restore details with professional quality.',
  };

  const organizationJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: APP_NAME,
    url: clientEnv.BASE_URL,
    logo: `${serverEnv.BASE_URL}/logo/horizontal-logo-full.png`,
    description: 'AI-powered image upscaling and enhancement platform',
  };

  return (
    <html
      lang={locale}
      className={`${inter.variable} ${dmSans.variable} bg-base`}
      suppressHydrationWarning
    >
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
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

        <JsonLd data={websiteJsonLd} />
        <JsonLd data={organizationJsonLd} />
      </head>
      <body
        className={`${inter.className} bg-base text-foreground antialiased selection:bg-accent/20 selection:text-white`}
      >
        <NextIntlClientProvider locale={locale} messages={messages}>
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
