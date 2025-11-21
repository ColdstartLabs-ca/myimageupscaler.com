import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import { ClientProviders } from '../src/components/ClientProviders';
import { Layout } from '../src/components/layout/Layout';
import { JsonLd } from '../src/components/seo/JsonLd';
import '../src/index.css';

const inter = Inter({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'),
  title: {
    default: 'PixelPerfect AI - Image Upscaling & Enhancement',
    template: '%s | PixelPerfect AI',
  },
  description: 'Transform your images with cutting-edge AI. Upscale, enhance, and restore details with professional quality.',
  keywords: ['image upscaling', 'AI image enhancement', 'photo restoration', 'image quality', 'AI upscaler'],
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
    description: 'Transform your images with cutting-edge AI. Upscale, enhance, and restore details with professional quality.',
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
    description: 'Transform your images with cutting-edge AI. Upscale, enhance, and restore details with professional quality.',
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
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png' },
    ],
  },
  manifest: '/manifest.webmanifest',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const websiteJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'PixelPerfect AI',
    url: process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000',
    description: 'Transform your images with cutting-edge AI. Upscale, enhance, and restore details with professional quality.',
  };

  const organizationJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: 'PixelPerfect AI',
    url: process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000',
    logo: `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'}/og-image.png`,
    description: 'AI-powered image upscaling and enhancement platform',
  };

  return (
    <html lang="en" className={inter.variable}>
      <head>
        <JsonLd data={websiteJsonLd} />
        <JsonLd data={organizationJsonLd} />
      </head>
      <body className={`${inter.className} bg-slate-50 text-slate-900 antialiased selection:bg-indigo-100 selection:text-indigo-700`}>
        <ClientProviders>
          <Layout>
            {children}
          </Layout>
        </ClientProviders>
      </body>
    </html>
  );
}
