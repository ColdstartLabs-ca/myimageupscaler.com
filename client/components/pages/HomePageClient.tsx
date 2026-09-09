'use client';

import { useRegionTier } from '@client/hooks/useRegionTier';
import { useModalStore } from '@client/store/modalStore';
import { useToastStore } from '@client/store/toastStore';
import { DeferredSection } from '@client/components/landing/DeferredSection';
import { SectionSignupCTA } from '@client/components/landing/SectionSignupCTA';
import { PopularToolsSection } from '@client/components/landing/PopularToolsSection';
import { LandingSection } from '@client/components/landing/LandingSection';
import { prepareAuthRedirect } from '@client/utils/authRedirectManager';
import { getFreeCreditsForTier } from '@/lib/anti-freeloader/region-classifier';
import { getSubscriptionConfig } from '@shared/config/subscription.config';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, lazy, useEffect } from 'react';

export const LOCALE_LINKS: ReadonlyArray<{ href: string; label: string; flag: string }> = [
  { href: '/de', label: 'Deutsch', flag: '🇩🇪' },
  { href: '/es', label: 'Español', flag: '🇪🇸' },
  { href: '/fr', label: 'Français', flag: '🇫🇷' },
  { href: '/it', label: 'Italiano', flag: '🇮🇹' },
  { href: '/ja', label: '日本語', flag: '🇯🇵' },
  { href: '/pt', label: 'Português', flag: '🇧🇷' },
] as const;

export { POPULAR_TOOLS } from '@client/components/landing/popularTools.data';

// Lazy load below-the-fold sections to reduce initial JS bundle
// These sections will only load when user scrolls near them
const Features = lazy(() => import('@client/components/features/landing/Features'));
const HowItWorks = lazy(() => import('@client/components/features/landing/HowItWorks'));
const Pricing = lazy(() =>
  import('@client/components/features/landing/Pricing').then(m => ({ default: m.Pricing }))
);
const FAQ = lazy(() => import('@client/components/ui/FAQ').then(m => ({ default: m.FAQ })));

function FeaturesFallback(): JSX.Element {
  const t = useTranslations('features');
  const features = [
    ['textLogos', t('features.textLogos.name'), t('features.textLogos.description')],
    ['batchUpscale', t('features.batchUpscale.name'), t('features.batchUpscale.description')],
    ['qualityTiers', t('features.qualityTiers.name'), t('features.qualityTiers.description')],
    ['smartDetection', t('features.smartDetection.name'), t('features.smartDetection.description')],
  ];
  const secondaryFeatures = [
    t('secondaryFeatures.faceEnhancement'),
    t('secondaryFeatures.secureProcessing'),
    t('secondaryFeatures.fastProcessing'),
    t('secondaryFeatures.highAvailability'),
  ];

  return (
    <LandingSection
      id="features"
      fadeTop
      className="min-h-[760px] py-20"
      innerClassName="mx-auto max-w-7xl px-6 lg:px-8"
    >
      <div className="mx-auto mb-16 max-w-2xl lg:text-center">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-widest text-secondary">
          {t('section.badge')}
        </h3>
        <h2 className="text-4xl font-black tracking-tight text-white sm:text-5xl">
          {t('section.title')}{' '}
          <span className="gradient-text-primary">{t('section.titleHighlight')}</span>
        </h2>
        <p className="mt-6 text-xl font-light leading-8 text-text-secondary">
          {t('section.description')}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-8 md:grid-cols-2 lg:grid-cols-4">
        {features.map(([key, name, description]) => (
          <div
            key={key}
            className="relative h-full min-h-52 rounded-2xl border border-white/10 bg-white/5 p-6"
          >
            <div className="mb-6 h-12 w-12 rounded-xl bg-white/10" aria-hidden="true" />
            <h3 className="mb-3 text-xl font-bold text-white">{name}</h3>
            <p className="text-sm font-light leading-relaxed text-text-secondary">{description}</p>
          </div>
        ))}
      </div>

      <div className="mt-24 border-t border-white/5 pt-16">
        <div className="flex flex-wrap justify-center items-center gap-x-12 gap-y-10 md:gap-x-20">
          {secondaryFeatures.map(feature => (
            <span key={feature} className="text-sm font-bold tracking-wide text-text-secondary">
              {feature}
            </span>
          ))}
        </div>
      </div>
      <div className="mx-auto mt-16 h-14 max-w-md rounded-xl bg-white/5" aria-hidden="true" />
    </LandingSection>
  );
}

