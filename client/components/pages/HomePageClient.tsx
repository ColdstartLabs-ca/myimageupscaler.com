'use client';

import { useRegionTier } from '@client/hooks/useRegionTier';
import { useModalStore } from '@client/store/modalStore';
import { useToastStore } from '@client/store/toastStore';
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

      {/* Landing Page Sections - Lazy loaded for performance */}
      <Suspense fallback={<div className="h-screen" />}>
        <Features />
      </Suspense>
      <Suspense fallback={<div className="h-screen" />}>
        <HowItWorks />
      </Suspense>

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
        <Suspense fallback={<div className="animate-pulse h-64 bg-white/5 rounded-xl" />}>
          <FAQ
            items={[
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
            ]}
          />
        </Suspense>
        <SectionSignupCTA location="homepage_faq" className="mt-12" />
      </LandingSection>

      <Suspense fallback={<div className="h-[720px] animate-pulse bg-white/5" />}>
        <Pricing />
      </Suspense>

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
