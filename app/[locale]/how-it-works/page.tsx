import type { Metadata } from 'next';
import { getTranslations, setRequestLocale } from 'next-intl/server';
import HowItWorks from '@client/components/features/landing/HowItWorks';
import { CTASection } from '@client/components/features/landing/CTASection';
import { clientEnv } from '@shared/config/env';
import { getCanonicalUrl } from '@lib/seo/hreflang-generator';
import type { Locale } from '@/i18n/config';

interface IHowItWorksPageProps {
  params: Promise<{ locale: Locale }>;
}

export async function generateMetadata({ params }: IHowItWorksPageProps): Promise<Metadata> {
  await params;

  return {
    title: `How it Works | ${clientEnv.APP_NAME} - Image Upscaling & Enhancement`,
    description: `Learn how ${clientEnv.APP_NAME} transforms your images in three simple steps: Upload, Process, and Download. Get professional results in seconds.`,
    alternates: {
      canonical: getCanonicalUrl('/how-it-works'),
    },
  };
}

export default async function HowItWorksPage({ params }: IHowItWorksPageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('howItWorks');

  return (
    <main className="min-h-screen bg-base">
      {/* Hero Section */}
      <section className="py-20 hero-gradient">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-white mb-6">
            {t('page.title')}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent via-accent-light to-cyan-400">
              {' '}
              {t('page.titleHighlight')}
            </span>
          </h1>
          <p className="text-xl text-muted-foreground leading-relaxed max-w-2xl mx-auto">
            {t('page.subtitle')}
          </p>
        </div>
      </section>

      {/* How It Works Section */}
      <HowItWorks />

      {/* CTA Section */}
      <CTASection />
    </main>
  );
}
