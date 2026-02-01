import type { Metadata } from 'next';
import { clientEnv } from '@shared/config/env';
import { getOpenGraphMetadata, getCanonicalUrl } from '@/lib/seo/hreflang-generator';
import { HelpClient } from './HelpClient';
import type { Locale } from '@/i18n/config';

interface IPageProps {
  params: Promise<{ locale: Locale }>;
}

export async function generateMetadata({ params }: IPageProps): Promise<Metadata> {
  const { locale } = await params;
  const title = 'Help & FAQ';
  const description = `Find answers to common questions about ${clientEnv.APP_NAME} image upscaling, credits, billing, and technical support.`;
  const openGraph = getOpenGraphMetadata('/help', title, description, locale);
  const canonicalUrl = getCanonicalUrl('/help', locale);

  return {
    title,
    description,
    openGraph,
    alternates: {
      canonical: canonicalUrl,
    },
  };
}

export default function HelpPage() {
  return <HelpClient />;
}