function HowItWorksFallback(): JSX.Element {
  const t = useTranslations('howItWorks');
  const steps = [
    ['1', t('steps.upload.name'), t('steps.upload.description')],
    ['2', t('steps.enhancement.name'), t('steps.enhancement.description')],
    ['3', t('steps.download.name'), t('steps.download.description')],
  ];

  return (
    <LandingSection
      id="how-it-works"
      fadeTop
      className="min-h-[760px] py-20"
      innerClassName="mx-auto max-w-7xl px-6 lg:px-8"
    >
      <div className="mb-24 text-center">
        <h3 className="mb-3 text-sm font-bold uppercase tracking-widest text-secondary">
          {t('section.badge')}
        </h3>
        <h2 className="mb-6 text-4xl font-black tracking-tight text-white sm:text-5xl">
          {t('section.title')}{' '}
          <span className="gradient-text-primary">{t('section.titleHighlight')}</span>
        </h2>
        <p className="mx-auto max-w-2xl text-xl font-light text-text-secondary">
          {t('section.description')}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-16 md:grid-cols-3">
        {steps.map(([number, name, description]) => (
          <div key={number} className="flex flex-col items-center text-center">
            <div className="mb-10 flex h-24 w-24 items-center justify-center rounded-[2rem] bg-white/10 text-3xl font-black text-white">
              {number}
            </div>
            <h3 className="mb-4 text-2xl font-bold tracking-tight text-white">{name}</h3>
            <p className="px-6 font-light leading-relaxed text-text-secondary">{description}</p>
          </div>
        ))}
      </div>
      <div className="mx-auto mt-16 h-14 max-w-md rounded-xl bg-white/5" aria-hidden="true" />
    </LandingSection>
  );
}

function FAQFallback({
  items,
}: {
  items: ReadonlyArray<{ question: string; answer: string }>;
}): JSX.Element {
  return (
    <div className="mx-auto max-w-3xl">
      {items.map(item => (
        <details key={item.question} className="border-b border-white/10 last:border-0">
          <summary className="cursor-pointer list-none py-6 text-left text-lg font-semibold text-white">
            {item.question}
          </summary>
          <p className="pb-6 leading-relaxed text-text-secondary">{item.answer}</p>
        </details>
      ))}
    </div>
  );
}

function PricingFallback(): JSX.Element {
  const t = useTranslations('homepage');
  const tPricing = useTranslations('pricing');

  return (
    <LandingSection
      id="pricing"
      ambient
      fadeTop
      fadeBottom
      className="pricing-section min-h-[720px] py-24"
      innerClassName="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8"
    >
      <div className="mb-12 text-center">
        <p className="mb-3 text-sm font-bold uppercase tracking-widest text-secondary">Pricing</p>
        <h2 className="text-3xl font-black text-white sm:text-5xl">
          Simple, <span className="gradient-text-primary">transparent</span> pricing
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-lg font-light text-text-secondary">
          {t('pricingCtaDescription')}
        </p>
      </div>
      <div className="mx-auto min-h-[320px] max-w-5xl rounded-2xl border border-surface-light bg-surface/40 p-8 text-center">
        <p className="text-lg font-light text-text-secondary">{tPricing('creditPacks.subtitle')}</p>
      </div>
    </LandingSection>
  );
}

