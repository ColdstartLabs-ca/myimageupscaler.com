import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Inter, DM_Sans } from 'next/font/google';
import { ClientProviders } from '@client/components/ClientProviders';
import { GoogleAnalytics } from '@client/components/analytics/GoogleAnalytics';
import { Layout } from '@client/components/layout/Layout';
import { JsonLd } from '@client/components/seo/JsonLd';
import '@client/styles/index.css';
import { clientEnv } from '@shared/config/env';

const APP_NAME = clientEnv.APP_NAME;
const TWITTER_HANDLE = clientEnv.TWITTER_HANDLE;

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

export const metadata: Metadata = {
  metadataBase: new URL(clientEnv.BASE_URL),
  title: {
    default: `${APP_NAME} - Image Upscaling & Enhancement`,
    template: `%s | ${APP_NAME}`,
  },
  description:
    'Transform your images with cutting-edge AI. Upscale, enhance, and restore details with professional quality.',
  keywords: [
    'image upscaling',
    'AI image enhancement',
    'photo restoration',
    'image quality',
    'AI upscaler',
  ],
  authors: [{ name: APP_NAME }],
  creator: APP_NAME,
  publisher: APP_NAME,
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: '/',
    siteName: APP_NAME,
    title: `${APP_NAME} - Image Upscaling & Enhancement`,
    description:
      'Transform your images with cutting-edge AI. Upscale, enhance, and restore details with professional quality.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: `${APP_NAME} Image Enhancement`,
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: `${APP_NAME} - Image Upscaling & Enhancement`,
    description:
      'Transform your images with cutting-edge AI. Upscale, enhance, and restore details with professional quality.',
    images: ['/og-image.png'],
    creator: `@${TWITTER_HANDLE}`,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  alternates: {
    canonical: '/',
  },
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [{ url: '/apple-touch-icon.png' }],
  },
};

export default function RootLayout({ children }: { children: ReactNode }): JSX.Element {
  const websiteJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: APP_NAME,
    url: clientEnv.BASE_URL,
    description:
      'Transform your images with cutting-edge AI. Upscale, enhance, and restore details with professional quality.',
  };

  const organizationJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: APP_NAME,
    url: clientEnv.BASE_URL,
    logo: `${clientEnv.BASE_URL}/og-image.png`,
    description: 'AI-powered image upscaling and enhancement platform',
  };

  return (
    <html
      lang="en"
      className={`${inter.variable} ${dmSans.variable} bg-base`}
      suppressHydrationWarning
    >
      <head>
        {/* Preconnect to critical third-party origins for faster loading */}
        <link rel="preconnect" href="https://www.googletagmanager.com" />
        <link rel="dns-prefetch" href="https://www.googletagmanager.com" />
        <link rel="preconnect" href="https://js.stripe.com" />
        <link rel="dns-prefetch" href="https://js.stripe.com" />
        <JsonLd data={websiteJsonLd} />
        <JsonLd data={organizationJsonLd} />
      </head>
      <body
        className={`${inter.className} bg-base text-foreground antialiased selection:bg-accent/20 selection:text-white`}
      >
        <GoogleAnalytics />
        <ClientProviders>
          <Layout>{children}</Layout>
        </ClientProviders>
      </body>
    </html>
  );
}
