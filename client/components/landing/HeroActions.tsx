'use client';

import { analytics } from '@client/analytics';
import { useModalStore } from '@client/store/modalStore';
import { getSubscriptionConfig } from '@shared/config/subscription.config';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface IHeroActionsProps {
  className?: string;
  compact?: boolean;
}

export function HeroActions({ className, compact = false }: IHeroActionsProps = {}): JSX.Element {
  const { openAuthModal } = useModalStore();
  const t = useTranslations('homepage');

  const config = getSubscriptionConfig();
  const hasTrialEnabled = config.plans.some(plan => plan.trial.enabled);
  const handlePrimaryClick = () => {
    analytics.track('hero_upload_cta_clicked', {
      location: 'homepage_hero',
      destination: 'register_modal',
      copyVariant: hasTrialEnabled ? 'fix_images_free' : 'upscale_first_image',
    });
    openAuthModal('register');
  };

  const handleSignInClick = () => {
    analytics.track('hero_upload_cta_clicked', {
      location: 'homepage_hero',
      destination: 'login_modal',
      copyVariant: 'sign_in',
    });
    openAuthModal('login');
  };

  const buttonSize = compact
    ? 'w-full px-5 py-3 text-sm sm:w-auto lg:px-8 lg:py-4 lg:text-base'
    : 'px-8 py-4';

  return (
    <div
      className={`flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center ${className ?? 'mt-10'}`}
    >
      <button
        onClick={handlePrimaryClick}
        className={`group inline-flex items-center justify-center gap-2 font-semibold text-white rounded-xl transition-all duration-200 gradient-cta shine-effect hover:scale-[1.02] active:scale-[0.98] ${buttonSize}`}
      >
        <Sparkles size={compact ? 18 : 20} className="group-hover:rotate-12 transition-transform" />
        {hasTrialEnabled ? t('ctaFixImages') : t('ctaUpscaleFirst')}
        <ArrowRight
          size={compact ? 16 : 18}
          className="group-hover:translate-x-1 transition-transform"
        />
      </button>
      <button
        onClick={handleSignInClick}
        className={`hidden items-center justify-center gap-2 glass-strong font-semibold text-white rounded-xl transition-all duration-200 hover:bg-white/5 hover:scale-[1.02] active:scale-[0.98] sm:inline-flex ${buttonSize}`}
      >
        {t('ctaSignIn')}
      </button>
    </div>
  );
}