export function HomePageClient(): JSX.Element {
  const { openAuthModal } = useModalStore();
  const { showToast } = useToastStore();
  const searchParams = useSearchParams();
  const t = useTranslations('homepage');
  const { tier } = useRegionTier();
  const freeCredits = getFreeCreditsForTier(tier ?? 'standard');

  // Check if any plan has trial enabled
  const config = getSubscriptionConfig();
  const hasTrialEnabled = config.plans.some(plan => plan.trial.enabled);

  const faqItems = [
    {
      question: t('faq1Question'),
      answer: t('faq1Answer'),
    },
    {
      question: t('faq2Question'),
      answer: t('faq2Answer'),
    },
    {
      question: t('faq3Question'),
      answer: t('faq3Answer', { freeCredits }),
    },
    {
      question: t('faq4Question'),
      answer: t('faq4Answer'),
    },
  ];

  // Check for auth prompts from URL params
  useEffect(() => {
    const loginRequired = searchParams.get('login');
    const signupRequired = searchParams.get('signup');
    const nextUrl = searchParams.get('next');

    // Handle login redirect (from middleware)
    if (loginRequired === '1' && nextUrl) {
      prepareAuthRedirect('dashboard_access', {
        returnTo: nextUrl,
      });

      showToast({
        message: t('toastLoginRequired'),
        type: 'info',
        duration: 5000,
      });

      setTimeout(() => {
        openAuthModal('login');
      }, 500);

      const url = new URL(window.location.href);
      url.searchParams.delete('login');
      url.searchParams.delete('next');
      window.history.replaceState({}, '', url.toString());
    }

    // Handle signup prompt (from blog CTAs, etc.)
    if (signupRequired === '1') {
      setTimeout(() => {
        openAuthModal('register');
      }, 300);

      const url = new URL(window.location.href);
      url.searchParams.delete('signup');
      window.history.replaceState({}, '', url.toString());
    }
  }, [searchParams, openAuthModal, showToast, t]);

  return (
    <>
      <PopularToolsSection freeCredits={freeCredits} />

      {/* Landing page sections load when they approach the viewport. */}
      <DeferredSection fallback={<FeaturesFallback />}>
        <Suspense fallback={<FeaturesFallback />}>
          <Features />
        </Suspense>
      </DeferredSection>
      <DeferredSection fallback={<HowItWorksFallback />}>
        <Suspense fallback={<HowItWorksFallback />}>
          <HowItWorks />
        </Suspense>
      </DeferredSection>

      <LandingSection
        id="faq"
        ambient
        fadeTop
        className="py-12 sm:py-16 lg:py-20"
        innerClassName="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8"
      >
        <div className="mb-10 text-center sm:mb-16">
          <h2 className="text-3xl sm:text-5xl font-bold text-white mb-6">{t('faqTitle')}</h2>
          <p className="text-lg text-text-secondary">{t('faqSubtitle')}</p>
        </div>
        <DeferredSection fallback={<FAQFallback items={faqItems} />}>
          <Suspense fallback={<FAQFallback items={faqItems} />}>
            <FAQ items={faqItems} />
          </Suspense>
        </DeferredSection>
        <SectionSignupCTA location="homepage_faq" className="mt-12" />
      </LandingSection>

      <DeferredSection fallback={<PricingFallback />}>
        <Suspense fallback={<PricingFallback />}>
          <Pricing />
        </Suspense>
      </DeferredSection>

      <LandingSection
        fadeTop
        ambient
        className="py-24"
        overlay={
          <div className="h-full w-full bg-gradient-to-br from-secondary/10 via-main to-accent/10" />
        }
        innerClassName="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center"
      >
        <h2 className="text-4xl sm:text-6xl font-black text-white mb-6">
          {t('finalCtaTitle')}
          <br />
          <span className="gradient-text-primary">{t('finalCtaTitleHighlight')}</span>
        </h2>
        <p className="text-xl text-text-secondary mb-12 max-w-2xl mx-auto font-light">
          {t('finalCtaDescription')}
        </p>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
          <button
            onClick={() => openAuthModal('register')}
            className="group inline-flex items-center gap-2 px-10 py-5 text-white font-bold rounded-xl transition-all duration-200 gradient-cta shine-effect text-lg shadow-xl shadow-accent/20 hover:scale-[1.05] active:scale-[0.95]"
          >
            <Sparkles size={22} className="group-hover:rotate-12 transition-transform" />
            {hasTrialEnabled ? t('ctaFixImagesNow') : t('ctaStartUpscaling')}
            <ArrowRight size={20} className="group-hover:translate-x-1 transition-transform" />
          </button>
          <a
            href="/pricing"
            className="inline-flex items-center gap-2 px-10 py-5 glass-strong hover:bg-white/5 text-white font-semibold rounded-xl transition-all duration-200 text-lg hover:scale-[1.05] active:scale-[0.95]"
          >
            {t('ctaComparePlans')}
          </a>
        </div>
        <p className="mt-8 text-sm text-text-muted">{t('finalCtaSubtext', { freeCredits })}</p>
      </LandingSection>

      {/* Locale links — crawlable equity distribution */}
      <LandingSection fadeTop className="py-8 text-center">
        <p className="text-text-muted text-sm mb-3">Available in your language:</p>
        <div className="flex flex-wrap justify-center gap-4">
          {LOCALE_LINKS.map(({ href, label, flag }) => (
            <Link
              key={href}
              href={href}
              className="text-sm text-text-muted-aa hover:text-accent transition-colors"
            >
              {flag} {label}
            </Link>
          ))}
        </div>
      </LandingSection>
    </>
  );
}
