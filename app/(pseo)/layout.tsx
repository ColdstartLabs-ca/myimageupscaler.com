import type { ReactNode } from 'react';
import { Inter, DM_Sans } from 'next/font/google';
import { ClientProviders } from '@client/components/ClientProviders';
import { AhrefsAnalytics } from '@client/components/analytics/AhrefsAnalytics';
import { GoogleAnalytics } from '@client/components/analytics/GoogleAnalytics';
import { Layout } from '@client/components/layout/Layout';
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
 */
export default function PSEOLayout({ children }: IPSEOLayoutProps) {
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
        <GoogleAnalytics />
        <AhrefsAnalytics />
        <ClientProviders>
          <Layout>{children}</Layout>
        </ClientProviders>
      </body>
    </html>
  );
}
