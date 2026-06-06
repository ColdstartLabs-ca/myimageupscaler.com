'use client';

import { analytics } from '@client/analytics';
import { useRegionTier } from '@client/hooks/useRegionTier';
import { useModalStore } from '@client/store/modalStore';
import { getFreeCreditsForTier } from '@/lib/anti-freeloader/region-classifier';
import { getSubscriptionConfig } from '@shared/config/subscription.config';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface ISectionSignupCTAProps {
  location: string;
  className?: string;
}

export function SectionSignupCTA({
  location,
  className = '',
}: ISectionSignupCTAProps): JSX.Element {
  const { openAuthModal } = useModalStore();
  const t = useTranslations('homepage');
  const { tier } = useRegionTier();
  const freeCredits = getFreeCreditsForTier(tier ?? 'standard');
  const hasTrialEnabled = getSubscriptionConfig().plans.some(plan => plan.trial.enabled);

  const handleClick = () => {
    analytics.track('section_signup_cta_clicked', {
      location,
      destination: 'register_modal',
      copyVariant: hasTrialEnabled ? 'fix_images_free' : 'upscale_first_image',
    });
    openAuthModal('register');
  };

  return (
    <div className={`flex flex-col items-center text-center gap-3 ${className}`}>
      <button
        type="button"
        onClick={handleClick}
        className="group inline-flex items-center gap-2 px-8 py-4 text-white font-semibold rounded-xl transition-all duration-200 gradient-cta shine-effect hover:scale-[1.02] active:scale-[0.98]"
      >
        <Sparkles size={20} className="group-hover:rotate-12 transition-transform" />
        {hasTrialEnabled ? t('ctaFixImages') : t('ctaUpscaleFirst')}
        <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
      </button>
      <p className="text-sm text-text-muted">{t('ctaSubtext', { freeCredits })}</p>
    </div>
  );
}
