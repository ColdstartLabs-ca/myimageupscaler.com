'use client';

import { analytics } from '@client/analytics';
import { useModalStore } from '@client/store/modalStore';
import { getSubscriptionConfig } from '@shared/config/subscription.config';
import { ArrowRight, ImagePlus, Sparkles } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { DEFAULT_LOCALE } from '@/i18n/config';

export function HeroActions(): JSX.Element {
  const { openAuthModal } = useModalStore();
  const t = useTranslations('homepage');
  const router = useRouter();
  const locale = useLocale();

  const config = getSubscriptionConfig();
  const hasTrialEnabled = config.plans.some(plan => plan.trial.enabled);

  // Localize href helper
  const localizeHref = (href: string) => (locale === DEFAULT_LOCALE ? href : `/${locale}${href}`);

  // Handle primary CTA click - navigate to tool page
  const handleUploadCTA = () => {
    // Track analytics event
    analytics.track('hero_upload_cta_clicked', {
      ctaType: 'primary',
    });

    // Navigate to the main upscaler tool
    router.push(localizeHref('/tools/ai-image-upscaler'));
  };

  // Handle secondary CTA click - navigate to tool with sample intent
  const handleTrySampleCTA = () => {
    // Track analytics event
    analytics.track('hero_upload_cta_clicked', {
      ctaType: 'secondary',
    });

    // Navigate to tool with sample query param (will be handled by Phase 2)
    router.push(localizeHref('/tools/ai-image-upscaler?sample=true'));
  };

  return (
    <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
      {/* Primary CTA: Upload your first image */}
      <button
        onClick={handleUploadCTA}
        className="group inline-flex items-center gap-2 px-8 py-4 text-white font-semibold rounded-xl transition-all duration-200 gradient-cta shine-effect hover:scale-[1.02] active:scale-[0.98]"
      >
        <ImagePlus size={20} className="group-hover:scale-110 transition-transform" />
        {t('ctaUploadFirst')}
        <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
      </button>

      {/* Secondary CTA: Try a sample */}
      <button
        onClick={handleTrySampleCTA}
        className="group inline-flex items-center gap-2 px-8 py-4 glass-strong hover:bg-white/10 text-white font-semibold rounded-xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
      >
        <Sparkles size={18} className="text-accent group-hover:rotate-12 transition-transform" />
        {t('ctaTrySample')}
      </button>
    </div>
  );
}
