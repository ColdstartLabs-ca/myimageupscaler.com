'use client';

import { useRegionTier } from '@client/hooks/useRegionTier';
import { useModalStore } from '@client/store/modalStore';
import { useToastStore } from '@client/store/toastStore';
import { prepareAuthRedirect } from '@client/utils/authRedirectManager';
import { getFreeCreditsForTier } from '@/lib/anti-freeloader/region-classifier';
import { getSubscriptionConfig } from '@shared/config/subscription.config';
import { ArrowRight, ChevronRight, Sparkles } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { DEFAULT_LOCALE } from '@/i18n/config';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, lazy, useEffect } from 'react';

// AmbientBackground is purely decorative (animated orbs) — no SSR value.
// Lazy-loading it removes it from the critical JS path and reduces TBT.
const AmbientBackground = dynamic(
  () =>
    import('@client/components/landing/AmbientBackground').then(
      m => m.AmbientBackground,
    ),
  { ssr: false },
);

export const LOCALE_LINKS: ReadonlyArray<{ href: string; label: string; flag: string }> = [
  { href: '/de', label: 'Deutsch', flag: '🇩🇪' },
  { href: '/es', label: 'Español', flag: '🇪🇸' },
  { href: '/fr', label: 'Français', flag: '🇫🇷' },
  { href: '/it', label: 'Italiano', flag: '🇮🇹' },
  { href: '/ja', label: '日本語', flag: '🇯🇵' },
  { href: '/pt', label: 'Português', flag: '🇧🇷' },
] as const;

export const POPULAR_TOOLS: ReadonlyArray<{ href: string; label: string; desc: string }> = [
  {
    href: '/tools/ai-image-upscaler',
    label: 'AI Image Upscaler',
    desc: 'Enlarge to 4K without quality loss',
  },
  {
    href: '/tools/ai-photo-enhancer',
    label: 'Image Quality Enhancer',
    desc: 'Fix blur, noise & restore photos free',
  },
  {
    href: '/tools/transparent-background-maker',
    label: 'Transparent Background Maker',
    desc: 'Remove backgrounds, create PNG',
  },
  {
    href: '/formats/upscale-avif-images',
    label: 'AVIF Upscaler',
    desc: 'Upscale next-gen AVIF format images',
  },
  {
    href: '/free',
    label: 'Free Tools',
    desc: 'Start with free credits — no credit card needed',
  },
  {
    href: '/tools/ai-background-remover',
    label: 'AI Background Remover',
    desc: 'Remove image backgrounds instantly',
  },
] as const;

// Lazy load below-the-fold sections to reduce initial JS bundle
// These sections will only load when user scrolls near them
const Features = lazy(() => import('@client/components/features/landing/Features'));
const HowItWorks = lazy(() => import('@client/components/features/landing/HowItWorks'));
const FAQ = lazy(() => import('@client/components/ui/FAQ').then(m => ({ default: m.FAQ })));

export function HomePageClient(): JSX.Element {
  const { openAuthModal } = useModalStore();
  const { showToast } = useToastStore();
  const searchParams = useSearchParams();
  const t = useTranslations('homepage');
  const locale = useLocale();
  const { tier } = useRegionTier();
  const freeCredits = getFreeCreditsForTier(tier ?? 'standard');
  const localizeHref = (href: string) =>
    locale === DEFAULT_LOCALE ? href : `/${locale}${href}`;

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
      {/* Popular Tools Section — Internal linking for link equity distribution */}
      <section className="py-20 relative">
          <AmbientBackground variant="section" />
          <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 relative z-10">
            <div className="text-center mb-12">
              <h2 className="text-3xl sm:text-4xl font-black text-white mb-4">
                Start Enhancing — <span className="gradient-text-primary">Pick a Tool</span>
              </h2>
              <p className="text-lg text-text-secondary max-w-2xl mx-auto font-light">
                Professional AI tools for every image task. Try free with {freeCredits} credits.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {POPULAR_TOOLS.map(tool => (
                <Link
                  key={tool.href}
                  href={localizeHref(tool.href)}
                  className="group glass-card-2025 p-6 flex items-start gap-4 hover:border-accent/40 transition-all duration-300 animated-border-violet"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-bold text-white group-hover:text-accent transition-colors truncate">
                      {tool.label}
                    </p>
                    <p className="text-sm text-text-secondary mt-1 font-light leading-snug">
                      {tool.desc}
                    </p>
                  </div>
                  <ChevronRight
                    size={18}
                    className="text-text-muted shrink-0 mt-0.5 group-hover:text-accent group-hover:translate-x-1 transition-all duration-200"
                  />
                </Link>
              ))}
            </div>
          </div>
        </section>

      {/* Landing Page Sections - Lazy loaded for performance */}
      <Suspense fallback={<div className="h-screen" />}>
        <Features />
      </Suspense>
      <Suspense fallback={<div className="h-screen" />}>
        <HowItWorks />
      </Suspense>

      {/* FAQ Section */}
      <section id="faq" className="py-24 relative">
        <AmbientBackground variant="section" />
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="text-center mb-16">
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
        </div>
      </section>

      {/* Pricing CTA Section */}
      <section className="py-24 relative">
        <AmbientBackground variant="section" />
        <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center relative z-10">
          <h2 className="text-3xl sm:text-5xl font-bold text-white mb-6">
            {t('pricingCtaTitle')}
          </h2>
          <p className="text-lg sm:text-xl text-text-secondary mb-10 max-w-2xl mx-auto font-light">
            {t('pricingCtaDescription')}
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
            <a
              href="/pricing"
              className="group inline-flex items-center gap-2 px-8 py-4 text-white font-semibold rounded-xl transition-all duration-200 gradient-cta shine-effect hover:scale-[1.02] active:scale-[0.98]"
            >
              {t('ctaSeeWhatItCosts')}
              <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </a>
            <button
              onClick={() => openAuthModal('register')}
              className="inline-flex items-center gap-2 px-8 py-4 glass-strong hover:bg-white/5 text-white font-semibold rounded-xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
            >
              {hasTrialEnabled
                ? t('ctaTryFreeCredits', { freeCredits })
                : t('ctaGetFreeCredits', { freeCredits })}
            </button>
          </div>
          <p className="mt-6 text-sm text-text-muted">{t('pricingCtaSubtext', { freeCredits })}</p>
        </div>
      </section>

      {/* Final CTA Section */}
      <section className="relative py-32 section-glow-top overflow-hidden">
        {/* Background */}
        <div className="absolute inset-0 bg-gradient-to-br from-secondary/10 via-main to-accent/10"></div>
        <AmbientBackground variant="section" />

        <div className="relative mx-auto max-w-4xl px-4 sm:px-6 lg:px-8 text-center">
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
        </div>
      </section>

      {/* Locale links — crawlable equity distribution */}
      <section className="py-8 text-center">
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
      </section>
    </>
  );
}
