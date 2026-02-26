'use client';

import { useModalStore } from '@client/store/modalStore';
import { getSubscriptionConfig } from '@shared/config/subscription.config';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useTranslations } from 'next-intl';

export function HeroActions(): JSX.Element {
  const { openAuthModal } = useModalStore();
  const t = useTranslations('homepage');

  const config = getSubscriptionConfig();
  const hasTrialEnabled = config.plans.some(plan => plan.trial.enabled);

  return (
    <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
      <button
        onClick={() => openAuthModal('register')}
        className="group inline-flex items-center gap-2 px-8 py-4 text-white font-semibold rounded-xl transition-all duration-200 gradient-cta shine-effect hover:scale-[1.02] active:scale-[0.98]"
      >
        <Sparkles size={20} className="group-hover:rotate-12 transition-transform" />
        {hasTrialEnabled ? t('ctaFixImages') : t('ctaUpscaleFirst')}
        <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
      </button>
      <button
        onClick={() => openAuthModal('login')}
        className="inline-flex items-center gap-2 px-8 py-4 glass-strong hover:bg-white/5 text-white font-semibold rounded-xl transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
      >
        {t('ctaSignIn')}
      </button>
    </div>
  );
}
