import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Inter } from 'next/font/google';
import { ClientProviders } from '@client/components/ClientProviders';
import { GoogleAnalytics } from '@client/components/analytics/GoogleAnalytics';
import { Layout } from '@client/components/layout/Layout';
import { JsonLd } from '@client/components/seo/JsonLd';
import '@client/styles/index.css';
import { clientEnv } from '@shared/config/env';

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(clientEnv.BASE_URL),
  title: {
    default: 'PixelPerfect AI - Image Upscaling & Enhancement',
    template: '%s | PixelPerfect AI',
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
  authors: [{ name: 'PixelPerfect AI' }],
  creator: 'PixelPerfect AI',
  publisher: 'PixelPerfect AI',
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  openGraph: {
    type: 'website',
    locale: 'en_US',
    url: '/',
    siteName: 'PixelPerfect AI',
    title: 'PixelPerfect AI - Image Upscaling & Enhancement',
    description:
      'Transform your images with cutting-edge AI. Upscale, enhance, and restore details with professional quality.',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'PixelPerfect AI Image Enhancement',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'PixelPerfect AI - Image Upscaling & Enhancement',
    description:
      'Transform your images with cutting-edge AI. Upscale, enhance, and restore details with professional quality.',
    images: ['/og-image.png'],
    creator: '@pixelperfectai',
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

// eslint-disable-next-line import/no-default-export
export default function RootLayout({ children }: { children: ReactNode }): JSX.Element {
  const websiteJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'PixelPerfect AI',
    url: clientEnv.BASE_URL,
    description:
      'Transform your images with cutting-edge AI. Upscale, enhance, and restore details with professional quality.',
  };

  const organizationJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'PixelPerfect AI',
    url: clientEnv.BASE_URL,
    logo: `${clientEnv.BASE_URL}/og-image.png`,
    description: 'AI-powered image upscaling and enhancement platform',
  };

  return (
    <html lang="en" className={inter.variable}>
      <head>
        <JsonLd data={websiteJsonLd} />
        <JsonLd data={organizationJsonLd} />
      </head>
      <body
        className={`${inter.className} bg-slate-50 text-foreground antialiased selection:bg-indigo-100 selection:text-indigo-700`}
      >
        <GoogleAnalytics />
        <ClientProviders>
          <Layout>{children}</Layout>
        </ClientProviders>
      </body>
    </html>
  );
}
