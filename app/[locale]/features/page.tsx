import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import Features from '@client/components/features/landing/Features';
import { CTASection } from '@client/components/features/landing/CTASection';
import { clientEnv } from '@shared/config/env';
import { getCanonicalUrl, getOpenGraphMetadata } from '@lib/seo/hreflang-generator';
import type { Locale } from '@/i18n/config';

interface IFeaturesPageProps {
  params: Promise<{ locale: Locale }>;
}

export async function generateMetadata({ params }: IFeaturesPageProps): Promise<Metadata> {
  const { locale } = await params;
  const title = `Features | ${clientEnv.APP_NAME} - Image Upscaling & Enhancement`;
  const description = `Discover powerful features of ${clientEnv.APP_NAME}: Text preservation, batch processing, ethical AI, lightning fast upscaling, and more.`;
  const openGraph = getOpenGraphMetadata('/features', title, description, locale);

  return {
    title,
    description,
    openGraph,
    alternates: {
      canonical: getCanonicalUrl('/features', locale),
    },
  };
}

export default async function FeaturesPage({ params }: IFeaturesPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('features');

  return (
    <main className="min-h-screen bg-base">
      {/* Hero Section */}
      <section className="py-20 hero-gradient">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white mb-6">
            {t('page.title')}
            <span className="block text-transparent bg-clip-text bg-gradient-to-r from-accent via-accent-light to-cyan-400">
              {t('page.titleHighlight')}
            </span>
          </h1>
          <p className="text-xl text-muted-foreground leading-relaxed max-w-2xl mx-auto">
            {t('page.subtitle')}
          </p>
        </div>
      </section>

      {/* Features Section */}
      <Features />

      {/* CTA Section */}
      <CTASection />
    </main>
  );
}
